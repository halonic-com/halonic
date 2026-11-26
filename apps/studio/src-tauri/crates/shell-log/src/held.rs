//! The lines recorded before the log starts (HAL-19260). A plugin's `setup`
//! runs before the app's, which is where the log starts, so what a plugin
//! records at start, such as quick ask's keys that can't be read, would
//! reach stderr only, which a release build doesn't show. They are held
//! here and written once the log starts.

/// How many lines are held before the log starts: far more than the
/// shell records at start, so a profile that never gives a log can't make
/// the held lines grow without end.
pub const MAX_HELD_LINES: usize = 100;

/// Lines waiting for the log, oldest first, and how many came after it was
/// full.
#[derive(Debug, Default)]
pub struct HeldLines {
    lines: Vec<String>,
    left_out: usize,
}

impl HeldLines {
    /// No lines held.
    pub const fn new() -> Self {
        Self {
            lines: Vec::new(),
            left_out: 0,
        }
    }

    /// Holds `line`, or counts it as left out once [`MAX_HELD_LINES`] are
    /// held. The first lines are kept: they say what went wrong first.
    pub fn hold(&mut self, line: String) {
        if self.lines.len() < MAX_HELD_LINES {
            self.lines.push(line);
        } else {
            self.left_out += 1;
        }
    }

    /// The held lines, oldest first, and how many were left out. Nothing
    /// is held afterwards.
    pub fn take(&mut self) -> (Vec<String>, usize) {
        let left_out = std::mem::take(&mut self.left_out);
        (std::mem::take(&mut self.lines), left_out)
    }
}
