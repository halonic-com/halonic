//! A stream's lines, for the routes that answer with NDJSON (`routes.rs`).

/// Splits a stream's bytes into its lines, without the newline. A line
/// longer than the limit stops the stream rather than fill the shell's
/// memory: the host never sends one near it.
#[derive(Debug)]
pub struct LineSplitter {
    pending: Vec<u8>,
    limit: usize,
}

/// A line went past the splitter's limit before its newline came.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LineTooLong;

impl LineSplitter {
    pub fn new(limit: usize) -> Self {
        Self {
            pending: Vec::new(),
            limit,
        }
    }

    /// The whole lines `chunk` completes; empty lines are skipped.
    ///
    /// # Errors
    ///
    /// [`LineTooLong`] when the line still open grows past the limit.
    pub fn push(&mut self, chunk: &[u8]) -> Result<Vec<Vec<u8>>, LineTooLong> {
        let mut lines = Vec::new();
        for &byte in chunk {
            if byte == b'\n' {
                let line = std::mem::take(&mut self.pending);
                if !line.is_empty() {
                    lines.push(line);
                }
            } else {
                if self.pending.len() == self.limit {
                    return Err(LineTooLong);
                }
                self.pending.push(byte);
            }
        }
        Ok(lines)
    }

    /// The last line, when the stream ended without a newline after it.
    pub fn finish(self) -> Option<Vec<u8>> {
        (!self.pending.is_empty()).then_some(self.pending)
    }
}
