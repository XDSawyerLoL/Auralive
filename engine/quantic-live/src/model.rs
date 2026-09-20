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
pub struct Source {
    pub id: u64,
    pub name: String,
    pub kind: SourceKind,
    pub visible: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Scene {
    pub id: u64,
    pub name: String,
    pub sources: Vec<Source>,
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
    pub audio_device: String,
    pub recording_dir: String,
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
            audio_device: String::new(),
            recording_dir: "recordings".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectState {
    pub scenes: Vec<Scene>,
    pub selected_scene: usize,
    pub settings: Settings,
    pub mic_volume: f32,
    pub desktop_volume: f32,
    pub mic_muted: bool,
    pub desktop_muted: bool,
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
            mic_muted: false,
            desktop_muted: false,
        }
    }
}
