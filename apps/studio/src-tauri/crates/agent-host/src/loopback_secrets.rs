//! The host's secrets channel when it serves on loopback (macOS, Linux):
//! after the handshake line its standard output carries only frames on
//! id 0, its secret requests, and the shell answers each on its standard
//! input (requirement `host-secrets-channel`). The frames, the answers and
//! the rules are the relay's (`relay/secrets.rs`); there are just no
//! clients' connections beside them.
//!
//! One thread reads the host's frames, another answers the requests and
//! alone writes to the host's input, so a keychain that waits for the person
//! never holds up reading, and stopping never waits for a write. Anything
//! but one request at a time on id 0 closes the host's input, so the host
//! stops. The host's answers to the shell's notices (`opened_workspaces.rs`)
//! travel on id 0 too; they go to the shell's waiting call, never to the
//! keychain.

use std::io::{Read, Write};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::thread;
use std::time::Instant;

use halonic_secrets::SecretBackend;

use crate::host_secrets::{HOST_SECRETS_ID, answer};
use crate::opened_workspaces::noticed_folder;
use crate::relay::{DATA, HostFrame, frame, read_host_frame};

/// What goes to the thread that holds the host's input.
enum ToHost {
    /// A request to answer.
    Request(Vec<u8>),
    /// A notice to pass on unasked (`opened_workspaces.rs`).
    Notice(Vec<u8>),
    /// Close the host's input, so it stops.
    Close,
}

/// The shell's end of the channel for one host. Dropping it closes the
/// host's input.
pub(crate) struct LoopbackSecrets {
    to_host: Sender<ToHost>,
    stopped: Arc<AtomicBool>,
    /// The folders the host answered `noticed` for, in order.
    noticed: Receiver<String>,
}

impl LoopbackSecrets {
    /// Starts answering the requests the host writes to `output`, its
    /// standard output after the handshake line, with `backend`, on `input`,
    /// its standard input.
    pub(crate) fn serve(
        input: impl Write + Send + 'static,
        output: impl Read + Send + 'static,
        backend: Arc<dyn SecretBackend>,
    ) -> Self {
        let (to_host, received) = mpsc::channel();
        let (noticed_sender, noticed) = mpsc::channel();
        let stopped = Arc::new(AtomicBool::new(false));
        let in_flight = Arc::new(AtomicBool::new(false));
        let answering = Answering {
            backend,
            in_flight: Arc::clone(&in_flight),
            stopped: Arc::clone(&stopped),
        };
        spawn("host-secrets-answer", move || {
            answering.run(input, &received)
        });
        let reading = Reading {
            to_host: to_host.clone(),
            noticed: noticed_sender,
            in_flight,
            stopped: Arc::clone(&stopped),
        };
        spawn("host-secrets-read", move || reading.run(output));
        Self {
            to_host,
            stopped,
            noticed,
        }
    }

    /// True once the channel stopped: the host broke its rules, or its
    /// output ended. Its input is closed then, so it stops.
    pub(crate) fn is_stopped(&self) -> bool {
        self.stopped.load(Ordering::SeqCst)
    }

    /// Queues `notice` for the host's input, after any answer being
    /// written. False once the channel stopped.
    pub(crate) fn notify(&self, notice: Vec<u8>) -> bool {
        !self.is_stopped() && self.to_host.send(ToHost::Notice(notice)).is_ok()
    }

    /// Waits until `deadline` for the host's `noticed` answer for `folder`,
    /// skipping answers for folders an earlier wait gave up on. False when
    /// the deadline passed or the channel stopped first.
    pub(crate) fn wait_noticed(&self, folder: &str, deadline: Instant) -> bool {
        loop {
            let left = deadline.saturating_duration_since(Instant::now());
            match self.noticed.recv_timeout(left) {
                Ok(noticed) if noticed == folder => return true,
                Ok(_) => {}
                Err(RecvTimeoutError::Timeout | RecvTimeoutError::Disconnected) => return false,
            }
        }
    }

    /// Closes the host's input once any answer being written is. Stopping
    /// twice does nothing.
    pub(crate) fn stop(&self) {
        self.stopped.store(true, Ordering::SeqCst);
        // The thread holding the input may have ended already; then it's closed.
        let _ = self.to_host.send(ToHost::Close);
    }
}

impl Drop for LoopbackSecrets {
    fn drop(&mut self) {
        self.stop();
    }
}

impl std::fmt::Debug for LoopbackSecrets {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("LoopbackSecrets")
            .field("stopped", &self.is_stopped())
            .finish_non_exhaustive()
    }
}

/// The thread that reads the host's frames.
struct Reading {
    to_host: Sender<ToHost>,
    /// Where the host's `noticed` answers go.
    noticed: Sender<String>,
    /// Set when a request arrives, cleared just before its answer is written.
    in_flight: Arc<AtomicBool>,
    stopped: Arc<AtomicBool>,
}

impl Reading {
    /// Passes each request on, and each `noticed` answer to the waiting
    /// call, until the output ends or breaks the rules, then closes the
    /// host's input.
    fn run(self, mut output: impl Read) {
        while let Some(HostFrame { id, kind, bytes }) = read_host_frame(&mut output) {
            if id == HOST_SECRETS_ID
                && kind == DATA
                && let Some(folder) = noticed_folder(&bytes)
            {
                // Nobody may wait any more: the shell gave up on it.
                let _ = self.noticed.send(folder);
                continue;
            }
            let one_request = id == HOST_SECRETS_ID
                && kind == DATA
                && !self.in_flight.swap(true, Ordering::SeqCst);
            if !one_request || self.to_host.send(ToHost::Request(bytes)).is_err() {
                break;
            }
        }
        self.stopped.store(true, Ordering::SeqCst);
        let _ = self.to_host.send(ToHost::Close);
    }
}

/// The thread that answers requests and alone writes to the host's input.
struct Answering {
    backend: Arc<dyn SecretBackend>,
    in_flight: Arc<AtomicBool>,
    stopped: Arc<AtomicBool>,
}

impl Answering {
    /// Answers each request in order until a close, a refused request or a
    /// failed write, then drops `input`, which closes it.
    fn run(self, mut input: impl Write, received: &Receiver<ToHost>) {
        for message in received {
            let request = match message {
                ToHost::Request(request) => request,
                ToHost::Notice(notice) => {
                    if write_frame(&mut input, &notice).is_err() {
                        break;
                    }
                    continue;
                }
                ToHost::Close => break,
            };
            let Ok(answer) = answer(self.backend.as_ref(), &request) else {
                break;
            };
            // The channel may have stopped while the keychain worked, on a
            // second request for one: then the host gets no answer.
            if self.stopped.load(Ordering::SeqCst) {
                break;
            }
            // Cleared first: the host may send its next request as soon as
            // it has this answer.
            self.in_flight.store(false, Ordering::SeqCst);
            if write_frame(&mut input, &answer).is_err() {
                break;
            }
        }
        self.stopped.store(true, Ordering::SeqCst);
        drop(input);
    }
}

/// Writes `bytes` to the host's input as one `data` frame on id 0.
fn write_frame(input: &mut impl Write, bytes: &[u8]) -> std::io::Result<()> {
    input.write_all(&frame(HOST_SECRETS_ID, DATA, bytes))?;
    input.flush()
}

fn spawn(name: &str, work: impl FnOnce() + Send + 'static) {
    // Without the thread, the pipe end it was given is dropped: the host's
    // input or output closes, so the host stops and the shell starts a new one.
    let _ = thread::Builder::new().name(name.to_owned()).spawn(work);
}

#[cfg(test)]
mod tests;
