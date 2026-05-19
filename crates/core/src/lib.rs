use tum_events::{shared_event_bus, SharedEventBus};
use tum_ipc::{ClientMessage, ServerMessage};
use tum_session::SharedSessionManager;

pub struct AppState {
    pub event_bus: SharedEventBus,
    pub sessions: SharedSessionManager,
}

impl AppState {
    pub fn new() -> Self {
        let event_bus = shared_event_bus();
        let sessions = std::sync::Arc::new(SessionManager::new(event_bus.clone()));

        Self {
            event_bus,
            sessions,
        }
    }

    pub fn handle_message(&self, msg: ClientMessage) -> Result<ServerMessage, String> {
        self.sessions.handle_message(msg)
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

pub use tum_events::EventBus;
pub use tum_session::SessionManager;
