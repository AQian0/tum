use std::sync::{Arc, Mutex};

pub type Subscriber = Arc<dyn Fn(&str, &str) + Send + Sync>;

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
        subs.push((event.to_owned(), Arc::new(callback)));
    }

    pub fn emit(&self, event: &str, json_payload: &str) {
        let callbacks: Vec<Subscriber> = {
            let subs = self.subscribers.lock().unwrap();
            subs.iter()
                .filter_map(|(name, cb)| (name == event).then(|| Arc::clone(cb)))
                .collect()
        };

        for cb in callbacks {
            cb(event, json_payload);
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
