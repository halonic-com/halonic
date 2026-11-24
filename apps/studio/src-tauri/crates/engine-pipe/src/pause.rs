use crate::messages::pause_routines_json;

/// The user's Pause routines for one workspace, as the shell keeps it while
/// it runs: one per workspace, in memory only, so a full Quit forgets it and
/// the next start isn't paused. An engine starts with routines paused until
/// its first `pause_routines`, so the shell sends [`Self::after_handshake`]
/// after every handshake, also of an engine started again after a crash, and
/// that engine never resumes routines the user paused.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct RoutinePause {
    paused: bool,
}

impl RoutinePause {
    /// Whether the user paused this workspace's routines.
    pub fn is_paused(self) -> bool {
        self.paused
    }

    /// Pauses or resumes, and gives the `pause_routines` frame's JSON to send
    /// to the running engine, if one runs.
    pub fn set(&mut self, paused: bool) -> Vec<u8> {
        self.paused = paused;
        pause_routines_json(paused)
    }

    /// The `pause_routines` frame's JSON to send after an engine's handshake:
    /// sent whether paused or not, as the engine waits for it to tick at all.
    pub fn after_handshake(self) -> Vec<u8> {
        pause_routines_json(self.paused)
    }
}
