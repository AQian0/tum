use std::sync::Arc;
use tauri::{Emitter, Manager};
use tum_core::{PtyOptions, TerminalManager};
use tum_ipc::{ServerEvent, TerminalTransport};
use tum_session::{SessionId, SessionManager};

struct AppState {
    manager: TerminalManager,
    sessions: SessionManager,
}

struct TauriTransport {
    app: tauri::AppHandle,
}

impl TerminalTransport for TauriTransport {
    fn send_event(&self, event: ServerEvent) {
        match event {
            ServerEvent::Spawned { session_id } => {
                let _ = self.app.emit("terminal-spawned", session_id);
            }
            ServerEvent::Output { session_id, data } => {
                let _ = self.app.emit("terminal-output", serde_json::json!({
                    "session_id": session_id,
                    "data": data,
                }));
            }
            ServerEvent::Exit { session_id, code } => {
                let _ = self.app.emit("terminal-exit", serde_json::json!({
                    "session_id": session_id,
                    "code": code,
                }));
            }
        }
    }
}

#[tauri::command]
fn spawn_terminal(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let transport = Arc::new(TauriTransport { app });
    state
        .manager
        .spawn(
            PtyOptions {
                shell: None,
                rows: 24,
                cols: 80,
                cwd: None,
                env: vec![],
            },
            transport,
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn write_to_terminal(state: tauri::State<'_, AppState>, data: String) -> Result<(), String> {
    state
        .manager
        .write(data.as_bytes())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn resize_terminal(
    state: tauri::State<'_, AppState>,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    state
        .manager
        .resize(cols, rows)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn session_spawn(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    cols: Option<u16>,
    rows: Option<u16>,
    shell: Option<String>,
    cwd: Option<String>,
) -> Result<u64, String> {
    let transport = Arc::new(TauriTransport { app });
    let id = state
        .sessions
        .spawn(
            PtyOptions {
                shell,
                rows: rows.unwrap_or(24),
                cols: cols.unwrap_or(80),
                cwd,
                env: vec![],
            },
            transport,
        )
        .map_err(|e| e.to_string())?;
    Ok(id.as_u64())
}

#[tauri::command]
fn session_write(
    state: tauri::State<'_, AppState>,
    session_id: u64,
    data: String,
) -> Result<(), String> {
    state
        .sessions
        .write(SessionId::new(session_id), data.as_bytes())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn session_resize(
    state: tauri::State<'_, AppState>,
    session_id: u64,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    state
        .sessions
        .resize(SessionId::new(session_id), cols, rows)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn session_close(
    state: tauri::State<'_, AppState>,
    session_id: u64,
) -> Result<(), String> {
    state.sessions.close(SessionId::new(session_id));
    Ok(())
}

#[tauri::command]
fn session_count(state: tauri::State<'_, AppState>) -> usize {
    state.sessions.session_count()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            app.manage(AppState {
                manager: TerminalManager::new(),
                sessions: SessionManager::new(),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            spawn_terminal,
            write_to_terminal,
            resize_terminal,
            session_spawn,
            session_write,
            session_resize,
            session_close,
            session_count,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
