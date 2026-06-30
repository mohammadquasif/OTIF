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

fn backend_url() -> String {
    format!("http://127.0.0.1:{}/api/v1/health", backend_port())
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
        app_handle
            .path()
            .resource_dir()
            .ok()?
            .join(format!("otif-backend{}", suffix)),
        app_handle
            .path()
            .resource_dir()
            .ok()?
            .join("binaries")
            .join(format!("otif-backend{}", suffix)),
    ];

    candidates.into_iter().find(|path| path.exists())
}

fn python_backend_command(repo_root: &Path) -> Option<(String, Vec<String>, PathBuf)> {
    let python = repo_root
        .join("backend")
        .join(".venv")
        .join("Scripts")
        .join("python.exe");
    if python.exists() {
        return Some((
            python.to_string_lossy().to_string(),
            vec!["-m".into(), "app.desktop_server".into()],
            repo_root.join("backend"),
        ));
    }
    None
}

fn backend_command(app_handle: &tauri::AppHandle) -> Result<(String, Vec<String>, PathBuf), String> {
    if let Some(path) = packaged_backend_path(app_handle) {
        let cwd = path
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
        return Ok((path.to_string_lossy().to_string(), vec![], cwd));
    }

    let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .map(Path::to_path_buf)
        .ok_or_else(|| "Could not resolve repository root".to_string())?;

    python_backend_command(&repo_root).ok_or_else(|| {
        "Backend sidecar was not found. Run scripts/build_backend_sidecar.ps1 before packaging.".to_string()
    })
}

fn wait_for_backend() -> Result<(), String> {
    let start = Instant::now();
    while start.elapsed() < Duration::from_secs(45) {
        if let Ok(response) = std::net::TcpStream::connect(("127.0.0.1", backend_port().parse().unwrap_or(18765))) {
            drop(response);
            return Ok(());
        }
        thread::sleep(Duration::from_millis(350));
    }
    Err(format!("Backend did not become ready at {}", backend_url()))
}

fn start_backend(app_handle: &tauri::AppHandle, state: &BackendProcess) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|_| "Backend state lock failed")?;
    if guard.is_some() {
        return Ok(());
    }

    let (program, args, cwd) = backend_command(app_handle)?;
    let data_dir = app_data_dir(app_handle);
    std::fs::create_dir_all(&data_dir).map_err(|err| err.to_string())?;

    let child = Command::new(program)
        .args(args)
        .current_dir(cwd)
        .env("OTIF_BACKEND_PORT", backend_port())
        .env("OTIF_DATA_DIR", data_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|err| format!("Failed to start backend: {err}"))?;

    *guard = Some(child);
    drop(guard);
    wait_for_backend()
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
            start_backend(&handle, &*state)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let state = window.state::<BackendProcess>();
                stop_backend(&*state);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running OTIF desktop app");
}
