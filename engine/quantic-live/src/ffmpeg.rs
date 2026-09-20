use std::{
    io::Read,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::mpsc::{self, Receiver},
    thread,
};

use anyhow::{anyhow, Context, Result};
use chrono::Local;

use crate::model::{Encoder, Settings};

pub fn ffmpeg_available(path: &str) -> bool {
    Command::new(path)
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

pub fn detect_encoder(path: &str) -> Encoder {
    let output = Command::new(path)
        .args(["-hide_banner", "-encoders"])
        .output();

    let Ok(output) = output else {
        return Encoder::X264;
    };
    let text = String::from_utf8_lossy(&output.stdout);

    if text.contains("h264_nvenc") {
        Encoder::NvencH264
    } else if text.contains("h264_amf") {
        Encoder::AmfH264
    } else if text.contains("h264_qsv") {
        Encoder::QuickSyncH264
    } else {
        Encoder::X264
    }
}

fn encoder_args(encoder: Encoder, settings: &Settings) -> Vec<String> {
    let selected = if encoder == Encoder::Auto {
        detect_encoder(&settings.ffmpeg_path)
    } else {
        encoder
    };

    let bitrate = format!("{}k", settings.bitrate_kbps);
    let maxrate = format!("{}k", settings.bitrate_kbps);
    let bufsize = format!("{}k", settings.bitrate_kbps * 2);

    match selected {
        Encoder::NvencH264 => vec![
            "-c:v".into(), "h264_nvenc".into(),
            "-preset".into(), "p5".into(),
            "-tune".into(), "ll".into(),
            "-rc".into(), "cbr".into(),
            "-b:v".into(), bitrate,
            "-maxrate".into(), maxrate,
            "-bufsize".into(), bufsize,
        ],
        Encoder::AmfH264 => vec![
            "-c:v".into(), "h264_amf".into(),
            "-usage".into(), "lowlatency".into(),
            "-rc".into(), "cbr".into(),
            "-b:v".into(), bitrate,
            "-maxrate".into(), maxrate,
            "-bufsize".into(), bufsize,
        ],
        Encoder::QuickSyncH264 => vec![
            "-c:v".into(), "h264_qsv".into(),
            "-preset".into(), "veryfast".into(),
            "-b:v".into(), bitrate,
            "-maxrate".into(), maxrate,
            "-bufsize".into(), bufsize,
        ],
        Encoder::X264 | Encoder::Auto => vec![
            "-c:v".into(), "libx264".into(),
            "-preset".into(), "veryfast".into(),
            "-tune".into(), "zerolatency".into(),
            "-b:v".into(), bitrate,
            "-maxrate".into(), maxrate,
            "-bufsize".into(), bufsize,
        ],
    }
}

fn capture_args(settings: &Settings) -> Vec<String> {
    let mut args = vec![
        "-hide_banner".into(),
        "-loglevel".into(), "warning".into(),
        "-f".into(), "gdigrab".into(),
        "-framerate".into(), settings.fps.to_string(),
        "-draw_mouse".into(), "1".into(),
        "-i".into(), "desktop".into(),
    ];

    if !settings.audio_device.trim().is_empty() {
        args.extend([
            "-f".into(), "dshow".into(),
            "-i".into(), format!("audio={}", settings.audio_device.trim()),
        ]);
    } else {
        args.extend([
            "-f".into(), "lavfi".into(),
            "-i".into(), "anullsrc=channel_layout=stereo:sample_rate=48000".into(),
        ]);
    }

    args.extend([
        "-map".into(), "0:v:0".into(),
        "-map".into(), "1:a:0".into(),
        "-vf".into(), format!(
            "scale={}:{}:force_original_aspect_ratio=decrease,pad={}:{}:(ow-iw)/2:(oh-ih)/2",
            settings.width, settings.height, settings.width, settings.height
        ),
        "-pix_fmt".into(), "yuv420p".into(),
        "-g".into(), (settings.fps * 2).to_string(),
        "-keyint_min".into(), (settings.fps * 2).to_string(),
    ]);

    args.extend(encoder_args(settings.encoder, settings));
    args.extend([
        "-c:a".into(), "aac".into(),
        "-b:a".into(), "160k".into(),
        "-ar".into(), "48000".into(),
        "-ac".into(), "2".into(),
    ]);
    args
}

pub fn start_stream(settings: &Settings) -> Result<Child> {
    if !cfg!(target_os = "windows") {
        return Err(anyhow!("La capture de bureau V0.1 est actuellement ciblée Windows."));
    }
    if settings.stream_key.trim().is_empty() {
        return Err(anyhow!("Ajoute une clé de stream avant de lancer le direct."));
    }
    if !ffmpeg_available(&settings.ffmpeg_path) {
        return Err(anyhow!("FFmpeg est introuvable : vérifie son chemin dans Réglages."));
    }

    let destination = format!(
        "{}/{}",
        settings.rtmp_url.trim_end_matches('/'),
        settings.stream_key.trim_start_matches('/')
    );

    let mut args = capture_args(settings);
    args.extend(["-f".into(), "flv".into(), destination]);

    Command::new(&settings.ffmpeg_path)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .context("Impossible de lancer FFmpeg pour le direct")
}

pub fn start_recording(settings: &Settings) -> Result<(Child, PathBuf)> {
    if !cfg!(target_os = "windows") {
        return Err(anyhow!("La capture de bureau V0.1 est actuellement ciblée Windows."));
    }
    if !ffmpeg_available(&settings.ffmpeg_path) {
        return Err(anyhow!("FFmpeg est introuvable : vérifie son chemin dans Réglages."));
    }

    let directory = Path::new(&settings.recording_dir);
    std::fs::create_dir_all(directory).context("Impossible de créer le dossier d’enregistrement")?;
    let file = directory.join(format!(
        "quantic-live-{}.mkv",
        Local::now().format("%Y-%m-%d_%H-%M-%S")
    ));

    let mut args = capture_args(settings);
    args.extend([
        "-f".into(), "matroska".into(),
        file.to_string_lossy().into_owned(),
    ]);

    let child = Command::new(&settings.ffmpeg_path)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .context("Impossible de lancer FFmpeg pour l’enregistrement")?;

    Ok((child, file))
}

pub fn stop_gracefully(child: &mut Child) {
    use std::{io::Write, time::{Duration, Instant}};

    if let Some(stdin) = child.stdin.as_mut() {
        let _ = stdin.write_all(b"q\n");
        let _ = stdin.flush();
    }

    let deadline = Instant::now() + Duration::from_secs(3);
    while Instant::now() < deadline {
        match child.try_wait() {
            Ok(Some(_)) => return,
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(_) => break,
        }
    }

    let _ = child.kill();
    let _ = child.wait();
}

pub struct PreviewEngine {
    pub child: Child,
    pub rx: Receiver<Vec<u8>>,
}

impl PreviewEngine {
    pub fn start(settings: &Settings, preview_file: Option<PathBuf>) -> Result<Self> {
        if !cfg!(target_os = "windows") {
            return Err(anyhow!("L’aperçu bureau V0.1 est ciblé Windows."));
        }
        if !ffmpeg_available(&settings.ffmpeg_path) {
            return Err(anyhow!("FFmpeg est introuvable."));
        }

        let mut child = Command::new(&settings.ffmpeg_path)
            .args([
                "-hide_banner", "-loglevel", "error",
                "-f", "gdigrab",
                "-framerate", "10",
                "-draw_mouse", "1",
                "-i", "desktop",
                "-vf", "scale=960:-2",
                "-q:v", "7",
                "-f", "image2pipe",
                "-vcodec", "mjpeg",
                "pipe:1",
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .context("Impossible de lancer l’aperçu FFmpeg")?;

        let stdout = child.stdout.take().context("Flux aperçu indisponible")?;
        let (tx, rx) = mpsc::sync_channel::<Vec<u8>>(2);

        thread::spawn(move || {
            let mut reader = std::io::BufReader::new(stdout);
            let mut temp = [0_u8; 16 * 1024];
            let mut buffer: Vec<u8> = Vec::with_capacity(256 * 1024);

            loop {
                let Ok(n) = reader.read(&mut temp) else { break };
                if n == 0 { break; }
                buffer.extend_from_slice(&temp[..n]);

                while let Some(end) = find_jpeg_end(&buffer) {
                    let frame: Vec<u8> = buffer.drain(..end).collect();
                    if let Some(path) = preview_file.as_ref() {
                        let temporary = path.with_extension("jpg.tmp");
                        if let Some(parent) = path.parent() {
                            let _ = std::fs::create_dir_all(parent);
                        }
                        if std::fs::write(&temporary, &frame).is_ok() {
                            if path.exists() {
                                let _ = std::fs::remove_file(path);
                            }
                            let _ = std::fs::rename(&temporary, path);
                        }
                    }
                    if tx.try_send(frame).is_err() {
                        // UI has not consumed the previous frame yet. Drop this one.
                    }
                }

                if buffer.len() > 8 * 1024 * 1024 {
                    buffer.clear();
                }
            }
        });

        Ok(Self { child, rx })
    }

    pub fn stop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn find_jpeg_end(buf: &[u8]) -> Option<usize> {
    buf.windows(2)
        .position(|w| w == [0xFF, 0xD9])
        .map(|index| index + 2)
}
