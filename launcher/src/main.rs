#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use eframe::egui::{self, Align, Layout};
use eframe::egui::RichText;
use eframe::egui::IconData;

#[derive(Default)]
struct AppState {
    // Dialog server children
    memory_server: Option<Child>,
    main_server: Option<Child>,
    frd_proc: Option<Child>,

    // Agent server child
    agent_server: Option<Child>,

    // UI lock and chain tracking
    ui_lock: UiLock,
    // Config page chain process (when started via python)
    config_proc: Option<Child>,
    // Debug first phase process: main_server --open-browser --page api_key
    debug_api_proc: Option<Child>,
    // Debug second phase flag to monitor main_server until it exits
    debug_chain_started: bool,

    // UI flags
    show_chat_require_dialog: bool,
}

impl AppState {
    fn is_dialog_running(&self) -> bool {
        self.memory_server.is_some() || self.main_server.is_some()
    }

    fn is_agent_running(&self) -> bool {
        self.agent_server.is_some()
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum UiLock {
    None,
    Chat,
    Config,
    Debug,
}

impl Default for UiLock {
    fn default() -> Self { UiLock::None }
}

fn project_root() -> PathBuf {
    // Resolve project root robustly:
    // - If exe is at project root (same dir as main_server.py), return that dir
    // - Else if exe is under launcher/target/... return its parent directories until root
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            // Case 1: launcher.exe copied to project root (same folder as main_server.py)
            let direct_main = exe_dir.join("main_server.py");
            let direct_env = exe_dir.join("env").join("python.exe");
            if direct_main.exists() && direct_env.exists() {
                return exe_dir.to_path_buf();
            }
            // Case 2: running from launcher/target/... -> walk up looking for markers
            let mut dir = exe_dir.to_path_buf();
            for _ in 0..8 {
                let req = dir.join("requirements.txt");
                let main_py = dir.join("main_server.py");
                if req.exists() && main_py.exists() {
                    return dir;
                }
                if let Some(parent) = dir.parent() { dir = parent.to_path_buf(); } else { break; }
            }
        }
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn python_path(root: &PathBuf) -> PathBuf {
    root.join("env").join("python.exe")
}

fn spawn_memory_and_main(root: &PathBuf) -> (Option<Child>, Option<Child>) {
    let python = python_path(root);
    let spawn_child = |script: &str, args: &[&str]| -> Option<Child> {
        let mut cmd = Command::new(&python);
        cmd.current_dir(root)
            .arg(script)
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        
        cmd.spawn().ok()
    };
    let mem = spawn_child("memory_server.py", &[]);
    let main = spawn_child("main_server.py", &[]);
    (mem, main)
}

fn spawn_memory_with_shutdown(root: &PathBuf) -> Option<Child> {
    let python = python_path(root);
    let mut cmd = Command::new(&python);
    cmd.current_dir(root)
        .arg("memory_server.py")
        .arg("--enable-shutdown")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    
    cmd.spawn().ok()
}

fn spawn_main_with_open_index(root: &PathBuf) -> Option<Child> {
    let python = python_path(root);
    let mut cmd = Command::new(&python);
    cmd.current_dir(root)
        .arg("main_server.py")
        .arg("--open-browser")
        .arg("--page")
        .arg("index")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    
    cmd.spawn().ok()
}

fn spawn_main_with_open_api_key(root: &PathBuf) -> Option<Child> {
    let python = python_path(root);
    let mut cmd = Command::new(&python);
    cmd.current_dir(root)
        .arg("main_server.py")
        .arg("--open-browser")
        .arg("--page")
        .arg("api_key")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    
    cmd.spawn().ok()
}

fn spawn_main_with_open_chara_manager(root: &PathBuf) -> Option<Child> {
    let python = python_path(root);
    let mut cmd = Command::new(&python);
    cmd.current_dir(root)
        .arg("main_server.py")
        .arg("--open-browser")
        .arg("--page")
        .arg("chara_manager")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    
    cmd.spawn().ok()
}

fn spawn_lanlan_frd(root: &PathBuf) -> Option<Child> {
    let exe = root.join("lanlan_frd.exe");
    Command::new(exe)
        .current_dir(root)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .ok()
}

fn kill_child(child: &mut Option<Child>) {
    if let Some(proc_child) = child.as_mut() {
        #[cfg(windows)]
        {
            let pid = proc_child.id();
            let _ = Command::new("taskkill")
                .args(["/PID", &format!("{}", pid), "/T", "/F"]) 
                .status();
        }
        #[cfg(not(windows))]
        {
            let _ = proc_child.kill();
        }
        let _ = proc_child.wait();
    }
    *child = None;
}

fn spawn_agent(root: &PathBuf) -> Option<Child> {
    let python = python_path(root);
    let mut cmd = Command::new(python);
    cmd.current_dir(root)
        .arg("agent_server.py")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    
    cmd.spawn().ok()
}

fn open_config_page(root: &PathBuf, dialog_running: bool) {
    if dialog_running {
        let _ = open::that("http://localhost:48911/chara_manager");
    } else {
        let python = python_path(root);
        let mut cmd = Command::new(python);
        cmd.current_dir(root)
            .arg("main_server.py")
            .arg("--open-browser")
            .arg("--page")
            .arg("chara_manager")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        
        let _ = cmd.spawn();
    }
}

fn try_load_cjk_font_bytes() -> Option<Vec<u8>> {
    let candidates = [
        // Prefer TTF to avoid TTC parsing issues
        "C:\\Windows\\Fonts\\simhei.ttf",
        "C:/Windows/Fonts/simhei.ttf",
        // Fallbacks (may be TTC)
        "C:\\Windows\\Fonts\\msyh.ttc",
        "C:/Windows/Fonts/msyh.ttc",
        "C:\\Windows\\Fonts\\simsun.ttc",
        "C:/Windows/Fonts/simsun.ttc",
    ];
    for p in candidates.iter() {
        let path = Path::new(p);
        if path.exists() {
            if let Ok(bytes) = std::fs::read(path) {
                return Some(bytes);
            }
        }
    }
    None
}

fn setup_fonts(ctx: &egui::Context) {
    if let Some(bytes) = try_load_cjk_font_bytes() {
        let mut fonts = egui::FontDefinitions::default();
        fonts.font_data.insert(
            "cjk".to_owned(),
            egui::FontData::from_owned(bytes),
        );
        fonts
            .families
            .entry(egui::FontFamily::Proportional)
            .or_default()
            .insert(0, "cjk".to_owned());
        fonts
            .families
            .entry(egui::FontFamily::Monospace)
            .or_default()
            .insert(0, "cjk".to_owned());
        ctx.set_fonts(fonts);
    }
}

fn setup_theme(ctx: &egui::Context) {
    let mut visuals = egui::Visuals::dark();
    visuals.panel_fill = egui::Color32::from_rgb(34, 36, 42);
    visuals.window_fill = egui::Color32::from_rgb(28, 30, 36);
    visuals.widgets.inactive.rounding = 8.0.into();
    visuals.widgets.hovered.rounding = 8.0.into();
    visuals.widgets.active.rounding = 8.0.into();
    visuals.selection.bg_fill = egui::Color32::from_rgb(64, 68, 72);
    ctx.set_visuals(visuals);

    let mut style = (*ctx.style()).clone();
    use eframe::egui::{FontFamily, FontId, TextStyle};
    style.text_styles.insert(TextStyle::Heading, FontId::new(24.0, FontFamily::Proportional));
    style.text_styles.insert(TextStyle::Body, FontId::new(16.0, FontFamily::Proportional));
    style.spacing.item_spacing = egui::vec2(12.0, 14.0);
    style.spacing.button_padding = egui::vec2(16.0, 12.0);
    ctx.set_style(style);
}

struct LauncherApp {
    state: Arc<Mutex<AppState>>,
    root: PathBuf,
}

impl eframe::App for LauncherApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        ctx.request_repaint_after(std::time::Duration::from_millis(200));
        
        let mut state_guard = self.state.lock().unwrap();

        // Always poll chat process (even without UI lock) so the button can auto-reset when external close happens
        if let Some(child) = state_guard.frd_proc.as_mut() {
            if let Ok(Some(_)) = child.try_wait() {
                state_guard.frd_proc = None;
            }
        }
        if state_guard.ui_lock == UiLock::Config {
            if let Some(child) = state_guard.config_proc.as_mut() {
                if let Ok(Some(_)) = child.try_wait() {
                    state_guard.config_proc = None;
                    state_guard.ui_lock = UiLock::None;
                }
            } else {
                state_guard.ui_lock = UiLock::None;
            }
        }
        if state_guard.ui_lock == UiLock::Debug {
            if let Some(child) = state_guard.debug_api_proc.as_mut() {
                if let Ok(Some(_)) = child.try_wait() {
                    state_guard.debug_api_proc = None;
                    // Start chain: memory + wait + main(index)
                    let root_clone = self.root.clone();
                    let state_clone = Arc::clone(&self.state);
                    state_guard.debug_chain_started = true;
                    thread::spawn(move || {
                        // Start memory if not running
                        if let Ok(mut st) = state_clone.lock() {
                            if st.memory_server.is_none() {
                                st.memory_server = spawn_memory_with_shutdown(&root_clone);
                            }
                        }
                        thread::sleep(Duration::from_secs(5));
                        let main = spawn_main_with_open_index(&root_clone);
                        if let Ok(mut st) = state_clone.lock() {
                            st.main_server = main;
                        }
                    });
                }
            } else if state_guard.debug_chain_started {
                if let Some(child) = state_guard.main_server.as_mut() {
                    if let Ok(Some(_)) = child.try_wait() {
                        state_guard.main_server = None;
                        state_guard.memory_server = None;
                        state_guard.debug_chain_started = false;
                        state_guard.ui_lock = UiLock::None;
                    }
                }
            }
        }

        egui::CentralPanel::default().show(ctx, |_ui| {});
        // Absolute centered area overlay for true center (both directions)
        egui::Area::new("controls_center".into())
            .anchor(egui::Align2::CENTER_CENTER, egui::vec2(0.0, 0.0))
            .show(ctx, |ui| {
                let bw = 200.0;    // button width
                let h_chat = 42.0; // chat button height
                let h_btn = 38.0;  // other buttons height
                let gap = 8.0;     // vertical gap

                ui.with_layout(Layout::top_down(egui::Align::Center), |ui| {
                    // Top: Chat control (no longer locks other UI)
                    let chat_running = state_guard.frd_proc.is_some();
                    let color_neutral = egui::Color32::from_rgb(74, 78, 84);
                    let color_stop = egui::Color32::from_rgb(231, 76, 60);   // red
                    let chat_color = if chat_running { color_stop } else { color_neutral };
                    let chat_text = if chat_running {
                        RichText::new("结束聊天").color(egui::Color32::WHITE)
                    } else {
                        RichText::new("开始聊天").color(egui::Color32::WHITE)
                    };
                    let chat_enabled = state_guard.ui_lock == UiLock::None;
                    if ui.add_enabled(chat_enabled, egui::Button::new(chat_text).min_size(egui::vec2(bw, h_chat)).fill(chat_color)).clicked() {
                        if chat_running {
                            // End chat by killing lanlan_frd.exe only
                            kill_child(&mut state_guard.frd_proc);
                        } else {
                            // Require dialog server first
                            if !state_guard.is_dialog_running() {
                                state_guard.show_chat_require_dialog = true;
                            } else {
                                state_guard.frd_proc = spawn_lanlan_frd(&self.root);
                            }
                        }
                    }

                    ui.add_space(4.0);
                    ui.separator();
                    ui.add_space(4.0);

                    // Disable rest of UI when locked
                    let everything_enabled = state_guard.ui_lock == UiLock::None;
                    ui.add_enabled_ui(everything_enabled, |ui| {
                        // (1) Dialog server toggle
                        let dialog_running = state_guard.is_dialog_running();
                        let color_neutral = egui::Color32::from_rgb(74, 78, 84);
                        let color_running = egui::Color32::from_rgb(46, 204, 113); // green
                        if !dialog_running {
                            if ui.add_sized([bw, h_btn], egui::Button::new(RichText::new("启动对话服务器").color(egui::Color32::WHITE)).fill(color_neutral)).clicked() {
                                let (mem, main) = spawn_memory_and_main(&self.root);
                                state_guard.memory_server = mem;
                                state_guard.main_server = main;
                            }
                        } else {
                            if ui.add_sized([bw, h_btn], egui::Button::new(RichText::new("关闭对话服务器").color(egui::Color32::BLACK)).fill(color_running)).clicked() {
                                kill_child(&mut state_guard.main_server);
                                kill_child(&mut state_guard.memory_server);
                            }
                        }

                        // (2) Agent server toggle
                        let agent_running = state_guard.is_agent_running();
                        if !agent_running {
                            if ui.add_sized([bw, h_btn], egui::Button::new(RichText::new("启动Agent服务器").color(egui::Color32::WHITE)).fill(color_neutral)).clicked() {
                                state_guard.agent_server = spawn_agent(&self.root);
                            }
                        } else {
                            if ui.add_sized([bw, h_btn], egui::Button::new(RichText::new("关闭Agent服务器").color(egui::Color32::BLACK)).fill(color_running)).clicked() {
                                kill_child(&mut state_guard.agent_server);
                            }
                        }

                        // (3) Config page
                        let config_label = if state_guard.ui_lock == UiLock::Config { "配置中" } else { "启动配置页" };
                        if ui.add_sized([bw, h_btn], egui::Button::new(RichText::new(config_label).color(egui::Color32::WHITE)).fill(color_neutral)).clicked() {
                            // Lock during config if we need to spawn a dedicated main to open a page
                            let dialog_running = state_guard.is_dialog_running();
                            if !dialog_running {
                                state_guard.ui_lock = UiLock::Config;
                                state_guard.config_proc = spawn_main_with_open_chara_manager(&self.root);
                            } else {
                                open_config_page(&self.root, dialog_running);
                            }
                        }
                        ui.add_space(4.0);
                        ui.separator();
                        ui.add_space(4.0);
                        let debug_label = if state_guard.ui_lock == UiLock::Debug { "调试模式启动中" } else { "启动调试模式" };
                        let debug_btn = egui::Button::new(RichText::new(debug_label).color(egui::Color32::WHITE))
                            .fill(egui::Color32::from_rgb(40, 44, 48));
                        if ui.add_sized([bw, h_btn], debug_btn).clicked() {
                            state_guard.ui_lock = UiLock::Debug;
                            state_guard.debug_chain_started = false;
                            state_guard.debug_api_proc = spawn_main_with_open_api_key(&self.root);
                        }
                    }); // end enabled_ui
                });
            });

        // Show requirement dialog for chat
        if state_guard.show_chat_require_dialog {
            egui::Window::new("提示")
                .collapsible(false)
                .resizable(false)
                .anchor(egui::Align2::CENTER_CENTER, egui::vec2(0.0, 0.0))
                .show(ctx, |ui| {
                    ui.label("开始聊天前，请先启动对话服务器！");
                    if ui.button("确定").clicked() {
                        state_guard.show_chat_require_dialog = false;
                    }
                });
        }
    }

    fn on_exit(&mut self, _gl: std::option::Option<&eframe::glow::Context>) {
        if let Ok(mut st) = self.state.lock() {
            kill_child(&mut st.frd_proc);
            kill_child(&mut st.main_server);
            kill_child(&mut st.memory_server);
            kill_child(&mut st.agent_server);
        }
    }
}

impl Drop for LauncherApp {
    fn drop(&mut self) {
        if let Ok(mut st) = self.state.lock() {
            kill_child(&mut st.frd_proc);
            kill_child(&mut st.main_server);
            kill_child(&mut st.memory_server);
            kill_child(&mut st.agent_server);
            kill_child(&mut st.config_proc);
            kill_child(&mut st.debug_api_proc);
        }
    }
}

fn main() -> eframe::Result<()> {
    let mut options = eframe::NativeOptions::default();
    options.viewport = eframe::egui::ViewportBuilder::default()
        .with_inner_size([320.0, 360.0])
        .with_min_inner_size([300.0, 340.0]);
    // Try set icon for taskbar/window
    if let Ok(bytes) = std::fs::read(project_root().join("assets").join("icon.ico")) {
        if let Ok(image) = image::load_from_memory(&bytes) {
            let rgba = image.to_rgba8();
            let (w, h) = rgba.dimensions();
            options.viewport = options.viewport.clone().with_icon(IconData { width: w as u32, height: h as u32, rgba: rgba.into_raw() });
        }
    }
    let root = project_root();
    eframe::run_native(
        "Lanlan Launcher",
        options,
        Box::new(move |cc| {
            setup_fonts(&cc.egui_ctx);
            setup_theme(&cc.egui_ctx);
            Ok(Box::new(LauncherApp {
                state: Arc::new(Mutex::new(AppState::default())),
                root: root.clone(),
            }))
        }),
    )
}
