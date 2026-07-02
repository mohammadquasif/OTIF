use std::{
    env,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    net::TcpStream,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant, UNIX_EPOCH},
};
use tauri::Manager;

struct BackendProcess(Mutex<Option<Child>>);

fn backend_port() -> String {
    env::var("OTIF_BACKEND_PORT").unwrap_or_else(|_| "18765".to_string())
}

fn app_data_dir(app_handle: &tauri::AppHandle) -> PathBuf {
    let mut candidates = Vec::new();

    #[cfg(target_os = "windows")]
    {
        if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
            candidates.push(PathBuf::from(local_app_data).join("OTIF"));
        }
        if let Ok(app_data) = env::var("APPDATA") {
            candidates.push(PathBuf::from(app_data).join("OTIF"));
        }
        if let Ok(user_profile) = env::var("USERPROFILE") {
            candidates.push(PathBuf::from(user_profile).join("OTIF"));
        }
    }

    if let Ok(app_dir) = app_handle.path().app_data_dir() {
        candidates.push(app_dir);
    }
    candidates.push(env::temp_dir().join("OTIF"));
    candidates.push(
        env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join("otif-data"),
    );

    candidates
        .into_iter()
        .find(|candidate| data_dir_is_writable(candidate))
        .unwrap_or_else(|| env::temp_dir().join("OTIF"))
}

fn data_dir_is_writable(path: &Path) -> bool {
    if fs::create_dir_all(path).is_err() {
        return false;
    }

    let probe = path.join(".otif-write-test");
    match OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&probe)
    {
        Ok(mut file) => {
            let wrote = file.write_all(b"ok").is_ok();
            drop(file);
            let _ = fs::remove_file(&probe);
            wrote
        }
        Err(_) => false,
    }
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

/// BUG 7 FIX: Extract the log-reading logic into a private helper so both
/// read_startup_logs (tauri::command) and check_backend_services can call it
/// without a fragile self-referential Tauri command invocation.
fn collect_log_output(data_dir: &Path) -> String {
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
    output
}

#[tauri::command]
fn read_startup_logs(app_handle: tauri::AppHandle) -> Result<String, String> {
    let data_dir = app_data_dir(&app_handle);
    Ok(collect_log_output(&data_dir))
}

#[tauri::command]
fn check_backend_services(app_handle: tauri::AppHandle) -> Result<String, String> {
    let data_dir = app_data_dir(&app_handle);
    let port = backend_port();
    let port_open = is_backend_port_open();
    let current_api = backend_has_current_api();
    let support_url = format!("http://127.0.0.1:{port}/docs");
    let status = if !port_open {
        "Backend port is not listening."
    } else if current_api {
        "Backend is listening and supports the current desktop API."
    } else {
        "Backend is listening, but it looks older than this desktop UI."
    };

    Ok(format!(
        "OTIF backend service check\n\nStatus: {status}\nPort: 127.0.0.1:{port}\nCurrent API: {}\nBrowser fallback: {support_url}\nLog folder: {}\n\n{}",
        if current_api { "available" } else { "not available" },
        data_dir.display(),
        collect_log_output(&data_dir)
    ))
}

#[tauri::command]
fn restart_backend(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, BackendProcess>,
) -> Result<String, String> {
    let data_dir = app_data_dir(&app_handle);
    write_startup_log(&data_dir, "[OTIF] restart requested from desktop UI");
    stop_backend(&state);

    if is_backend_port_open() {
        kill_backend_on_port(&data_dir)?;
        let start = Instant::now();
        while start.elapsed() < Duration::from_secs(10) {
            if !is_backend_port_open() {
                break;
            }
            thread::sleep(Duration::from_millis(250));
        }
    }

    spawn_backend(&app_handle, &state)?;
    wait_for_backend(data_dir)?;
    Ok(format!(
        "Backend restarted. Browser fallback: {}",
        support_browser_url()
    ))
}

#[tauri::command]
fn open_browser_fallback() -> Result<String, String> {
    let url = support_browser_url();
    open_url(&url)?;
    Ok(url)
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
    let metadata = fs::metadata(source)
        .map_err(|e| format!("Failed to read packaged backend metadata: {e}"))?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    let staged_name = format!("otif-backend-{}-{modified}{suffix}", metadata.len());
    let bin_dir = data_dir.join("bin");
    fs::create_dir_all(&bin_dir).map_err(|e| format!("Failed to create backend bin dir: {e}"))?;
    let target = bin_dir.join(staged_name);
    if !target.exists() {
        fs::copy(source, &target).map_err(|error| {
            format!(
                "Failed to stage backend from {} to {}: {error}",
                source.display(),
                target.display()
            )
        })?;
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
    TcpStream::connect(("127.0.0.1", port)).is_ok()
}

fn backend_has_current_api() -> bool {
    let port: u16 = backend_port().parse().unwrap_or(18765);
    let Ok(mut stream) = TcpStream::connect(("127.0.0.1", port)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
    let request =
        "GET /api/v1/skills/neon/settings HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n";
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut response = [0_u8; 128];
    match stream.read(&mut response) {
        Ok(size) if size > 0 => String::from_utf8_lossy(&response[..size]).contains(" 200 "),
        _ => false,
    }
}

fn support_browser_url() -> String {
    format!("http://127.0.0.1:{}/docs", backend_port())
}

fn open_url(url: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()
            .map_err(|e| format!("Failed to open browser: {e}"))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("Failed to open browser: {e}"))?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("Failed to open browser: {e}"))?;
        return Ok(());
    }
}

fn kill_backend_on_port(data_dir: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let port = backend_port();
        let output = Command::new("netstat")
            .args(["-ano", "-p", "tcp"])
            .output()
            .map_err(|e| format!("Failed to inspect backend port: {e}"))?;
        let text = String::from_utf8_lossy(&output.stdout);
        let needle = format!("127.0.0.1:{port}");
        let mut pids = Vec::new();
        for line in text.lines().filter(|line| line.contains(&needle)) {
            if let Some(pid) = line.split_whitespace().last() {
                if pid.chars().all(|ch| ch.is_ascii_digit()) && !pids.iter().any(|seen| seen == pid)
                {
                    pids.push(pid.to_string());
                }
            }
        }
        for pid in pids {
            write_startup_log(data_dir, &format!("[OTIF] stopping backend PID {pid}"));
            let _ = Command::new("taskkill").args(["/PID", &pid, "/F"]).output();
        }
        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        write_startup_log(
            data_dir,
            "[OTIF] automatic external backend stop is only enabled on Windows",
        );
        Ok(())
    }
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
        if backend_has_current_api() {
            write_startup_log(&data_dir, "[OTIF] backend already listening; reusing it");
            return Ok(());
        }
        let message = "An older OTIF backend is already listening on the desktop port. Close all OTIF windows/processes and relaunch the updated app.";
        write_startup_log(&data_dir, &format!("[OTIF] {message}"));
        return Err(message.to_string());
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
        .invoke_handler(tauri::generate_handler![
            read_startup_logs,
            check_backend_services,
            restart_backend,
            open_browser_fallback
        ])
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
