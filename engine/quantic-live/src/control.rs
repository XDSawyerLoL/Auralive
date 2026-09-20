use std::{
    env,
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};

use crate::model::SourceTransform;

#[derive(Debug, Clone, Deserialize)]
pub struct ControlCommand {
    pub id: u64,
    pub action: String,
    #[serde(default)]
    pub value: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SourceStatus {
    pub id: u64,
    pub name: String,
    pub kind: String,
    pub visible: bool,
    pub transform: SourceTransform,
    pub target: String,
}

#[derive(Debug, Serialize)]
pub struct EngineStatus<'a> {
    pub ok: bool,
    pub engine: &'static str,
    pub version: &'static str,
    pub last_command_id: u64,
    pub streaming: bool,
    pub recording: bool,
    pub preview: bool,
    pub scene: &'a str,
    pub scenes: Vec<String>,
    pub sources: Vec<SourceStatus>,
    pub mic_volume: f32,
    pub desktop_volume: f32,
    pub system_volume: f32,
    pub mic_muted: bool,
    pub desktop_muted: bool,
    pub system_muted: bool,
    pub canvas_width: u32,
    pub canvas_height: u32,
    pub ffmpeg_ok: bool,
    pub capture_backend: &'a str,
    pub encoder: &'a str,
    pub message: &'a str,
}

pub fn config_path() -> PathBuf {
    env_path("AURA_NATIVE_CONFIG_FILE")
        .unwrap_or_else(|| PathBuf::from("quantic-live.json"))
}

fn command_path() -> Option<PathBuf> {
    env_path("AURA_NATIVE_CONTROL_FILE")
}

fn status_path() -> Option<PathBuf> {
    env_path("AURA_NATIVE_STATUS_FILE")
}

pub fn preview_path() -> Option<PathBuf> {
    env_path("AURA_NATIVE_PREVIEW_FILE")
}

pub fn local_base_url() -> String {
    env::var("AURA_LOCAL_BASE_URL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "http://127.0.0.1:18787".to_owned())
        .trim_end_matches('/')
        .to_owned()
}

fn env_path(name: &str) -> Option<PathBuf> {
    env::var_os(name)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

pub fn read_command(last_id: u64) -> Option<ControlCommand> {
    let path = command_path()?;
    let content = fs::read_to_string(path).ok()?;
    let command: ControlCommand = serde_json::from_str(&content).ok()?;
    (command.id > last_id).then_some(command)
}

pub fn write_status(status: &EngineStatus<'_>) {
    let Some(path) = status_path() else {
        return;
    };
    let Ok(payload) = serde_json::to_vec_pretty(status) else {
        return;
    };
    let _ = atomic_write(&path, &payload);
}

pub fn ensure_parent(path: &Path) {
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
}

fn atomic_write(path: &Path, payload: &[u8]) -> std::io::Result<()> {
    ensure_parent(path);
    let temporary = path.with_extension("tmp");
    fs::write(&temporary, payload)?;
    if path.exists() {
        let _ = fs::remove_file(path);
    }
    fs::rename(temporary, path)
}
