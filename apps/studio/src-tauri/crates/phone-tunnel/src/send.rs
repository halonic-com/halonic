//! Sending the page's gateway messages into a computer's open session, and
//! ending a session the page refuses (requirement
//! `phone-tunnel-messages`). There is no queue and no retry: a message
//! that can't go out now is refused, and the page decides what to do.

use halonic_device_keys::{ComputerId, DeviceKeyStore};

use crate::messages::{SendRefusal, check_message};
use crate::service::PhoneTunnel;

impl<S: DeviceKeyStore + 'static> PhoneTunnel<S> {
    /// Seals `text` into the computer's session of `generation` and sends
    /// it. Refuses, and sends nothing, when that isn't the session open on
    /// the computer's connection (a reconnect, another computer, a
    /// disconnect, Removed or Forget all end it), or when the message fails
    /// [`check_message`]. A refusal leaves the session open.
    pub async fn send(
        &self,
        computer: &str,
        generation: u64,
        text: &str,
    ) -> Result<(), SendRefusal> {
        let id = ComputerId::parse(computer).map_err(|_| SendRefusal::NotOpen)?;
        let (connection, number) = self
            .connections
            .session(&id, generation)
            .ok_or(SendRefusal::NotOpen)?;
        check_message(text)?;
        // The connection seals only into the session it numbered `number`,
        // so a session that ended since the lookup refuses it there.
        connection
            .send(number, text.as_bytes().to_vec())
            .await
            .map_err(|_| SendRefusal::NotOpen)
    }

    /// Ends the computer's session of `generation`, as the page does when
    /// it refuses a host message. The computer stays connected: the phone
    /// reconnects after its backoff, which this doesn't start again.
    /// Answers false, and does nothing, unless that session is open.
    pub fn end_session(&self, computer: &str, generation: u64) -> bool {
        let Ok(id) = ComputerId::parse(computer) else {
            return false;
        };
        let Some((connection, number)) = self.connections.take_session(&id, generation) else {
            return false;
        };
        connection.end_session(number);
        true
    }
}
