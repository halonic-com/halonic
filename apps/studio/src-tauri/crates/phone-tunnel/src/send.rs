//! Sending the page's gateway messages into a computer's open session, and
//! ending a session the page refuses (requirement
//! `phone-tunnel-messages`). There is no queue and no retry: a message
//! that can't go out now is refused, and the page decides what to do. An
//! answer to an approval goes out only after the owner check passed for
//! it (board decision 4b, HAL-15194); an answer to an inbox item, after a
//! pass in the last 5 minutes (requirement `phone-answer-confirm`).

use std::time::Instant;

use halonic_device_keys::{ComputerId, DeviceKeyStore};

use crate::messages::{CheckedMessage, SendRefusal, check_message};
use crate::service::PhoneTunnel;

impl<S: DeviceKeyStore + 'static> PhoneTunnel<S> {
    /// Seals `text` into the computer's session of `generation` and sends
    /// it. Refuses, and sends nothing, when that isn't the session open on
    /// the computer's connection (a reconnect, another computer, a
    /// disconnect, Removed or Forget all end it), when the message fails
    /// [`check_message`], or when it answers an approval or an inbox item
    /// and the owner check didn't pass for it. A refusal leaves the session
    /// open.
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
        if let CheckedMessage::Answer(decision) = check_message(text)? {
            // The prompt may stay open for a while; the session it was for
            // may end meanwhile, and then the send below refuses it.
            let confirmation = self
                .answer_window
                .confirm(&*self.host, decision, Instant::now())
                .await;
            if !confirmation.is_confirmed() {
                return Err(SendRefusal::NotConfirmed);
            }
        }
        // The connection seals only into the session it numbered `number`,
        // so a session that ended since the lookup refuses it there. The
        // bytes it seals are the ones checked above.
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
