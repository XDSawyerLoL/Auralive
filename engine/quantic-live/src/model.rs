use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SourceKind {
    Desktop,
    Window,
    Game,
    Webcam,
    Image,
    Text,
    Browser,
}

impl SourceKind {
    pub fn slug(&self) -> &'static str {
        match self {
            Self::Desktop => "desktop",
            Self::Window => "window",
            Self::Game => "game",
            Self::Webcam => "webcam",
            Self::Image => "image",
            Self::Text => "text",
            Self::Browser => "browser",
        }
    }

    pub fn from_slug(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "desktop" | "screen" => Some(Self::Desktop),
            "window" => Some(Self::Window),
            "game" => Some(Self::Game),
            "webcam" | "camera" => Some(Self::Webcam),
            "image" => Some(Self::Image),
            "text" => Some(Self::Text),
            "browser" | "overlay" => Some(Self::Browser),
            _ => None,
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            Self::Desktop => "Écran",
            Self::Window => "Fenêtre",
            Self::Game => "Jeu",
            Self::Webcam => "Webcam",
            Self::Image => "Image",
            Self::Text => "Texte",
            Self::Browser => "Navigateur",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceTransform {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

impl Default for SourceTransform {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            width: 1.0,
            height: 1.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Source {
    pub id: u64,
    pub name: String,
    pub kind: SourceKind,
    pub visible: bool,
    #[serde(default)]
    pub transform: SourceTransform,
    #[serde(default)]
    pub target: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Scene {
    pub id: u64,
    pub name: String,
    pub sources: Vec<Source>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum TransitionKind {
    Cut,
    Fade,
}

impl Default for TransitionKind {
    fn default() -> Self {
        Self::Fade
    }
}

impl TransitionKind {
    pub fn label(self) -> &'static str {
        match self {
            Self::Cut => "cut",
            Self::Fade => "fade",
        }
    }

    pub fn from_slug(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "cut" | "instant" => Some(Self::Cut),
            "fade" | "fondu" => Some(Self::Fade),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum Encoder {
    Auto,
    NvencH264,
    AmfH264,
    QuickSyncH264,
    X264,
}

impl Encoder {
    pub fn label(self) -> &'static str {
        match self {
            Self::Auto => "Automatique",
            Self::NvencH264 => "NVIDIA NVENC H.264",
            Self::AmfH264 => "AMD AMF H.264",
            Self::QuickSyncH264 => "Intel Quick Sync H.264",
            Self::X264 => "CPU x264",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub ffmpeg_path: String,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub bitrate_kbps: u32,
    pub encoder: Encoder,
    pub rtmp_url: String,
    pub stream_key: String,
    #[serde(skip)]
    pub stream_destinations: Vec<String>,
    pub audio_device: String,
    pub recording_dir: String,
    #[serde(default)]
    pub transition: TransitionKind,
    #[serde(default = "default_transition_ms")]
    pub transition_ms: u32,
    #[serde(default = "default_replay_seconds")]
    pub replay_seconds: u32,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            ffmpeg_path: "ffmpeg".into(),
            width: 1920,
            height: 1080,
            fps: 60,
            bitrate_kbps: 6000,
            encoder: Encoder::Auto,
            rtmp_url: "rtmp://live.twitch.tv/app".into(),
            stream_key: String::new(),
            stream_destinations: Vec::new(),
            audio_device: String::new(),
            recording_dir: "recordings".into(),
            transition: TransitionKind::Fade,
            transition_ms: default_transition_ms(),
            replay_seconds: default_replay_seconds(),
        }
    }
}

fn default_system_volume() -> f32 {
    0.72
}

fn default_transition_ms() -> u32 {
    350
}

fn default_replay_seconds() -> u32 {
    30
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectState {
    pub scenes: Vec<Scene>,
    pub selected_scene: usize,
    pub settings: Settings,
    pub mic_volume: f32,
    pub desktop_volume: f32,
    #[serde(default = "default_system_volume")]
    pub system_volume: f32,
    pub mic_muted: bool,
    pub desktop_muted: bool,
    #[serde(default)]
    pub system_muted: bool,
}

impl Default for ProjectState {
    fn default() -> Self {
        Self {
            scenes: vec![
                Scene {
                    id: 1,
                    name: "Live".into(),
                    sources: vec![Source {
                        id: 1,
                        name: "Écran principal".into(),
                        kind: SourceKind::Desktop,
                        visible: true,
                        transform: SourceTransform::default(),
                        target: String::new(),
                    }],
                },
                Scene { id: 2, name: "Discussion".into(), sources: vec![] },
                Scene { id: 3, name: "Jeu".into(), sources: vec![] },
                Scene { id: 4, name: "Pause".into(), sources: vec![] },
                Scene { id: 5, name: "Fin".into(), sources: vec![] },
            ],
            selected_scene: 0,
            settings: Settings::default(),
            mic_volume: 0.82,
            desktop_volume: 0.72,
            system_volume: 0.72,
            mic_muted: false,
            desktop_muted: false,
            system_muted: false,
        }
    }
}
