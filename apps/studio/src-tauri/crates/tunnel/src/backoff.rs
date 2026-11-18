//! How the transport waits between tries to reconnect: the rule of
//! `tunnelBackoff` and `tunnelReconnectDelayMs` in `@halonicjs/ports`, so
//! the phone and the fake provider back off alike.

use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::time::Duration;

/// A backoff rule: `first_delay` before the first try after a drop, times
/// `factor` after each failed try, a base of at most `max_delay`, each delay
/// moved by up to `jitter` of itself either way. A connection that stays
/// open for `reset_after` starts again from `first_delay`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Backoff {
    pub first_delay: Duration,
    pub factor: u32,
    pub max_delay: Duration,
    pub jitter: f64,
    pub reset_after: Duration,
}

impl Backoff {
    /// The rule every transport uses: 500 ms, doubling to at most 30 s,
    /// ±20 %, reset after 30 s open.
    pub const TUNNEL: Self = Self {
        first_delay: Duration::from_millis(500),
        factor: 2,
        max_delay: Duration::from_secs(30),
        jitter: 0.2,
        reset_after: Duration::from_secs(30),
    };

    /// The delay before try `attempt` (1 for the first try after a drop),
    /// with `random` from 0 up to (not including) 1; 0.5 gives the delay
    /// without jitter. `None` for an attempt of 0 or a `random` outside that
    /// range, as `tunnelReconnectDelayMs` throws for them, so a bad random
    /// source can't give a delay of 0 and a tight loop.
    pub fn delay(&self, attempt: u32, random: f64) -> Option<Duration> {
        if attempt == 0 || !(0.0..1.0).contains(&random) {
            return None;
        }
        let growth = f64::from(self.factor).powi(attempt.saturating_sub(1).min(64) as i32);
        let base =
            (self.first_delay.as_millis() as f64 * growth).min(self.max_delay.as_millis() as f64);
        let millis = (base * (1.0 + self.jitter * (2.0 * random - 1.0))).round();
        Some(Duration::from_millis(millis as u64))
    }
}

/// A number from 0 up to (not including) 1 for the jitter. It needs no
/// cryptographic strength, only to differ between phones, so the standard
/// library's randomly keyed hasher is enough.
pub(crate) fn jitter_random() -> f64 {
    let bits = RandomState::new().build_hasher().finish() >> 11;
    bits as f64 / (1u64 << 53) as f64
}
