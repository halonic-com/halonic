//! The connections to paired computers, one per computer, each one's open
//! session, and each one's latest status.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, PoisonError};

use halonic_device_keys::ComputerId;
use halonic_tunnel::{PhoneConnection, SessionNumber};
use tokio::task::AbortHandle;

use crate::status::PageStatus;

/// A session open on a computer's connection: the number its connection
/// gave it, and the generation the page knows it by.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct OpenSession {
    pub(crate) number: SessionNumber,
    pub(crate) generation: u64,
}

/// A computer's connection: still opening, or open with the task that
/// passes its events on and the session open on it, if any.
enum Running {
    Opening {
        serial: u64,
    },
    Open {
        serial: u64,
        connection: Arc<PhoneConnection>,
        events: AbortHandle,
        session: Option<OpenSession>,
    },
}

impl Running {
    fn serial(&self) -> u64 {
        match self {
            Self::Opening { serial } | Self::Open { serial, .. } => *serial,
        }
    }

    /// Closes the connection and stops passing its events on.
    fn end(self) {
        if let Self::Open {
            connection, events, ..
        } = self
        {
            events.abort();
            connection.close();
        }
    }
}

/// What [`Connections::begin`] found.
pub(crate) enum Begin {
    /// Nothing ran: the caller opens the connection under its serial.
    Opening,
    /// A connection already runs or is opening. One that waits to
    /// reconnect was told to try now.
    Running,
}

#[derive(Default)]
pub(crate) struct Connections {
    running: Mutex<HashMap<ComputerId, Running>>,
    statuses: Mutex<HashMap<ComputerId, PageStatus>>,
}

impl Connections {
    /// Notes a connection to `computer` that `serial` is opening, unless
    /// one runs or is opening already.
    pub(crate) fn begin(&self, computer: &ComputerId, serial: u64) -> Begin {
        let mut running = self.running.lock().unwrap_or_else(PoisonError::into_inner);
        match running.get(computer) {
            Some(Running::Open { connection, .. }) => {
                connection.try_now();
                Begin::Running
            }
            Some(Running::Opening { .. }) => Begin::Running,
            None => {
                running.insert(computer.clone(), Running::Opening { serial });
                Begin::Opening
            }
        }
    }

    /// The connection `serial` opened: keeps it with the task that passes
    /// its events on. When the page disconnected or forgot the computer
    /// meanwhile, it answers false and ends both.
    pub(crate) fn opened(
        &self,
        computer: &ComputerId,
        serial: u64,
        connection: PhoneConnection,
        events: AbortHandle,
    ) -> bool {
        let mut running = self.running.lock().unwrap_or_else(PoisonError::into_inner);
        let opening = running.get(computer).is_some_and(|noted| {
            matches!(noted, Running::Opening { .. }) && noted.serial() == serial
        });
        let open = Running::Open {
            serial,
            connection: Arc::new(connection),
            events,
            session: None,
        };
        if !opening {
            open.end();
            return false;
        }
        running.insert(computer.clone(), open);
        true
    }

    /// Forgets the connection `serial`, which didn't open or has ended by
    /// itself, unless another has taken its place.
    pub(crate) fn finished(&self, computer: &ComputerId, serial: u64) {
        let mut running = self.running.lock().unwrap_or_else(PoisonError::into_inner);
        if running
            .get(computer)
            .is_some_and(|noted| noted.serial() == serial)
        {
            running.remove(computer);
        }
    }

    /// Notes the session that opened on connection `serial`, unless another
    /// connection has taken its place. Answers whether it was noted.
    pub(crate) fn session_opened(
        &self,
        computer: &ComputerId,
        serial: u64,
        opened: OpenSession,
    ) -> bool {
        let mut running = self.running.lock().unwrap_or_else(PoisonError::into_inner);
        match running.get_mut(computer) {
            Some(Running::Open {
                serial: current,
                session,
                ..
            }) if *current == serial => {
                *session = Some(opened);
                true
            }
            _ => false,
        }
    }

    /// Forgets the session on connection `serial`: it has ended.
    pub(crate) fn session_ended(&self, computer: &ComputerId, serial: u64) {
        let mut running = self.running.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(Running::Open {
            serial: current,
            session,
            ..
        }) = running.get_mut(computer)
            && *current == serial
        {
            *session = None;
        }
    }

    /// The connection to send on and the session's number, when
    /// `generation` is the session open on the computer's connection.
    pub(crate) fn session(
        &self,
        computer: &ComputerId,
        generation: u64,
    ) -> Option<(Arc<PhoneConnection>, SessionNumber)> {
        let running = self.running.lock().unwrap_or_else(PoisonError::into_inner);
        match running.get(computer) {
            Some(Running::Open {
                connection,
                session: Some(open),
                ..
            }) if open.generation == generation => Some((Arc::clone(connection), open.number)),
            _ => None,
        }
    }

    /// Like [`Self::session`], and forgets the session, so nothing more is
    /// sent into it while it ends.
    pub(crate) fn take_session(
        &self,
        computer: &ComputerId,
        generation: u64,
    ) -> Option<(Arc<PhoneConnection>, SessionNumber)> {
        let mut running = self.running.lock().unwrap_or_else(PoisonError::into_inner);
        match running.get_mut(computer) {
            Some(Running::Open {
                connection,
                session,
                ..
            }) if session.is_some_and(|open| open.generation == generation) => {
                let open = session.take()?;
                Some((Arc::clone(connection), open.number))
            }
            _ => None,
        }
    }

    /// Whether `serial` is the computer's current connection.
    pub(crate) fn is_current(&self, computer: &ComputerId, serial: u64) -> bool {
        let running = self.running.lock().unwrap_or_else(PoisonError::into_inner);
        running
            .get(computer)
            .is_some_and(|noted| noted.serial() == serial)
    }

    /// Ends the computer's connection, if any. Answers whether one ran.
    pub(crate) fn end(&self, computer: &ComputerId) -> bool {
        let ended = self
            .running
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .remove(computer);
        match ended {
            Some(running) => {
                running.end();
                true
            }
            None => false,
        }
    }

    pub(crate) fn status(&self, computer: &ComputerId) -> Option<PageStatus> {
        let statuses = self.statuses.lock().unwrap_or_else(PoisonError::into_inner);
        statuses.get(computer).copied()
    }

    pub(crate) fn set_status(&self, computer: &ComputerId, status: PageStatus) {
        let mut statuses = self.statuses.lock().unwrap_or_else(PoisonError::into_inner);
        statuses.insert(computer.clone(), status);
    }

    pub(crate) fn forget_status(&self, computer: &ComputerId) {
        let mut statuses = self.statuses.lock().unwrap_or_else(PoisonError::into_inner);
        statuses.remove(computer);
    }

    pub(crate) fn statuses(&self) -> Vec<(ComputerId, PageStatus)> {
        let statuses = self.statuses.lock().unwrap_or_else(PoisonError::into_inner);
        statuses
            .iter()
            .map(|(computer, status)| (computer.clone(), *status))
            .collect()
    }
}
