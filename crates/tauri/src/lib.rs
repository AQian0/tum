//! Tauri application entry point.
//!
//! Registers IPC command handlers for the session manager and sets up
//! managed state, event forwarding, and the Tauri runtime.

use std::sync::Arc;
use tauri::Emitter;
use tum_core::AppState;
use tum_ipc::*;

#[tauri::command]
fn create_session(
    state: tauri::State<'_, Arc<AppState>>,
    req: CreateSessionRequest,
) -> CreateSessionResponse {
    state.sessions.create_session(req)
}

#[tauri::command]
fn attach_pty(
    state: tauri::State<'_, Arc<AppState>>,
    req: AttachPtyRequest,
) -> Result<AttachPtyResponse, String> {
    state.sessions.attach_pty(req)
}

#[tauri::command]
fn write_pty(state: tauri::State<'_, Arc<AppState>>, req: PtyInputRequest) -> Result<(), String> {
    state.sessions.write_pty(req)
}

#[tauri::command]
fn resize_pty(state: tauri::State<'_, Arc<AppState>>, req: PtyResizeRequest) -> Result<(), String> {
    state.sessions.resize_pty(req)
}

#[tauri::command]
fn destroy_session(
    state: tauri::State<'_, Arc<AppState>>,
    req: DestroySessionRequest,
) -> Result<(), String> {
    state.sessions.destroy_session(req)
}

#[tauri::command]
fn list_sessions(state: tauri::State<'_, Arc<AppState>>) -> ListSessionsResponse {
    state.sessions.list_sessions()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = Arc::new(AppState::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .manage(app_state.clone())
        .setup(move |app| {
            // Forward backend events to the Tauri frontend.
            //
            // The session manager emits JSON-serialised events on the
            // internal event bus.  We subscribe and re-emit them via
            // Tauri's `emit` so the frontend can listen.
            let app_handle = app.handle().clone();
            let app_handle2 = app.handle().clone();
            let app_handle3 = app.handle().clone();

            let bus = &app_state.event_bus;

            bus.subscribe("pty:output", move |_event, payload| {
                let _ = app_handle.emit("pty:output", payload);
            });

            bus.subscribe("pty:exit", move |_event, payload| {
                let _ = app_handle2.emit("pty:exit", payload);
            });

            bus.subscribe("session:destroyed", move |_event, payload| {
                let _ = app_handle3.emit("session:destroyed", payload);
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_session,
            attach_pty,
            write_pty,
            resize_pty,
            destroy_session,
            list_sessions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
