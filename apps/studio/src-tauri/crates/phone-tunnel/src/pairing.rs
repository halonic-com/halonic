//! One pairing at a time (requirement `phone-tunnel-pairing`). Starting
//! runs pairing messages 1 to 3 and answers the check code; the wait for
//! the computer's Allow starts at once, in the same task, so the
//! connection is never left idle and the 130 seconds count from message 3
//! (Liam and Julian on HAL-15208). The page's wait only collects it.

use std::sync::{Arc, PoisonError};

use halonic_device_keys::{
    ComputerId, DeviceKeyPair, DeviceKeyStore, NewPairing, PairedComputer, PrivateKey,
};
use halonic_tunnel::{Paired, PairingProblem, PairingRequest, start_pairing};
use tokio::sync::oneshot;
use tokio::task::AbortHandle;

use crate::answers::{ComputerView, PairingOutcome, PairingStep, Problem};
use crate::service::PhoneTunnel;
use crate::start::PairingStart;

/// The computer's answer once Allow is pressed, or why not.
type Answer = Result<Paired, PairingProblem>;

/// The pairing in progress. Aborting its task drops the connection, which
/// ends the pairing on the computer too.
pub(crate) struct RunningPairing {
    serial: u64,
    task: AbortHandle,
    /// Taken by the page's wait.
    answer: Option<oneshot::Receiver<Answer>>,
    again: Option<ComputerId>,
}

impl<S: DeviceKeyStore + 'static> PhoneTunnel<S> {
    /// Starts a pairing, ending any other one, and answers at the check
    /// code or with why it stopped. Cancelled or replaced before the check
    /// code, it answers `code-ended`.
    pub async fn pair_start(&self, start: PairingStart) -> PairingStep {
        let checked = match start.check() {
            Ok(checked) => checked,
            Err(problem) => return PairingStep::Stopped(problem),
        };
        if let Err(problem) = self.allow_local_network(&checked.endpoints).await {
            return PairingStep::Stopped(problem);
        }
        let request = PairingRequest {
            endpoints: checked.endpoints,
            code: checked.code,
            route: checked.route,
            phone: self.host.phone().await,
        };
        let (check_sender, check) = oneshot::channel();
        let (answer_sender, answer) = oneshot::channel();
        let dialer = self.dialer.clone();
        let options = self.options.pairing;
        let task = tokio::spawn(async move {
            let at_check = match start_pairing(request, dialer, options).await {
                Ok(at_check) => at_check,
                Err(problem) => {
                    let _ = check_sender.send(Err(problem));
                    return;
                }
            };
            let shown = (
                at_check.host_name.clone(),
                at_check.check_code.as_str().to_owned(),
            );
            let _ = check_sender.send(Ok(shown));
            let _ = answer_sender.send(at_check.wait_for_allow().await);
        });
        let serial = self.next_serial();
        self.replace_pairing(Some(RunningPairing {
            serial,
            task: task.abort_handle(),
            answer: Some(answer),
            again: checked.again,
        }));
        match check.await {
            Ok(Ok((computer_name, check_code))) => PairingStep::Check {
                computer_name,
                check_code,
            },
            Ok(Err(problem)) => {
                self.end_pairing(serial);
                PairingStep::Stopped(problem.into())
            }
            Err(_) => PairingStep::Stopped(Problem::CodeEnded),
        }
    }

    /// Waits for the computer's Allow on the pairing at its check code.
    /// Once allowed, the computer is listed with the phone's new key, and
    /// any connection to it under an earlier key is ended. With no pairing
    /// at the check code, or one cancelled while waiting, it answers
    /// `code-ended`.
    pub async fn pair_wait(&self) -> PairingOutcome {
        let Some((serial, answer, again)) = self.take_answer() else {
            return PairingOutcome::Stopped(Problem::CodeEnded);
        };
        let answer = answer.await;
        self.end_pairing(serial);
        match answer {
            Ok(Ok(paired)) => self.keep(paired, again).await,
            Ok(Err(problem)) => PairingOutcome::Stopped(problem.into()),
            Err(_) => PairingOutcome::Stopped(Problem::CodeEnded),
        }
    }

    /// Ends the pairing in progress, if any: the person left the screen.
    pub fn pair_cancel(&self) {
        self.replace_pairing(None);
    }

    /// Lists the computer the person allowed, with its key.
    async fn keep(&self, paired: Paired, again: Option<ComputerId>) -> PairingOutcome {
        let pairing = NewPairing {
            name: paired.host_name,
            endpoint: paired.endpoint.to_string(),
            host_key: paired.host_key,
            paired_at_ms: (self.options.clock)(),
        };
        let pair = DeviceKeyPair {
            public: *paired.keys.public(),
            private: PrivateKey::new(*paired.keys.private()),
        };
        drop(paired.keys);
        let connections = Arc::clone(&self.connections);
        let kept = self
            .store
            .run(move |computers| {
                let id = computers.add(&pairing, &pair, again.as_ref())?;
                // Still under the store's lock, so the earlier connection
                // has nothing left to note once it is released; anything
                // it noted meanwhile is checked against the new key first.
                connections.end(&id);
                let details = computers.details(&id)?;
                Ok(PairedComputer { id, details })
            })
            .await;
        match kept {
            Ok(computer) => PairingOutcome::Paired(ComputerView::from(&computer)),
            Err(error) => {
                self.host
                    .log(&format!("keeping a paired computer: {error}"));
                PairingOutcome::Stopped(error.into())
            }
        }
    }

    /// Puts `next` in place of the pairing in progress, and ends that one.
    fn replace_pairing(&self, next: Option<RunningPairing>) {
        let mut pairing = self.pairing.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(earlier) = std::mem::replace(&mut *pairing, next) {
            earlier.task.abort();
        }
    }

    /// Ends the pairing `serial`, unless another has replaced it.
    fn end_pairing(&self, serial: u64) {
        let mut pairing = self.pairing.lock().unwrap_or_else(PoisonError::into_inner);
        if pairing
            .as_ref()
            .is_some_and(|running| running.serial == serial)
            && let Some(running) = pairing.take()
        {
            running.task.abort();
        }
    }

    /// The answer of the pairing in progress, which only one wait gets.
    fn take_answer(&self) -> Option<(u64, oneshot::Receiver<Answer>, Option<ComputerId>)> {
        let mut pairing = self.pairing.lock().unwrap_or_else(PoisonError::into_inner);
        let running = pairing.as_mut()?;
        let answer = running.answer.take()?;
        Some((running.serial, answer, running.again.clone()))
    }
}
