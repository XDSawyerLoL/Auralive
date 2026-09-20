use std::{
    env,
    io::Read,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::mpsc::{self, Receiver},
    thread,
};

use anyhow::{anyhow, Context, Result};
use chrono::Local;

use crate::{
    control,
    model::{Encoder, Scene, Settings, Source, SourceKind, SourceTransform, TransitionKind},
};

#[derive(Debug, Clone, Copy)]
pub struct AudioMix {
    pub mic_volume: f32,
    pub system_volume: f32,
    pub aura_volume: f32,
    pub mic_muted: bool,
    pub system_muted: bool,
    pub aura_muted: bool,
}

impl AudioMix {
    fn mic_gain(self) -> f32 {
        if self.mic_muted { 0.0 } else { self.mic_volume.clamp(0.0, 2.0) }
    }

    fn system_gain(self) -> f32 {
        if self.system_muted { 0.0 } else { self.system_volume.clamp(0.0, 2.0) }
    }

    fn aura_gain(self) -> f32 {
        if self.aura_muted { 0.0 } else { self.aura_volume.clamp(0.0, 2.0) }
    }
}

pub fn ffmpeg_available(path: &str) -> bool {
    Command::new(path)
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

pub fn filter_available(path: &str, filter: &str) -> bool {
    let Ok(output) = Command::new(path)
        .args(["-hide_banner", "-filters"])
        .output()
    else {
        return false;
    };

    let text = String::from_utf8_lossy(&output.stdout);
    text.lines().any(|line| {
        let mut fields = line.split_whitespace();
        let _flags = fields.next();
        fields.next() == Some(filter)
    })
}

pub fn capture_backend_label(path: &str) -> &'static str {
    if filter_available(path, "gfxcapture") {
        "Windows Graphics Capture"
    } else {
        "GDI fallback"
    }
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

struct VideoPipeline {
    args: Vec<String>,
    filter_complex: String,
    output_label: &'static str,
    next_input_index: usize,
}

fn source_geometry(settings: &Settings, transform: &SourceTransform) -> (u32, u32, u32, u32) {
    let width = ((settings.width as f32 * transform.width.clamp(0.05, 1.0)).round() as u32)
        .clamp(2, settings.width.max(2));
    let height = ((settings.height as f32 * transform.height.clamp(0.05, 1.0)).round() as u32)
        .clamp(2, settings.height.max(2));
    let max_x = settings.width.saturating_sub(width);
    let max_y = settings.height.saturating_sub(height);
    let x = ((settings.width as f32 * transform.x.clamp(0.0, 1.0)).round() as u32).min(max_x);
    let y = ((settings.height as f32 * transform.y.clamp(0.0, 1.0)).round() as u32).min(max_y);
    (width, height, x, y)
}

fn source_has_target(source: &Source) -> bool {
    match source.kind {
        SourceKind::Desktop => true,
        SourceKind::Text => !source.target.trim().is_empty() || !source.name.trim().is_empty(),
        _ => !source.target.trim().is_empty(),
    }
}

fn push_video_input(args: &mut Vec<String>, settings: &Settings, source: &Source) {
    let fps = settings.fps.to_string();
    match source.kind {
        SourceKind::Desktop => {
            args.extend([
                "-thread_queue_size".into(), "512".into(),
                "-f".into(), "gdigrab".into(),
                "-framerate".into(), fps,
                "-draw_mouse".into(), "1".into(),
                "-i".into(), "desktop".into(),
            ]);
        }
        SourceKind::Window | SourceKind::Game => {
            args.extend([
                "-thread_queue_size".into(), "512".into(),
                "-f".into(), "gdigrab".into(),
                "-framerate".into(), fps,
                "-draw_mouse".into(), "1".into(),
                "-i".into(), format!("title={}", source.target.trim()),
            ]);
        }
        SourceKind::Webcam => {
            args.extend([
                "-thread_queue_size".into(), "512".into(),
                "-rtbufsize".into(), "256M".into(),
                "-f".into(), "dshow".into(),
                "-i".into(), format!("video={}", source.target.trim()),
            ]);
        }
        SourceKind::Image => {
            args.extend([
                "-loop".into(), "1".into(),
                "-framerate".into(), fps,
                "-i".into(), source.target.trim().to_owned(),
            ]);
        }
        SourceKind::Browser => {
            args.extend([
                "-thread_queue_size".into(), "512".into(),
                "-f".into(), "mpjpeg".into(),
                "-i".into(), format!(
                    "{}/api/broadcast/browser-source/{}.mjpeg",
                    control::local_base_url(),
                    source.id
                ),
            ]);
        }
        SourceKind::Text => {}
    }
}

fn normalize_filter(input_index: usize, source_index: usize, settings: &Settings, source: &Source) -> String {
    let (width, height, _, _) = source_geometry(settings, &source.transform);
    let browser_key = if source.kind == SourceKind::Browser {
        "chromakey=0x00ff00:0.10:0.04,"
    } else {
        ""
    };
    format!(
        "[{input_index}:v]setpts=PTS-STARTPTS,fps={},{}scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black@0,format=rgba[src{source_index}]",
        settings.fps,
        browser_key,
    )
}

fn regex_escape(value: &str) -> String {
    let mut out = String::with_capacity(value.len() * 2);
    for ch in value.chars() {
        if matches!(ch, '\\' | '.' | '^' | '$' | '|' | '?' | '*' | '+' | '(' | ')' | '[' | ']' | '{' | '}') {
            out.push('\\');
        }
        out.push(ch);
    }
    out
}

fn filter_string_escape(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('\'', "\\'")
        .replace(':', "\\:")
        .replace(',', "\\,")
        .replace('[', "\\[")
        .replace(']', "\\]")
}

fn gfxcapture_filter(source_index: usize, settings: &Settings, source: &Source) -> String {
    let (width, height, _, _) = source_geometry(settings, &source.transform);
    let exact_title = format!("(?i)^{}$", regex_escape(source.target.trim()));
    let title = filter_string_escape(&exact_title);

    format!(
        "gfxcapture=window_title='{title}':capture_cursor=1:capture_border=0:display_border=0:max_framerate={},hwdownload,format=bgra,setpts=PTS-STARTPTS,fps={},scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black@0,format=rgba[src{source_index}]",
        settings.fps,
        settings.fps,
    )
}

fn escape_drawtext(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace(':', "\\:")
        .replace('\'', "\\'")
        .replace('%', "\\%")
        .replace('[', "\\[")
        .replace(']', "\\]")
        .replace(',', "\\,")
}

fn windows_font_filter_path() -> String {
    let windows = env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".to_owned());
    let path = format!("{}/Fonts/segoeui.ttf", windows.replace('\\', "/"));
    path.replace(':', "\\:")
}

fn build_video_pipeline(settings: &Settings, scene: &Scene) -> VideoPipeline {
    let mut args = vec![
        "-hide_banner".into(),
        "-loglevel".into(), "warning".into(),
        "-f".into(), "lavfi".into(),
        "-i".into(), format!("color=c=black:s={}x{}:r={}", settings.width, settings.height, settings.fps),
    ];

    let modern_capture = filter_available(&settings.ffmpeg_path, "gfxcapture");
    let mut filters = vec!["[0:v]format=rgba,setpts=PTS-STARTPTS[base0]".to_owned()];
    let mut base_index = 0usize;
    let mut input_index = 1usize;
    let mut source_index = 0usize;

    for source in scene.sources.iter().filter(|source| source.visible && source_has_target(source)) {
        let (_, _, x, y) = source_geometry(settings, &source.transform);

        if source.kind == SourceKind::Text {
            let text = if source.target.trim().is_empty() {
                source.name.trim()
            } else {
                source.target.trim()
            };
            let font_size = ((settings.height as f32 * source.transform.height.clamp(0.05, 1.0) * 0.24)
                .round() as u32)
                .clamp(18, 180);
            let next_base = base_index + 1;
            filters.push(format!(
                "[base{base_index}]drawtext=fontfile='{}':text='{}':fontcolor=white:fontsize={font_size}:x={x}:y={y}:box=1:boxcolor=black@0.30:boxborderw=8[base{next_base}]",
                windows_font_filter_path(),
                escape_drawtext(text),
            ));
            base_index = next_base;
            continue;
        }

        if modern_capture && matches!(source.kind, SourceKind::Window | SourceKind::Game) {
            filters.push(gfxcapture_filter(source_index, settings, source));
        } else {
            push_video_input(&mut args, settings, source);
            filters.push(normalize_filter(input_index, source_index, settings, source));
            input_index += 1;
        }

        let next_base = base_index + 1;
        filters.push(format!(
            "[base{base_index}][src{source_index}]overlay=x={x}:y={y}:eof_action=pass:shortest=0:format=auto[base{next_base}]"
        ));
        base_index = next_base;
        source_index += 1;
    }

    if settings.transition == TransitionKind::Fade && settings.transition_ms > 0 {
        let duration = settings.transition_ms.clamp(80, 3000) as f32 / 1000.0;
        filters.push(format!(
            "[base{base_index}]format=yuv420p,fade=t=in:st=0:d={duration:.3}:color=black[vout]"
        ));
    } else {
        filters.push(format!("[base{base_index}]format=yuv420p[vout]"));
    }

    VideoPipeline {
        args,
        filter_complex: filters.join(";"),
        output_label: "[vout]",
        next_input_index: input_index,
    }
}

fn append_mic_input(args: &mut Vec<String>, settings: &Settings) {
    if !settings.audio_device.trim().is_empty() {
        args.extend([
            "-thread_queue_size".into(), "512".into(),
            "-f".into(), "dshow".into(),
            "-i".into(), format!("audio={}", settings.audio_device.trim()),
        ]);
    } else {
        args.extend([
            "-f".into(), "lavfi".into(),
            "-i".into(), "anullsrc=channel_layout=stereo:sample_rate=48000".into(),
        ]);
    }
}

fn append_system_audio_input(args: &mut Vec<String>) {
    args.extend([
        "-thread_queue_size".into(), "512".into(),
        "-f".into(), "s16le".into(),
        "-ar".into(), "48000".into(),
        "-ac".into(), "2".into(),
        "-i".into(), format!("{}/api/broadcast/system-audio.pcm", control::local_base_url()),
    ]);
}

fn append_aura_audio_input(args: &mut Vec<String>) {
    args.extend([
        "-thread_queue_size".into(), "512".into(),
        "-f".into(), "s16le".into(),
        "-ar".into(), "48000".into(),
        "-ac".into(), "2".into(),
        "-i".into(), format!("{}/api/broadcast/audio.pcm", control::local_base_url()),
    ]);
}

fn mixed_filter(
    video_filter: &str,
    mic_index: usize,
    system_index: usize,
    aura_index: usize,
    audio: AudioMix,
) -> String {
    format!(
        "{video_filter};[{mic_index}:a]volume={:.3}[mic];[{system_index}:a]volume={:.3}[system];[{aura_index}:a]volume={:.3}[aura];[mic][system][aura]amix=inputs=3:duration=longest:dropout_transition=0:normalize=0,aresample=async=1:first_pts=0[aout]",
        audio.mic_gain(),
        audio.system_gain(),
        audio.aura_gain(),
    )
}

fn append_output_encoding(args: &mut Vec<String>, settings: &Settings) {
    args.extend([
        "-pix_fmt".into(), "yuv420p".into(),
        "-g".into(), (settings.fps * 2).to_string(),
        "-keyint_min".into(), (settings.fps * 2).to_string(),
    ]);
    args.extend(encoder_args(settings.encoder, settings));
    args.extend([
        "-c:a".into(), "aac".into(),
        "-b:a".into(), "192k".into(),
        "-ar".into(), "48000".into(),
        "-ac".into(), "2".into(),
    ]);
}

pub fn start_stream(settings: &Settings, scene: &Scene, audio: AudioMix) -> Result<Child> {
    if !cfg!(target_os = "windows") {
        return Err(anyhow!("Le compositeur Aura Native est actuellement ciblé Windows."));
    }
    if !ffmpeg_available(&settings.ffmpeg_path) {
        return Err(anyhow!("FFmpeg est introuvable : vérifie son chemin dans Réglages."));
    }

    let mut destinations: Vec<String> = Vec::new();
    if !settings.stream_key.trim().is_empty() {
        destinations.push(format!(
            "{}/{}",
            settings.rtmp_url.trim_end_matches('/'),
            settings.stream_key.trim_start_matches('/')
        ));
    }
    for destination in &settings.stream_destinations {
        let destination = destination.trim();
        if !destination.is_empty() && !destinations.iter().any(|value| value == destination) {
            destinations.push(destination.to_owned());
        }
    }
    if destinations.is_empty() {
        return Err(anyhow!("Ajoute une clé de stream avant de lancer le direct."));
    }

    let pipeline = build_video_pipeline(settings, scene);
    let mic_index = pipeline.next_input_index;
    let system_index = mic_index + 1;
    let aura_index = system_index + 1;
    let mut args = pipeline.args;
    append_mic_input(&mut args, settings);
    append_system_audio_input(&mut args);
    append_aura_audio_input(&mut args);
    args.extend([
        "-filter_complex".into(), mixed_filter(&pipeline.filter_complex, mic_index, system_index, aura_index, audio),
        "-map".into(), pipeline.output_label.into(),
        "-map".into(), "[aout]".into(),
    ]);
    append_output_encoding(&mut args, settings);

    if destinations.len() == 1 {
        args.extend(["-f".into(), "flv".into(), destinations.remove(0)]);
    } else {
        let tee = destinations
            .iter()
            .map(|destination| {
                let escaped = destination.replace('\\', "\\\\").replace('|', "\\|");
                format!("[f=flv:onfail=ignore]{escaped}")
            })
            .collect::<Vec<_>>()
            .join("|");
        args.extend(["-f".into(), "tee".into(), tee]);
    }

    Command::new(&settings.ffmpeg_path)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .context("Impossible de lancer le compositeur FFmpeg pour le direct")
}

pub fn start_recording(settings: &Settings, scene: &Scene, audio: AudioMix) -> Result<(Child, PathBuf)> {
    if !cfg!(target_os = "windows") {
        return Err(anyhow!("Le compositeur Aura Native est actuellement ciblé Windows."));
    }
    if !ffmpeg_available(&settings.ffmpeg_path) {
        return Err(anyhow!("FFmpeg est introuvable : vérifie son chemin dans Réglages."));
    }

    let directory = Path::new(&settings.recording_dir);
    std::fs::create_dir_all(directory).context("Impossible de créer le dossier d’enregistrement")?;
    let file = directory.join(format!(
        "aura-live-{}.mkv",
        Local::now().format("%Y-%m-%d_%H-%M-%S-%3f")
    ));

    let pipeline = build_video_pipeline(settings, scene);
    let mic_index = pipeline.next_input_index;
    let system_index = mic_index + 1;
    let aura_index = system_index + 1;
    let mut args = pipeline.args;
    append_mic_input(&mut args, settings);
    append_system_audio_input(&mut args);
    append_aura_audio_input(&mut args);
    args.extend([
        "-filter_complex".into(), mixed_filter(&pipeline.filter_complex, mic_index, system_index, aura_index, audio),
        "-map".into(), pipeline.output_label.into(),
        "-map".into(), "[aout]".into(),
    ]);
    append_output_encoding(&mut args, settings);
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
        .context("Impossible de lancer le compositeur FFmpeg pour l’enregistrement")?;

    Ok((child, file))
}

pub fn start_replay_buffer(settings: &Settings, scene: &Scene, audio: AudioMix) -> Result<(Child, PathBuf)> {
    if !cfg!(target_os = "windows") {
        return Err(anyhow!("Le replay buffer Aura Native est actuellement ciblé Windows."));
    }
    if !ffmpeg_available(&settings.ffmpeg_path) {
        return Err(anyhow!("FFmpeg est introuvable : vérifie son chemin dans Réglages."));
    }

    let directory = Path::new(&settings.recording_dir).join("replay-buffer");
    std::fs::create_dir_all(&directory).context("Impossible de créer le replay buffer")?;
    for entry in std::fs::read_dir(&directory).context("Impossible de lire le replay buffer")? {
        let Ok(entry) = entry else { continue };
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) == Some("mkv") {
            let _ = std::fs::remove_file(path);
        }
    }

    let pipeline = build_video_pipeline(settings, scene);
    let mic_index = pipeline.next_input_index;
    let system_index = mic_index + 1;
    let aura_index = system_index + 1;
    let mut args = pipeline.args;
    append_mic_input(&mut args, settings);
    append_system_audio_input(&mut args);
    append_aura_audio_input(&mut args);
    args.extend([
        "-filter_complex".into(), mixed_filter(&pipeline.filter_complex, mic_index, system_index, aura_index, audio),
        "-map".into(), pipeline.output_label.into(),
        "-map".into(), "[aout]".into(),
    ]);
    append_output_encoding(&mut args, settings);

    let seconds = settings.replay_seconds.clamp(10, 300);
    let segment_seconds = 5_u32;
    let wrap = ((seconds + segment_seconds - 1) / segment_seconds + 1).max(3);
    let pattern = directory.join("replay-%03d.mkv");
    args.extend([
        "-f".into(), "segment".into(),
        "-segment_time".into(), segment_seconds.to_string(),
        "-segment_wrap".into(), wrap.to_string(),
        "-reset_timestamps".into(), "1".into(),
        pattern.to_string_lossy().into_owned(),
    ]);

    let child = Command::new(&settings.ffmpeg_path)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .context("Impossible de lancer le replay buffer Aura Native")?;

    Ok((child, directory))
}

pub fn save_replay_clip(settings: &Settings, directory: &Path) -> Result<PathBuf> {
    let mut segments: Vec<PathBuf> = std::fs::read_dir(directory)
        .context("Replay buffer inaccessible")?
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|path| path.extension().and_then(|value| value.to_str()) == Some("mkv"))
        .filter(|path| std::fs::metadata(path).map(|meta| meta.len() > 0).unwrap_or(false))
        .collect();
    segments.sort_by_key(|path| {
        std::fs::metadata(path)
            .and_then(|meta| meta.modified())
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
    });
    if segments.is_empty() {
        return Err(anyhow!("Le replay buffer ne contient pas encore assez d’images."));
    }

    let recording_dir = Path::new(&settings.recording_dir);
    std::fs::create_dir_all(recording_dir).context("Impossible de créer le dossier d’enregistrement")?;
    let output = recording_dir.join(format!(
        "aura-replay-{}.mkv",
        Local::now().format("%Y-%m-%d_%H-%M-%S-%3f")
    ));
    let list_path = directory.join("concat.txt");
    let list = segments
        .iter()
        .map(|path| {
            let safe = path.to_string_lossy().replace('\\', "/").replace('\'', "\\'");
            format!("file '{safe}'")
        })
        .collect::<Vec<_>>()
        .join("\n");
    std::fs::write(&list_path, list).context("Impossible de préparer le clip replay")?;

    let status = Command::new(&settings.ffmpeg_path)
        .args([
            "-hide_banner",
            "-loglevel", "error",
            "-f", "concat",
            "-safe", "0",
            "-i", &list_path.to_string_lossy(),
            "-c", "copy",
            &output.to_string_lossy(),
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .context("Impossible de finaliser le clip replay")?;
    let _ = std::fs::remove_file(&list_path);
    if !status.success() {
        return Err(anyhow!("FFmpeg n’a pas pu finaliser le clip replay."));
    }
    Ok(output)
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
    pub fn start(settings: &Settings, scene: &Scene, preview_file: Option<PathBuf>) -> Result<Self> {
        if !cfg!(target_os = "windows") {
            return Err(anyhow!("L’aperçu Aura Native est ciblé Windows."));
        }
        if !ffmpeg_available(&settings.ffmpeg_path) {
            return Err(anyhow!("FFmpeg est introuvable."));
        }

        let pipeline = build_video_pipeline(settings, scene);
        let filter = format!("{};{}scale=960:-2[preview]", pipeline.filter_complex, pipeline.output_label);
        let mut args = pipeline.args;
        args.extend([
            "-filter_complex".into(), filter,
            "-map".into(), "[preview]".into(),
            "-an".into(),
            "-q:v".into(), "7".into(),
            "-f".into(), "image2pipe".into(),
            "-vcodec".into(), "mjpeg".into(),
            "pipe:1".into(),
        ]);

        let mut child = Command::new(&settings.ffmpeg_path)
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .context("Impossible de lancer l’aperçu composite FFmpeg")?;

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
                        // The dashboard or native UI has not consumed the previous frame yet.
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
