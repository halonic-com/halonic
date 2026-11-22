//! The thread that reads the host's frames and passes them to the clients.

use std::io::Read;
use std::sync::Arc;
use std::sync::atomic::Ordering;

use super::secrets::SecretRequests;
use super::{Broken, DATA, END, FRAME_LIMIT, HEADER_LENGTH, RESET, Shared, ToClient};
use crate::host_secrets::HOST_SECRETS_ID;

impl Shared {
    /// Reads the host's frames until its output ends or breaks the format,
    /// then stops the relay. Frames on id 0 are secret requests for
    /// `secrets`; without it, they break the stream as before.
    pub(super) fn pass_host_frames(
        self: &Arc<Self>,
        mut output: impl Read,
        secrets: Option<&SecretRequests>,
    ) {
        while let Some(HostFrame { id, kind, bytes }) = read_host_frame(&mut output) {
            let passed = match (id, secrets) {
                (HOST_SECRETS_ID, Some(secrets)) => secrets.pass(kind, bytes),
                _ => self.pass_to_client(id, kind, bytes),
            };
            if passed.is_err() {
                break;
            }
        }
        self.stop();
    }

    /// Passes one of the host's frames to its connection's client. A frame
    /// on id 0 lands here only when the host has no secrets channel, and
    /// breaks the stream like any id never opened.
    fn pass_to_client(&self, id: u32, kind: u8, bytes: Vec<u8>) -> Result<(), Broken> {
        match kind {
            DATA => self.to_client(id, ToClient::Data(bytes)),
            END => self.to_client(id, ToClient::End),
            RESET => self.host_reset(id),
            // Only the relay opens connections; any other kind is unknown.
            _ => Err(Broken),
        }
    }

    /// Queues the host's bytes or end for a connection's client. A frame
    /// for a connection that has closed is dropped; one for an id never
    /// opened breaks the stream.
    fn to_client(&self, id: u32, message: ToClient) -> Result<(), Broken> {
        let mut connections = self.connections();
        if id == 0 || id > connections.last_id {
            return Err(Broken);
        }
        let Some(connection) = connections.open.get(&id) else {
            return Ok(());
        };
        if let ToClient::Data(bytes) = &message {
            let waiting = connection.backlog.fetch_add(bytes.len(), Ordering::SeqCst);
            if waiting + bytes.len() > self.limits.backlog {
                if let Some(connection) = connections.open.remove(&id) {
                    connection.shut();
                }
                drop(connections);
                // Doesn't wait on the host's input, which may be full.
                let _ = self.send(id, RESET, &[]);
                return Ok(());
            }
        }
        // The client's writer only ends after the connection closes.
        let _ = connection.to_client.send(message);
        Ok(())
    }

    fn host_reset(&self, id: u32) -> Result<(), Broken> {
        if id == 0 || id > self.connections().last_id {
            return Err(Broken);
        }
        self.close(id);
        Ok(())
    }
}

/// One frame the host wrote to its standard output.
pub(crate) struct HostFrame {
    pub(crate) id: u32,
    pub(crate) kind: u8,
    pub(crate) bytes: Vec<u8>,
}

/// Reads the host's next frame from `output`: `None` when the output ended
/// or failed, ended in the middle of a frame, or announced more than
/// [`FRAME_LIMIT`] bytes. The stream can't go on after any of them.
pub(crate) fn read_host_frame(output: &mut impl Read) -> Option<HostFrame> {
    let mut header = [0_u8; HEADER_LENGTH];
    output.read_exact(&mut header).ok()?;
    let id = u32::from_be_bytes([header[0], header[1], header[2], header[3]]);
    let kind = header[4];
    let length = u32::from_be_bytes([header[5], header[6], header[7], header[8]]);
    let length = usize::try_from(length).ok()?;
    if length > FRAME_LIMIT {
        return None;
    }
    let mut bytes = vec![0_u8; length];
    output.read_exact(&mut bytes).ok()?;
    Some(HostFrame { id, kind, bytes })
}
