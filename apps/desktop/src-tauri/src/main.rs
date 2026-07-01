use std::{
    env,
    fs::{self, File, OpenOptions},
    io::Write,
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

fn read_log_tail(path: &Path) -> String {
    const MAX_LOG_BYTES: usize = 120_000;
    match fs::read(path) {
        Ok(bytes) => {
            let start = bytes.len().saturating_sub(MAX_LOG_BYTES);
            String::from_utf8_lossy(&bytes[start..]).to_string()
        }
        Err(error) => format!("Unable to read {}: {error}", path.display()),
    }
}

#[tauri::command]
fn read_startup_logs(app_handle: tauri::AppHandle) -> Result<String, String> {
    let data_dir = app_data_dir(&app_handle);
    let files = ["startup.log", "backend.stderr.log", "backend.stdout.log"];
    let mut output = format!("OTIF diagnostic logs\nFolder: {}\n", data_dir.display());

    for file_name in files {
        let path = data_dir.join(file_name);
        output.push_str(&format!("\n\n===== {file_name} =====\n"));
        if path.exists() {
            output.push_str(&read_log_tail(&path));
        } else {
            output.push_str("Log file has not been created yet.");
        }
    }

    Ok(output)
}

fn write_startup_log(data_dir: &Path, message: &str) {
    let _ = fs::create_dir_all(data_dir);
    let log_path = data_dir.join("startup.log");
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_path) {
        let _ = writeln!(file, "{message}");
    }
}

fn packaged_backend_candidates(app_handle: &tauri::AppHandle) -> Vec<PathBuf> {
    let suffix = if cfg!(target_os = "windows") {
        ".exe"
    } else {
        ""
    };
    let mut candidates = Vec::new();

    if let Ok(exe) = env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            candidates.push(exe_dir.join(format!("otif-backend{suffix}")));
            candidates.push(
                exe_dir
                    .join("binaries")
                    .join(format!("otif-backend{suffix}")),
            );
            candidates.push(
                exe_dir
                    .join("resources")
                    .join(format!("otif-backend{suffix}")),
            );
            candidates.push(
                exe_dir
                    .join("resources")
                    .join("binaries")
                    .join(format!("otif-backend{suffix}")),
            );
        }
    }

    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        candidates.push(resource_dir.join(format!("otif-backend{suffix}")));
        candidates.push(
            resource_dir
                .join("binaries")
                .join(format!("otif-backend{suffix}")),
        );
    }

    candidates
}

fn packaged_backend_path(app_handle: &tauri::AppHandle, data_dir: &Path) -> Option<PathBuf> {
    let candidates = packaged_backend_candidates(app_handle);
    for path in &candidates {
        write_startup_log(
            data_dir,
            &format!(
                "[OTIF] backend candidate: {} exists={}",
                path.display(),
                path.exists()
            ),
        );
    }
    candidates.into_iter().find(|p| p.exists())
}

fn stage_packaged_backend(source: &Path, data_dir: &Path) -> Result<PathBuf, String> {
    let suffix = if cfg!(target_os = "windows") {
        ".exe"
    } else {
        ""
    };
    let bin_dir = data_dir.join("bin");
    fs::create_dir_all(&bin_dir).map_err(|e| format!("Failed to create backend bin dir: {e}"))?;
    let target = bin_dir.join(format!("otif-backend{suffix}"));
    if let Err(error) = fs::copy(source, &target) {
        if !target.exists() {
            return Err(format!(
                "Failed to stage backend from {} to {}: {error}",
                source.display(),
                target.display()
            ));
        }
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = fs::metadata(&target)
            .map_err(|e| format!("Failed to read staged backend metadata: {e}"))?
            .permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&target, permissions)
            .map_err(|e| format!("Failed to make staged backend executable: {e}"))?;
    }

    Ok(target)
}

fn python_backend_command(repo_root: &Path) -> Option<(String, Vec<String>, PathBuf)> {
    let python_win = repo_root
        .join("backend")
        .join(".venv")
        .join("Scripts")
        .join("python.exe");
    if python_win.exists() {
        return Some((
            python_win.to_string_lossy().to_string(),
            vec![
                "-m".into(),
                "uvicorn".into(),
                "app.main:app".into(),
                "--host".into(),
                "127.0.0.1".into(),
                "--port".into(),
                backend_port(),
            ],
            repo_root.join("backend"),
        ));
    }

    let python_unix = repo_root
        .join("backend")
        .join(".venv")
        .join("bin")
        .join("python");
    if python_unix.exists() {
        return Some((
            python_unix.to_string_lossy().to_string(),
            vec![
                "-m".into(),
                "uvicorn".into(),
                "app.main:app".into(),
                "--host".into(),
                "127.0.0.1".into(),
                "--port".into(),
                backend_port(),
            ],
            repo_root.join("backend"),
        ));
    }
    None
}

fn backend_command(
    app_handle: &tauri::AppHandle,
    data_dir: &Path,
) -> Result<(String, Vec<String>, PathBuf), String> {
    if let Some(path) = packaged_backend_path(app_handle, data_dir) {
        let staged_path = stage_packaged_backend(&path, data_dir)?;
        write_startup_log(
            data_dir,
            &format!("[OTIF] staged backend: {}", staged_path.display()),
        );
        let cwd = staged_path
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
        return Ok((staged_path.to_string_lossy().to_string(), vec![], cwd));
    }

    let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .map(Path::to_path_buf)
        .ok_or_else(|| "Could not resolve repository root".to_string())?;
    python_backend_command(&repo_root).ok_or_else(|| {
        "Backend not found. Run the installer or scripts/build_backend_sidecar.ps1.".to_string()
    })
}

fn wait_for_backend(data_dir: PathBuf) -> Result<(), String> {
    let port: u16 = backend_port().parse().unwrap_or(18765);
    let start = Instant::now();
    while start.elapsed() < Duration::from_secs(90) {
        if is_backend_port_open() {
            write_startup_log(&data_dir, "[OTIF] backend ready");
            return Ok(());
        }
        thread::sleep(Duration::from_millis(500));
    }
    Err(format!("Backend did not start within 90 s on port {port}"))
}

fn is_backend_port_open() -> bool {
    let port: u16 = backend_port().parse().unwrap_or(18765);
    std::net::TcpStream::connect(("127.0.0.1", port)).is_ok()
}

fn spawn_backend(app_handle: &tauri::AppHandle, state: &BackendProcess) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|_| "Backend state lock failed")?;
    if guard.is_some() {
        return Ok(());
    }

    let data_dir = app_data_dir(app_handle);
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    write_startup_log(&data_dir, "[OTIF] starting backend");
    if is_backend_port_open() {
        write_startup_log(&data_dir, "[OTIF] backend already listening; reusing it");
        return Ok(());
    }

    let (program, args, cwd) = backend_command(app_handle, &data_dir)?;
    write_startup_log(
        &data_dir,
        &format!(
            "[OTIF] spawning backend program={program} cwd={}",
            cwd.display()
        ),
    );

    let stdout = File::create(data_dir.join("backend.stdout.log"))
        .map_err(|e| format!("Failed to open backend stdout log: {e}"))?;
    let stderr = File::create(data_dir.join("backend.stderr.log"))
        .map_err(|e| format!("Failed to open backend stderr log: {e}"))?;
    let child = Command::new(program)
        .args(args)
        .current_dir(cwd)
        .env("OTIF_BACKEND_PORT", backend_port())
        .env("OTIF_DATA_DIR", &data_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr))
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
        .invoke_handler(tauri::generate_handler![read_startup_logs])
        .setup(|app| {
            let handle = app.handle().clone();
            let state = app.state::<BackendProcess>();
            match spawn_backend(&handle, &*state) {
                Ok(()) => {
                    let data_dir = app_data_dir(&handle);
                    thread::spawn(move || {
                        if let Err(e) = wait_for_backend(data_dir.clone()) {
                            write_startup_log(&data_dir, &format!("[OTIF] backend timeout: {e}"));
                            eprintln!("[OTIF] Backend readiness timeout: {e}");
                        }
                    });
                }
                Err(e) => {
                    let data_dir = app_data_dir(&handle);
                    write_startup_log(&data_dir, &format!("[OTIF] backend spawn failed: {e}"));
                    eprintln!("[OTIF] Backend spawn failed: {e}");
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
