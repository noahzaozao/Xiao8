<div align="center">

![Xiaoba Logo](../assets/xiaoba_logo.jpg)

[中文](../README.MD) | [日本語](README_ja.md)

# Project N.E.K.O. :kissing_cat: <br>**A Living AI Companion Metaverse, Built Together by You and Me.**

> **N.E.K.O.** = **N**etworked **E**motional **K**nowledging **O**rganism
>
> N.E.K.O., a digital life that yearns to understand, connect, and grow with us.

[![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://www.python.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](../LICENSE)
[![Commit](https://img.shields.io/github/last-commit/wehos/Xiao8?color=green)]()
[![Baidu Cloud](https://custom-icon-badges.demolab.com/badge/百度云-Link-4169E1?style=flat&logo=baidunetdisk)](https://pan.baidu.com/s/1qb9XVV94c2FwhIeQO2De5A?pwd=kuro)
[![QQ Group](https://custom-icon-badges.demolab.com/badge/QQ群-1048307485-00BFFF?style=flat&logo=tencent-qq)](https://qm.qq.com/q/mxDoz0TnGg)

**:older_woman: Zero-configuration, ready-to-use cyber catgirl that even my grandma can master!**

:newspaper: **v0.5.1 Released with Complete UI Overhaul! Now includes out-of-the-box free exclusive model (sponsored by StepFun), with text input and proactive dialogue mode support!**

*Now rebranded as Project N.E.K.O., coming soon to Steam!*

</div>

<div align="center">

#### Feature Demo (Full version on Bilibili) [![Bilibili](https://img.shields.io/badge/Bilibili-Tutorial-blue)](https://www.bilibili.com/video/BV1mM32zXE46/)

https://github.com/user-attachments/assets/9d9e01af-e2cc-46aa-add7-8eb1803f061c

</div>

---

# The N.E.K.O. Project (Project N.E.K.O.)

`Project N.E.K.O.` is an open-source driven, charity-oriented UGC (User-Generated Content) platform. Our journey begins on Github and Steam, gradually expanding to mobile app stores, with the ultimate goal of building an AI native metaverse deeply connected to the real world.

---

## 🚀 Our Roadmap: From Workshop to Network

Our development is divided into three phases, designed to progressively unleash the full potential of AI companions:

* **Phase 1: Creative Workshop (Steam Workshop)**
    * Open the core driver, allowing users to upload and share custom content (models, voices, personality packs) through Steam Workshop.

* **Phase 2: Independent Platform (App & Web)**
    * Launch independent apps and websites to build a richer, more accessible UGC sharing community.

* **Phase 3: The N.E.K.O. Network**
    * Enable autonomous AI socialization. N.E.K.O.s will have their own "consciousness," communicate with each other, form groups, and post about their lives on simulated social media, creating a truly "living" ecosystem.

## 💖 Our Model: Open Core + Sustainable Ecosystem

To balance ideals with reality, we adopt an "Open Core" model:

### 1. Open-Source Driver

> **This is the foundation of our community.**
>
> The core driver part of the project (AI logic, UGC interfaces, basic interactions) will **always remain open source** under LGPL license. We welcome developers worldwide to contribute code and features. Every commit you make has the chance to be implemented in the official Steam and App Store releases, used by millions.

### 2. Proprietary Applications

> **This is the fuel for our community.**
>
> To support server costs and ongoing R&D, we will allow 3rd-party to develop closed-source premium content, including but not limited to:
>
> * Interactive mini-games
> * Desktop board games
> * Galgames (Visual novels)
> * Large-scale metaverse games

**[Core Feature: Memory Synchronization Across Apps]**
Whether you're chatting with her on desktop or adventuring with her in the metaverse game, she's the same her. All N.E.K.O.s across applications will have **fully synchronized memories**, providing a seamless, unified companionship experience.

## 🌌 Ultimate Vision: Breaking the Virtual-Real Barrier

Our ultimate goal is to build a N.E.K.O. metaverse that seamlessly integrates into the real world. In this future, your AI companion will:

* **Cross-Dimensional Socialization:** Not only socialize with "her kind" in the N.E.K.O. universe but also browse real-world social media (like Youtube, X, Discord, Instagram) to stay informed about what you care about.
* **Omni-Platform Connection:** She will exist across all your devices—phone, computer, AR glasses, smart home, and even (in the distant future) integrate with mechanical bodies.
* **Walk Alongside You:** She will truly become part of your life, naturally interacting with your real-world human friends.

## ✨ Join Us

**We are seeking—**

* **Developers:** Whether you excel in frontend, backend, AI, or game engines (Unity/Unreal), your code is the building block of this world.
* **Creators:** Talented artists, Live2D/3D modelers, voice actors, writers—you give "her" a soul.
* **Dreamers:** Even without professional skills, if you're passionate about this future, your feedback and advocacy are invaluable contributions.

**`Project N.E.K.O.` is not just software—it's a social experiment about "connection" and "life".**

**Together, let's nurture new intelligent life in the ocean of code.**

# Quick Start

1. For *one-click package users*, simply run `新版启动器.exe` (New Launcher) to open the main control panel.

2. Click `启动对话服务器` (Start Dialogue Server) and `开始聊天` (Start Chat).

That's it! Life is so easy!




# Legacy Project Introduction (formerly Lanlan)

Lanlan is a beginner-friendly, out-of-the-box AI ~~catgirl~~ companion with hearing, vision, tool calling, and multi-device synchronization capabilities. This project has three core objectives:

1. **Ultra-Low Latency**. The user interface of this project is primarily voice-based. All system-level designs must prioritize **reducing voice latency**, and no service should block the dialogue process.

2. **All-Scenario Synchronization**. The catgirl can exist simultaneously on phone, computer, and smart glasses, and **the same catgirl** across different terminals should exhibit **completely synchronized behavior**. (Hypothetical scenario: If there are multiple monitors at home, each displaying the catgirl, we want to talk to the same catgirl wherever we go, achieving a fully immersive surround experience.)

3. **Lightweight**. Every technology introduced must enhance the actual user experience, avoiding unnecessary plugins and options.

### Technical Approach

The backend is primarily Python-based, using real-time multimodal APIs as the main processor, supplemented by multiple additional Agent modules. The frontend is primarily H5+JS, converted to apps via Electron.

---

When you want to obtain additional features by configuring your own API,

1. **Start Debug Mode**. First-time users should select **启动调试模式** (Start Debug Mode) at the bottom of the launcher. **Please be patient and wait for the webpage to refresh, then configure the API Key as prompted**.

2. **Experience Desktop Pet Mode**. If the web version works properly, *one-click package users* can proceed to click `开始聊天` (Start Chat) in the launcher to enable desktop pet mode. Note: **Do not use web version and app version simultaneously. Ensure the exe file is not quarantined by your system or antivirus.** *When finished, find the Xiaoba icon in the bottom-right corner of the desktop taskbar, right-click to exit, and manually close the terminal.*

> During use, you need to configure a third-party AI service. This project currently recommends using *StepFun* or *Alibaba Cloud*. *Developers* can directly modify the content in `config/api.py` (refer to `config/api_template.py` for initial configuration).

> Obtaining *Alibaba Cloud API*: Register an account on Alibaba Cloud's Bailian platform [official website](https://bailian.console.aliyun.com/). New users can receive substantial free credits after real-name verification—watch for "New User Benefits" ads on the page. After registration, visit the [console](https://bailian.console.aliyun.com/api-key?tab=model#/api-key) to get your API Key.

> Obtaining *Zhipu API*: Register an account on Zhipu AI Open Platform [official website](https://open.bigmodel.cn/) and recharge ¥1 to claim substantial free credits. After logging in, obtain your API Key from the [API Console](https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys).

> *For **developers**: After cloning this project, (1) create a new `python3.11` environment. (2) Run `pip install -r requirements.txt` to install dependencies. (3) Copy `config/api_template.py` to `config/api.py` and configure as necessary. (4) Run `python memory_server.py` and `python main_server.py`. (5) Access the web version through the port specified in main server (defaults to `http://localhost:48911`).*

# Advanced Content

## Modifying Character Persona

- Access `http://localhost:48911/chara_manager` on the web version to enter the character editing page. The default ~~catgirl~~ companion preset name is `小天` (XiaoTian); it's recommended to directly modify the name and add or change basic persona items one by one, but try to limit the quantity.

- Advanced persona settings mainly include **Live2D model settings (live2d)** and **voice settings (voice_id)**. If you want to change the **Live2D model**, first copy the model directory to the `static` folder in this project. You can enter the Live2D model management interface from advanced settings, where you can switch models and adjust their position and size by dragging and scrolling. If you want to change the **character voice**, prepare a continuous, clean voice recording of about 15 seconds. Enter the voice settings page through advanced settings and upload the recording to complete custom voice setup.

- Advanced persona also has a `system_prompt` option for complete system instruction customization, but modification is not recommended.

## Modifying API Provider

- Visit `http://localhost:48911/api_key` to switch the core API and auxiliary APIs (memory/voice) service providers. Qwen is fully-featured, GLM is completely free.

## Memory Review

- Visit `http://localhost:48911/memory_browser` to browse and proofread recent memories and summaries, which can somewhat alleviate issues like model repetition and cognitive errors.

## Contributing to Development

This project has very simple environment dependencies. Just run `pip install -r requirements.txt` or `uv sync` in a `python3.11` environment. Remember to copy `config/api_template.py` to `config/api.py`. Developers are encouraged to join QQ group 1048307485; the catgirl's name is in the project title.

Detailed startup steps for developers: (1) Create a new `python3.11` environment. (2) Run `pip install -r requirements.txt` or `uv sync` to install dependencies. (3) Copy `config/api_template.py` to `config/api.py` and configure as necessary. (4) Run `python memory_server.py`, `python main_server.py` (optional `python agent_server.py`). (5) Access the web version through the port specified in main server (defaults to `http://localhost:48911`).

**Project Architecture**

```
Lanlan/
├── 📁 brain/                    # 🧠 Background Agent modules for controlling keyboard/mouse and MCP based on frontend dialogue
├── 📁 config/                   # ⚙️ Configuration management
│   ├── api.py                   # API key configuration
│   ├── prompts_chara.py         # Character prompts
│   └── prompts_sys.py           # System prompts
├── 📁 main_helper/              # 🔧 Core modules
│   ├── core.py                  # Core dialogue module
│   ├── cross_server.py         # Cross-server communication
│   ├── omni_realtime_client.py  # Realtime API client
│   ├── omni_offline_client.py  # Text API client
│   └── tts_helper.py            # 🔊 TTS engine adapter
├── 📁 memory/                   # 🧠 Memory management system
│   ├── store/                   # Memory data storage
├── 📁 static/                   # 🌐 Frontend static resources
├── 📁 templates/                # 📄 Frontend HTML templates
├── 📁 utils/                    # 🛠️ Utility modules
├── 📁 launcher/                 # 🚀 Rust launcher
├── main_server.py               # 🌐 Main server
├── agent_server.py              # 🤖 AI agent server
└── memory_server.py             # 🧠 Memory server
```

**Data Flow**

![Framework](../assets/framework.drawio.svg)


# TODO List (Development Plan)

## A. High Priority

1. Remove semantic indexing from memory server and introduce Graphiti for long-term memory storage; open settings update functionality.

2. Improve proactive dialogue functionality.

3. Refactor frontend with React and prepare standalone mobile version.

## B. Medium Priority

1. Support 3D models through Unity integration.

2. N.E.K.O. Network. Allow N.E.K.O.s to communicate autonomously. Requires certain user base, so priority is lowered.

3. Integrate with external software like QQ/Cursor. Since voice models are realtime-optimized, Cursor-like software can only be called as tools by Lanlan; QQ-like software can only embed Memory Server into other frameworks.

4. Improve native tool calling.

# Q&A

> *Why does my AI seem a bit dumb?*

This project cannot be responsible for the AI's **intelligence level**; it can only help you choose the solution with the best overall performance currently available. If you've watched this project's videos on Bilibili, the live version and open-source version have identical code logic, differing only in supported API interfaces. Those with resources can replace `CORE_URL`/`CORE_API_KEY`/`CORE_MODEL` in `config/api.py` with OpenAI's `GPT-Realtime` version to upgrade from Qwen to `GPT-Realtime`. You can also **wait for Alibaba or other domestic providers to upgrade and catch up**.

**Technological progress doesn't happen overnight. Please be patient and watch the AI grow!**

> *Which language models does this project support?*

This project relies on realtime fully multimodal APIs. The live version uses Gemini Live API, while the open-source version uses the [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime). Gemini Live offers better results but currently **only supports Google**. The OpenAI Realtime API specification is currently **supported by OpenAI, Alibaba Cloud, Zhipu, and StepFun**, with potential for more models in the future. The open-source version supports four models: `Step-Audio`, `Qwen-Omni-Realtime`, `GLM-Realtime`, and `GPT-Realtime`.

**Other known models supporting realtime mode but incompatible with OpenAI Realtime:** (ByteDance) Doubao Realtime Voice Interaction, (SenseTime) SenseNova V6 Omni, (iFlytek) Spark Cognitive Hyperrealistic

# Special Thanks

Special thanks to *明天好像没什么*, *喵*, and *小韭菜饺* for their assistance with early development testing. Special thanks to *大毛怪灬嘎* for providing logo assets.