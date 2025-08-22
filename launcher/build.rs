fn main() {
    // Embed Windows icon into the PE so explorer/taskbar uses it even before runtime.
    #[cfg(target_os = "windows")]
    {
        let mut res = winres::WindowsResource::new();
        res.set_icon("..\\assets\\icon.ico");
        let _ = res.compile();
    }
}


