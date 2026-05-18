//! Tauri application entry point.
//!
//! Registers a single `dispatch` IPC command for all frontend→backend
//! communication and forwards backend events to the frontend through a
//! single `ipc:event` channel.

use std::sync::Arc;
use tauri::Emitter;
use tum_core::AppState;
use tum_ipc::{ClientMessage, ServerMessage};

/// Single entry point for all frontend requests.
///
/// Replaces the previous per-operation commands (`create_session`,
/// `attach_pty`, etc.) with a unified dispatcher that routes based on
/// the message kind.
#[tauri::command]
fn dispatch(
    state: tauri::State<'_, Arc<AppState>>,
    message: ClientMessage,
) -> Result<ServerMessage, String> {
    state.handle_message(message)
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
            // All events (pty:output, pty:exit, session:destroyed) are
            // forwarded through a single `ipc:event` channel.  The frontend
            // discriminates on the `kind` field of the JSON payload.
            let app_handle = app.handle().clone();

            let bus = &app_state.event_bus;

            bus.subscribe("pty:output", {
                let h = app_handle.clone();
                move |_event, payload| {
                    let _ = h.emit("ipc:event", payload);
                }
            });

            bus.subscribe("pty:exit", {
                let h = app_handle.clone();
                move |_event, payload| {
                    let _ = h.emit("ipc:event", payload);
                }
            });

            bus.subscribe("session:destroyed", {
                let h = app_handle.clone();
                move |_event, payload| {
                    let _ = h.emit("ipc:event", payload);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![dispatch])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
