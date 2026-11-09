//! A name lookup with a time limit. The system resolver has no limit of its
//! own and can hang far longer than the user waits for "Connecting…".

use std::io;
use std::net::SocketAddr;
use std::sync::{Arc, mpsc};
use std::thread;
use std::time::Duration;

use crate::check::Resolver;

/// Runs another resolver on its own thread and gives up after `limit`, so a
/// hanging lookup ends as "Can't reach Halonic" in time. A lookup that gives
/// up keeps running in the background until the system ends it; its answer
/// is dropped.
pub struct TimedResolver<R> {
    inner: Arc<R>,
    limit: Duration,
}

impl<R> TimedResolver<R> {
    pub fn new(inner: R, limit: Duration) -> Self {
        TimedResolver {
            inner: Arc::new(inner),
            limit,
        }
    }
}

impl<R: Resolver + Send + Sync + 'static> Resolver for TimedResolver<R> {
    fn resolve(&self, name: &str, port: u16) -> io::Result<Vec<SocketAddr>> {
        let (sender, receiver) = mpsc::channel();
        let inner = Arc::clone(&self.inner);
        let name = name.to_owned();
        thread::Builder::new()
            .name("connect-lookup".to_owned())
            .spawn(move || {
                // When the lookup took too long, nobody is listening any more.
                let _ = sender.send(inner.resolve(&name, port));
            })?;
        receiver
            .recv_timeout(self.limit)
            .unwrap_or_else(|_| Err(io::ErrorKind::TimedOut.into()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Answers `192.168.1.20` after `delay`.
    struct SlowResolver {
        delay: Duration,
    }

    impl Resolver for SlowResolver {
        fn resolve(&self, _name: &str, port: u16) -> io::Result<Vec<SocketAddr>> {
            thread::sleep(self.delay);
            Ok(vec![SocketAddr::new([192, 168, 1, 20].into(), port)])
        }
    }

    struct FailingResolver;

    impl Resolver for FailingResolver {
        fn resolve(&self, _name: &str, _port: u16) -> io::Result<Vec<SocketAddr>> {
            Err(io::ErrorKind::NotFound.into())
        }
    }

    #[test]
    fn connect_check_passes_a_lookup_that_answers_in_time() {
        let resolver = TimedResolver::new(
            SlowResolver {
                delay: Duration::ZERO,
            },
            Duration::from_secs(5),
        );
        let addresses = resolver.resolve("my-laptop.local", 4280).expect("in time");
        assert_eq!(
            addresses,
            vec!["192.168.1.20:4280".parse().expect("a test socket")]
        );
    }

    #[test]
    fn connect_check_gives_up_on_a_lookup_that_hangs() {
        let resolver = TimedResolver::new(
            SlowResolver {
                delay: Duration::from_secs(2),
            },
            Duration::from_millis(20),
        );
        let error = resolver
            .resolve("my-laptop.local", 4280)
            .expect_err("too slow");
        assert_eq!(error.kind(), io::ErrorKind::TimedOut);
    }

    #[test]
    fn connect_check_passes_a_failed_lookup_on() {
        let resolver = TimedResolver::new(FailingResolver, Duration::from_secs(5));
        let error = resolver
            .resolve("unknown.example", 4280)
            .expect_err("failed");
        assert_eq!(error.kind(), io::ErrorKind::NotFound);
    }
}
