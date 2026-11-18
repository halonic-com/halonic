//! The reconnect delays, the same as `tunnelReconnectDelayMs`'s examples.

use std::time::Duration;

use halonic_tunnel::Backoff;

fn millis(attempt: u32, random: f64) -> Option<u128> {
    Backoff::TUNNEL
        .delay(attempt, random)
        .map(|delay| delay.as_millis())
}

#[test]
fn tunnel_transport_backoff_doubles_from_500_ms_to_30_s() {
    assert_eq!(millis(1, 0.5), Some(500));
    assert_eq!(millis(4, 0.5), Some(4_000));
    assert_eq!(millis(20, 0.5), Some(30_000));
    assert_eq!(millis(20, 0.0), Some(24_000));
    assert!(millis(20, 0.999_999_9).is_some_and(|delay| delay <= 36_000));
    assert_eq!(millis(u32::MAX, 0.5), Some(30_000));
}

#[test]
fn tunnel_transport_backoff_refuses_a_bad_try_or_random_number() {
    for (attempt, random) in [(0, 0.5), (1, f64::NAN), (1, -0.1), (1, 1.0), (1, 2.0)] {
        assert_eq!(
            Backoff::TUNNEL.delay(attempt, random),
            None,
            "{attempt} {random}"
        );
    }
    assert_eq!(Backoff::TUNNEL.reset_after, Duration::from_secs(30));
}
