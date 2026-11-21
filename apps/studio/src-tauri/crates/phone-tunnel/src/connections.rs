//! The connections to paired computers, one per computer, and each one's
//! latest status.

use std::collections::HashMap;
use std::sync::{Mutex, PoisonError};

use halonic_device_keys::ComputerId;
use halonic_tunnel::PhoneConnection;
use tokio::task::AbortHandle;

use crate::status::PageStatus;

/// A computer's connection: still opening, or open with the task that
/// passes its events on.
enum Running {
    Opening {
        serial: u64,
    },
    Open {
        serial: u64,
        connection: PhoneConnection,
        events: AbortHandle,
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
            connection,
            events,
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
