use std::sync::Arc;
use tauri::Emitter;
use tum_core::AppState;
use tum_ipc::{ClientMessage, ServerMessage};

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
