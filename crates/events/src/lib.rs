//! Typed, thread-safe event bus.
//!
//! Provides an [`EventBus`] that lets components publish and subscribe
//! to strongly-typed events without coupling to each other.
//!
//! # Overview
//!
//! - **Publish** any `Send + Sync + 'static` value as an event.
//! - **Subscribe** to a specific event type with a closure.
//! - **`Subscription`** handles — when dropped they automatically
//!   unsubscribe, so owners don't need to remember to clean up.
//!
//! # Example
//!
//! ```ignore
//! use tum_events::EventBus;
//!
//! #[derive(Debug, Clone)]
//! struct TerminalResized { cols: u16, rows: u16 }
//!
//! let bus = EventBus::new();
//! let _sub = bus.subscribe(|e: &TerminalResized| {
//!     println!("resized to {}x{}", e.cols, e.rows);
//! });
//!
//! bus.publish(TerminalResized { cols: 120, rows: 40 });
//! ```

use std::any::{Any, TypeId};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, Weak};

type SubId = usize;

type ErasedHandler = Arc<dyn Fn(&dyn Any) + Send + Sync + 'static>;

struct Subscriber {
    id: SubId,
    type_id: TypeId,
    handler: ErasedHandler,
}

static NEXT_SUB_ID: AtomicUsize = AtomicUsize::new(0);

fn next_sub_id() -> SubId {
    NEXT_SUB_ID.fetch_add(1, Ordering::Relaxed)
}

struct EventBusInner {
    subscribers: Mutex<Vec<Subscriber>>,
}

impl EventBusInner {
    fn new() -> Self {
        Self {
            subscribers: Mutex::new(Vec::new()),
        }
    }

    fn add(
        self: &Arc<Self>,
        type_id: TypeId,
        handler: ErasedHandler,
    ) -> (SubId, Weak<EventBusInner>) {
        let id = next_sub_id();
        let mut subs = self.subscribers.lock().unwrap();
        subs.push(Subscriber {
            id,
            type_id,
            handler,
        });
        (id, Arc::downgrade(self))
    }

    fn remove(&self, id: SubId) {
        let mut subs = self.subscribers.lock().unwrap();
        subs.retain(|s| s.id != id);
    }

    fn publish<T: Send + Sync + 'static>(&self, event: &T) {
        let type_id = TypeId::of::<T>();
        let subs = self.subscribers.lock().unwrap();
        let any: &dyn Any = event;
        for s in subs.iter() {
            if s.type_id == type_id {
                (s.handler)(any);
            }
        }
    }
}

/// A handle that automatically unsubscribes when dropped.
///
/// Created by [`EventBus::subscribe`].  Keep this handle alive for as long
/// as you want to receive events; drop it (or call [`Subscription::unsubscribe`])
/// to stop receiving them.
pub struct Subscription {
    id: SubId,
    bus: Weak<EventBusInner>,
}

impl Subscription {
    pub fn unsubscribe(self) {
        drop(self);
    }

    pub fn is_valid(&self) -> bool {
        self.bus.upgrade().is_some()
    }
}

impl Drop for Subscription {
    fn drop(&mut self) {
        if let Some(bus) = self.bus.upgrade() {
            bus.remove(self.id);
        }
    }
}

/// A typed, thread-safe event bus.
///
/// `EventBus` is cheap to clone — it wraps an `Arc` internally.
/// Share one instance across your application to let unrelated
/// components communicate through events.
///
/// # Type-based routing
///
/// Events are routed by their Rust type.  Two different types never
/// collide, even if they have the same shape.
///
/// ```ignore
/// #[derive(Debug, Clone)]
/// struct LogMessage(String);
///
/// #[derive(Debug, Clone)]
/// struct Heartbeat(u64);
///
/// let bus = EventBus::new();
/// bus.subscribe(|msg: &LogMessage| println!("log: {}", msg.0));
/// bus.subscribe(|hb: &Heartbeat| println!("beat {}", hb.0));
///
/// bus.publish(LogMessage("hello".into()));
/// bus.publish(Heartbeat(42));
/// ```
///
/// # Panics
///
/// Mutex poisoning: if a subscriber's handler panics while the bus lock
/// is held, the lock becomes poisoned and subsequent calls to
/// `subscribe` or `publish` will panic.  Handlers should avoid
/// panicking.
#[derive(Clone)]
pub struct EventBus {
    inner: Arc<EventBusInner>,
}

impl EventBus {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(EventBusInner::new()),
        }
    }

    /// Subscribe to events of type `T`.
    ///
    /// The `handler` closure receives a shared reference to each published
    /// event.  It is called synchronously on whichever thread calls
    /// [`publish`](Self::publish).
    ///
    /// Returns a [`Subscription`] that unsubscribes when dropped.
    ///
    /// # Panics
    ///
    /// Panics if the internal lock is poisoned.
    pub fn subscribe<T, F>(&self, handler: F) -> Subscription
    where
        T: Send + Sync + 'static,
        F: Fn(&T) + Send + Sync + 'static,
    {
        let erased: ErasedHandler = Arc::new(move |any: &dyn Any| {
            if let Some(event) = any.downcast_ref::<T>() {
                handler(event);
            }
        });

        let type_id = TypeId::of::<T>();
        let (id, weak) = self.inner.add(type_id, erased);

        Subscription { id, bus: weak }
    }

    /// Publish an event to all current subscribers of type `T`.
    ///
    /// Handlers are invoked synchronously in the order they were
    /// subscribed.  If a handler panics, subsequent handlers for this
    /// publish are not called and the internal lock becomes poisoned.
    ///
    /// # Panics
    ///
    /// Panics if the internal lock is poisoned.
    pub fn publish<T: Send + Sync + 'static>(&self, event: T) {
        self.inner.publish(&event);
    }

    pub fn subscriber_count(&self) -> usize {
        self.inner.subscribers.lock().unwrap().len()
    }

    pub fn subscriber_count_for<T: 'static>(&self) -> usize {
        let type_id = TypeId::of::<T>();
        self.inner
            .subscribers
            .lock()
            .unwrap()
            .iter()
            .filter(|s| s.type_id == type_id)
            .count()
    }
}

impl Default for EventBus {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Debug for EventBus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("EventBus")
            .field("subscriber_count", &self.subscriber_count())
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    #[test]
    fn publish_to_single_subscriber() {
        let bus = EventBus::new();
        let received = Arc::new(AtomicUsize::new(0));
        let r = Arc::clone(&received);

        let _sub = bus.subscribe(move |n: &usize| {
            r.store(*n, Ordering::SeqCst);
        });

        bus.publish(42usize);
        assert_eq!(received.load(Ordering::SeqCst), 42);
    }

    #[test]
    fn publish_to_multiple_subscribers() {
        let bus = EventBus::new();
        let counter = Arc::new(AtomicUsize::new(0));

        let c1 = Arc::clone(&counter);
        let _s1 = bus.subscribe(move |_: &String| {
            c1.fetch_add(1, Ordering::SeqCst);
        });

        let c2 = Arc::clone(&counter);
        let _s2 = bus.subscribe(move |_: &String| {
            c2.fetch_add(1, Ordering::SeqCst);
        });

        bus.publish("hello".to_string());
        assert_eq!(counter.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn different_types_dont_collide() {
        let bus = EventBus::new();

        let int_count = Arc::new(AtomicUsize::new(0));
        let i = Arc::clone(&int_count);
        let _s1 = bus.subscribe(move |_: &i32| {
            i.fetch_add(1, Ordering::SeqCst);
        });

        let str_count = Arc::new(AtomicUsize::new(0));
        let s = Arc::clone(&str_count);
        let _s2 = bus.subscribe(move |_: &String| {
            s.fetch_add(1, Ordering::SeqCst);
        });

        bus.publish(123i32);
        assert_eq!(int_count.load(Ordering::SeqCst), 1);
        assert_eq!(str_count.load(Ordering::SeqCst), 0);

        bus.publish("abc".to_string());
        assert_eq!(int_count.load(Ordering::SeqCst), 1);
        assert_eq!(str_count.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn unsubscribe_on_drop() {
        let bus = EventBus::new();
        let counter = Arc::new(AtomicUsize::new(0));
        let c = Arc::clone(&counter);

        let sub = bus.subscribe(move |_: &u32| {
            c.fetch_add(1, Ordering::SeqCst);
        });

        bus.publish(1u32);
        assert_eq!(counter.load(Ordering::SeqCst), 1);

        drop(sub);
        bus.publish(2u32);
        assert_eq!(counter.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn explicit_unsubscribe() {
        let bus = EventBus::new();
        let counter = Arc::new(AtomicUsize::new(0));
        let c = Arc::clone(&counter);

        let sub = bus.subscribe(move |_: &u64| {
            c.fetch_add(1, Ordering::SeqCst);
        });

        bus.publish(1u64);
        assert_eq!(counter.load(Ordering::SeqCst), 1);

        sub.unsubscribe();
        bus.publish(2u64);
        assert_eq!(counter.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn subscriber_count() {
        let bus = EventBus::new();
        assert_eq!(bus.subscriber_count(), 0);
        assert_eq!(bus.subscriber_count_for::<i32>(), 0);

        let _s1 = bus.subscribe(|_: &i32| {});
        let _s2 = bus.subscribe(|_: &i32| {});
        let _s3 = bus.subscribe(|_: &String| {});

        assert_eq!(bus.subscriber_count(), 3);
        assert_eq!(bus.subscriber_count_for::<i32>(), 2);
        assert_eq!(bus.subscriber_count_for::<String>(), 1);
    }

    #[test]
    fn clone_bus_shares_subscribers() {
        let bus = EventBus::new();
        let counter = Arc::new(AtomicUsize::new(0));
        let c = Arc::clone(&counter);

        let _sub = bus.subscribe(move |_: &bool| {
            c.fetch_add(1, Ordering::SeqCst);
        });

        let bus2 = bus.clone();
        bus2.publish(true);

        assert_eq!(counter.load(Ordering::SeqCst), 1);
    }

    #[derive(Debug, Clone)]
    struct CustomEvent {
        msg: String,
    }

    #[test]
    fn custom_struct_event() {
        let bus = EventBus::new();
        let received = Arc::new(Mutex::new(String::new()));
        let r = Arc::clone(&received);

        let _sub = bus.subscribe(move |e: &CustomEvent| {
            *r.lock().unwrap() = e.msg.clone();
        });

        bus.publish(CustomEvent {
            msg: "event fired".into(),
        });

        assert_eq!(*received.lock().unwrap(), "event fired");
    }

    #[test]
    fn subscription_validity() {
        let bus = EventBus::new();
        let sub = bus.subscribe(|_: &()| {});
        assert!(sub.is_valid());

        drop(bus);
        assert!(!sub.is_valid());
    }
}
