//! A typed, thread-safe event bus for tum.
//!
//! Events are published by the session manager (e.g. PTY output, exits) and
//! consumed by the Tauri integration layer, which forwards them to the
//! frontend via Tauri's event system.

use std::sync::{Arc, Mutex};

/// A generic subscriber: a boxed closure that receives serialized event data.
pub type Subscriber = Box<dyn Fn(&str, &str) + Send + Sync>;

/// Event bus that supports multiple subscribers per named event.
///
/// # Thread safety
///
/// All methods take `&self` (internally synchronised), so the bus can be
/// shared freely across threads via `Arc`.
pub struct EventBus {
    subscribers: Mutex<Vec<(String, Subscriber)>>,
}

impl EventBus {
    pub fn new() -> Self {
        Self {
            subscribers: Mutex::new(Vec::new()),
        }
    }

    /// Register a subscriber for the given event name.
    ///
    /// The callback receives `(event_name, json_payload)`.
    pub fn subscribe<F>(&self, event: &str, callback: F)
    where
        F: Fn(&str, &str) + Send + Sync + 'static,
    {
        let mut subs = self.subscribers.lock().unwrap();
        subs.push((event.to_owned(), Box::new(callback)));
    }

    /// Publish an event to all matching subscribers.
    ///
    /// `json_payload` should be a JSON-serialised string of the event data.
    pub fn emit(&self, event: &str, json_payload: &str) {
        let subs = self.subscribers.lock().unwrap();
        for (name, cb) in subs.iter() {
            if name == event {
                cb(event, json_payload);
            }
        }
    }
}

impl Default for EventBus {
    fn default() -> Self {
        Self::new()
    }
}

/// Convenience wrapper: `Arc<EventBus>` with helper methods.
pub type SharedEventBus = Arc<EventBus>;

/// Create a new shared event bus.
pub fn shared_event_bus() -> SharedEventBus {
    Arc::new(EventBus::new())
}
