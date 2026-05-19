use std::sync::{Arc, Mutex};

pub type Subscriber = Box<dyn Fn(&str, &str) + Send + Sync>;

pub struct EventBus {
    subscribers: Mutex<Vec<(String, Subscriber)>>,
}

impl EventBus {
    pub fn new() -> Self {
        Self {
            subscribers: Mutex::new(Vec::new()),
        }
    }

    pub fn subscribe<F>(&self, event: &str, callback: F)
    where
        F: Fn(&str, &str) + Send + Sync + 'static,
    {
        let mut subs = self.subscribers.lock().unwrap();
        subs.push((event.to_owned(), Box::new(callback)));
    }

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

pub type SharedEventBus = Arc<EventBus>;

pub fn shared_event_bus() -> SharedEventBus {
    Arc::new(EventBus::new())
}
