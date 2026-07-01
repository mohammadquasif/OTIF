use std::{
    env,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};
use tauri::Manager;

struct BackendProcess(Mutex<Option<Child>>);

fn backend_port() -> String {
    env::var("OTIF_BACKEND_PORT").unwrap_or_else(|_| "18765".to_string())
}

fn app_data_dir(app_handle: &tauri::AppHandle) -> PathBuf {
    app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
}

fn packaged_backend_path(app_handle: &tauri::AppHandle) -> Option<PathBuf> {
    let exe = env::current_exe().ok()?;
    let exe_dir = exe.parent()?;
    let suffix = if cfg!(target_os = "windows") { ".exe" } else { "" };
    let candidates = [
        exe_dir.join(format!("otif-backend{}", suffix)),
        exe_dir.join("binaries").join(format!("otif-backend{}", suffix)),
        app_handle.path().resource_dir().ok()?.join(format!("otif-backend{}", suffix)),
        app_handle.path().resource_dir().ok()?.join("binaries").join(format!("otif-backend{}", suffix)),
    ];
    candidates.into_iter().find(|p| p.exists())
}

fn python_backend_command(repo_root: &Path) -> Option<(String, Vec<String>, PathBuf)> {
    // Windows venv
    let python_win = repo_root.join("backend").join(".venv").join("Scripts").join("python.exe");
    if python_win.exists() {
        return Some((
            python_win.to_string_lossy().to_string(),
            vec!["-m".into(), "uvicorn".into(), "app.main:app".into(),
                 "--host".into(), "127.0.0.1".into(), "--port".into(), backend_port()],
            repo_root.join("backend"),
        ));
    }
    // Unix venv
    let python_unix = repo_root.join("backend").join(".venv").join("bin").join("python");
    if python_unix.exists() {
        return Some((
            python_unix.to_string_lossy().to_string(),
            vec!["-m".into(), "uvicorn".into(), "app.main:app".into(),
                 "--host".into(), "127.0.0.1".into(), "--port".into(), backend_port()],
            repo_root.join("backend"),
        ));
    }
    None
}

fn backend_command(app_handle: &tauri::AppHandle) -> Result<(String, Vec<String>, PathBuf), String> {
    if let Some(path) = packaged_backend_path(app_handle) {
        let cwd = path.parent().map(Path::to_path_buf)
            .unwrap_or_else(|| env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
        return Ok((path.to_string_lossy().to_string(), vec![], cwd));
    }
    let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent().and_then(Path::parent).map(Path::to_path_buf)
        .ok_or_else(|| "Could not resolve repository root".to_string())?;
    python_backend_command(&repo_root).ok_or_else(|| {
        "Backend not found. Run the installer or scripts/build_backend_sidecar.ps1.".to_string()
    })
}

fn wait_for_backend() -> Result<(), String> {
    let port: u16 = backend_port().parse().unwrap_or(18765);
    let start = Instant::now();
    while start.elapsed() < Duration::from_secs(60) {
        if std::net::TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(500));
    }
    Err(format!("Backend did not start within 60 s on port {}", port))
}

fn spawn_backend(app_handle: &tauri::AppHandle, state: &BackendProcess) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|_| "Backend state lock failed")?;
    if guard.is_some() {
        return Ok(());
    }
    let (program, args, cwd) = backend_command(app_handle)?;
    let data_dir = app_data_dir(app_handle);
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let child = Command::new(program)
        .args(args)
        .current_dir(cwd)
        .env("OTIF_BACKEND_PORT", backend_port())
        .env("OTIF_DATA_DIR", &data_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to spawn backend: {e}"))?;
    *guard = Some(child);
    Ok(())
}

fn stop_backend(state: &BackendProcess) {
    if let Ok(mut guard) = state.0.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn main() {
    tauri::Builder::default()
        .manage(BackendProcess(Mutex::new(None)))
        .setup(|app| {
            let handle = app.handle().clone();
            let state = app.state::<BackendProcess>();
            // Spawn backend immediately — do NOT block the UI thread.
            // The React splash screen polls /health independently.
            match spawn_backend(&handle, &*state) {
                Ok(()) => {
                    thread::spawn(move || {
                        if let Err(e) = wait_for_backend() {
                            eprintln!("[OTIF] Backend readiness timeout: {e}");
                        }
                    });
                }
                Err(e) => {
                    eprintln!("[OTIF] Backend spawn failed: {e}");
                    // Non-fatal: splash screen error state shown after 60 s poll
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                stop_backend(&*window.state::<BackendProcess>());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running OTIF desktop app");
}
