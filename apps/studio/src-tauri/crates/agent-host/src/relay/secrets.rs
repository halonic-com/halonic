//! The host's secret requests on id 0, answered on a thread of their own:
//! a keychain may take a while, or wait for the person to allow access, and
//! the clients' frames must not wait for it. One request may be in flight;
//! the host sends the next only after it read the answer.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};

use halonic_secrets::SecretBackend;

use super::{Broken, DATA, Shared, spawn};
use crate::host_secrets::{HOST_SECRETS_ID, answer};

/// Where the thread that reads the host's frames passes its secret requests.
pub(super) struct SecretRequests {
    requests: Sender<Vec<u8>>,
    /// True from a request until its answer is queued for the host.
    in_flight: Arc<AtomicBool>,
}

impl SecretRequests {
    /// Passes a frame the host sent on id 0. Only `data` carries a request;
    /// any other kind, or a second request before the first was answered,
    /// breaks the stream.
    pub(super) fn pass(&self, kind: u8, request: Vec<u8>) -> Result<(), Broken> {
        if kind != DATA || self.in_flight.swap(true, Ordering::SeqCst) {
            return Err(Broken);
        }
        self.requests.send(request).map_err(|_| Broken)
    }
}

impl Shared {
    /// Starts the thread that answers the host's secret requests with
    /// `backend`.
    pub(super) fn start_answering_secrets(
        self: &Arc<Self>,
        backend: Arc<dyn SecretBackend>,
    ) -> SecretRequests {
        let (requests, received) = mpsc::channel();
        let in_flight = Arc::new(AtomicBool::new(false));
        let shared = Arc::clone(self);
        let answered = Arc::clone(&in_flight);
        spawn("relay-host-secrets", move || {
            shared.answer_secrets(backend.as_ref(), &received, &answered);
        });
        SecretRequests {
            requests,
            in_flight,
        }
    }

    /// Answers each request on id 0. A refused one stops the relay, which
    /// closes the host's input, so the host stops too.
    fn answer_secrets(
        &self,
        backend: &dyn SecretBackend,
        requests: &Receiver<Vec<u8>>,
        in_flight: &AtomicBool,
    ) {
        for request in requests {
            let Ok(answer) = answer(backend, &request) else {
                self.stop();
                return;
            };
            // Cleared first: the host may send its next request as soon as
            // it has this answer.
            in_flight.store(false, Ordering::SeqCst);
            if self.send(HOST_SECRETS_ID, DATA, &answer).is_err() {
                return;
            }
        }
    }
}

#[cfg(test)]
mod tests;
