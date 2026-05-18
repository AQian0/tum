//! Core integration layer for the tum terminal application.
//!
//! Wires together the event bus, session manager, and Tauri command
//! handlers into a single application state that can be registered as
//! Tauri managed state.

use tum_events::{shared_event_bus, SharedEventBus};
use tum_session::SharedSessionManager;

/// Application state shared across all Tauri command handlers.
pub struct AppState {
    pub event_bus: SharedEventBus,
    pub sessions: SharedSessionManager,
}

impl AppState {
    /// Create the application state, wiring the event bus and session
    /// manager together.
    pub fn new() -> Self {
        let event_bus = shared_event_bus();
        let sessions = SessionManager::new(event_bus.clone());

        Self {
            event_bus,
            sessions: std::sync::Arc::new(sessions),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

/// Re-export commonly needed types for downstream crates.
pub use tum_events::EventBus;
pub use tum_session::SessionManager;
