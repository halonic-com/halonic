//! The thread that reads the host's frames and passes them to the clients.

use std::io::Read;
use std::sync::Arc;
use std::sync::atomic::Ordering;

use super::{Broken, DATA, END, FRAME_LIMIT, HEADER_LENGTH, RESET, Shared, ToClient};

impl Shared {
    /// Reads the host's frames until its output ends or breaks the format,
    /// then stops the relay.
    pub(super) fn pass_host_frames(self: &Arc<Self>, mut output: impl Read) {
        let mut header = [0_u8; HEADER_LENGTH];
        while output.read_exact(&mut header).is_ok() {
            let id = u32::from_be_bytes([header[0], header[1], header[2], header[3]]);
            let kind = header[4];
            let length = u32::from_be_bytes([header[5], header[6], header[7], header[8]]);
            let Ok(length) = usize::try_from(length) else {
                break;
            };
            if length > FRAME_LIMIT {
                break;
            }
            let mut bytes = vec![0_u8; length];
            if output.read_exact(&mut bytes).is_err() {
                break;
            }
            let passed = match kind {
                DATA => self.to_client(id, ToClient::Data(bytes)),
                END => self.to_client(id, ToClient::End),
                RESET => self.host_reset(id),
                // Only the relay opens connections; any other kind is unknown.
                _ => Err(Broken),
            };
            if passed.is_err() {
                break;
            }
        }
        self.stop();
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
