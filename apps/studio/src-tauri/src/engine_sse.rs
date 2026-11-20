//! Reads the engine's server-sent events into frames the shell passes on to
//! the page. Only what the engine sends is read: `event`, `data` and `id`
//! fields, comments, and frames ended by a blank line. A frame larger than
//! the limit stops the stream rather than fill the shell's memory.

/// One event: its name (`message` when it names none), its data lines
/// joined by `\n`, and its id when it has one.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SseFrame {
    pub event: String,
    pub data: String,
    pub id: Option<String>,
}

/// Why the stream can't be read on.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SseFault {
    /// A frame went past the limit before it ended.
    TooLarge,
    /// A line isn't UTF-8 text.
    NotText,
}

/// Splits a stream's bytes into frames.
#[derive(Debug)]
pub struct SseReader {
    limit: usize,
    line: Vec<u8>,
    /// The bytes of the frame so far, the open line included.
    size: usize,
    event: Option<String>,
    data: Option<String>,
    id: Option<String>,
}

impl SseReader {
    pub fn new(limit: usize) -> Self {
        Self {
            limit,
            line: Vec::new(),
            size: 0,
            event: None,
            data: None,
            id: None,
        }
    }

    /// The frames `chunk` completes.
    ///
    /// # Errors
    ///
    /// [`SseFault`] when a frame grows past the limit or a line isn't text.
    pub fn push(&mut self, chunk: &[u8]) -> Result<Vec<SseFrame>, SseFault> {
        let mut frames = Vec::new();
        for &byte in chunk {
            self.size += 1;
            if self.size > self.limit {
                return Err(SseFault::TooLarge);
            }
            if byte != b'\n' {
                self.line.push(byte);
                continue;
            }
            let mut line = std::mem::take(&mut self.line);
            if line.last() == Some(&b'\r') {
                line.pop();
            }
            let line = String::from_utf8(line).map_err(|_| SseFault::NotText)?;
            if let Some(frame) = self.read_line(&line) {
                frames.push(frame);
            }
        }
        Ok(frames)
    }

    /// Takes one line in: a blank line ends the frame, when it has data.
    fn read_line(&mut self, line: &str) -> Option<SseFrame> {
        if line.is_empty() {
            return self.end_frame();
        }
        if line.starts_with(':') {
            return None;
        }
        let (field, value) = line.split_once(':').unwrap_or((line, ""));
        let value = value.strip_prefix(' ').unwrap_or(value);
        match field {
            "event" => self.event = Some(value.to_owned()),
            "data" => match self.data.as_mut() {
                Some(data) => {
                    data.push('\n');
                    data.push_str(value);
                }
                None => self.data = Some(value.to_owned()),
            },
            "id" if !value.contains('\0') => self.id = Some(value.to_owned()),
            _ => {}
        }
        None
    }

    fn end_frame(&mut self) -> Option<SseFrame> {
        self.size = 0;
        let event = self.event.take();
        let id = self.id.take();
        let data = self.data.take()?;
        Some(SseFrame {
            event: event.unwrap_or_else(|| "message".to_owned()),
            data,
            id,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::{SseFault, SseFrame, SseReader};

    fn frame(event: &str, data: &str, id: Option<&str>) -> SseFrame {
        SseFrame {
            event: event.to_owned(),
            data: data.to_owned(),
            id: id.map(str::to_owned),
        }
    }

    #[test]
    fn engine_sse_reads_frames_split_anywhere() {
        let text =
            b"id: 3\nevent: run\ndata: {\"seq\":3}\n\n: keep-alive\n\nevent: end\r\ndata:\r\n\r\n";
        let mut reader = SseReader::new(1024);
        let mut frames = Vec::new();
        for byte in text {
            frames.extend(reader.push(&[*byte]).expect("reads"));
        }
        assert_eq!(
            frames,
            [
                frame("run", "{\"seq\":3}", Some("3")),
                frame("end", "", None)
            ]
        );
    }

    #[test]
    fn engine_sse_joins_data_lines_and_names_an_unnamed_event_message() {
        let mut reader = SseReader::new(1024);
        let frames = reader
            .push(b"data: a\ndata: b\nretry: 5\n\nevent: x\n\n")
            .expect("reads");
        // The second frame has no data, so it is no event.
        assert_eq!(frames, [frame("message", "a\nb", None)]);
    }

    #[test]
    fn engine_sse_stops_at_a_frame_over_the_limit_or_a_line_that_isnt_text() {
        let mut reader = SseReader::new(16);
        assert_eq!(
            reader.push(b"data: 0123456789\n\n"),
            Err(SseFault::TooLarge)
        );
        let mut reader = SseReader::new(16);
        assert_eq!(
            reader.push(b"data: 0123\n\n").map(|frames| frames.len()),
            Ok(1)
        );
        assert_eq!(
            reader.push(b"data: 0123\n\n").map(|frames| frames.len()),
            Ok(1)
        );
        let mut reader = SseReader::new(16);
        assert_eq!(reader.push(b"data: \xff\n"), Err(SseFault::NotText));
    }
}
