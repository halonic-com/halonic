//! The agent host's and `wsl.exe`'s stderr, written into the shell's log.

use std::io::{self, BufRead, BufReader};
use std::process::Child;

/// The most of one stderr line [`log_stderr`] keeps. The rest of a longer
/// line is read and dropped: the log cuts a line at
/// [`halonic_shell_log::MAX_LINE_BYTES`], far less, so it would never be
/// written anyway.
const STDERR_LINE_LIMIT: usize = 64 * 1024;

/// Writes what `child` prints on stderr into the shell's log, a line at a
/// time, as `source`. A release build on Windows has no console, so stderr
/// passed on would go nowhere; and a pipe nobody reads would stall the
/// child once it is full, so a thread reads it until the child closes it.
pub(crate) fn log_stderr(child: &mut Child, source: &'static str) {
    let Some(stderr) = child.stderr.take() else {
        return;
    };
    std::thread::spawn(move || {
        read_lines(BufReader::new(stderr), |line| {
            halonic_shell_log::record_printed(source, line);
        });
    });
}

/// Hands each line of `stderr` to `record`, without its line break, until
/// `stderr` ends or fails. A line is handed on whole, however many reads it
/// takes to come in, so the key-shape check in `record_printed` sees all of
/// it and never half a key.
fn read_lines(mut stderr: impl BufRead, mut record: impl FnMut(&str)) {
    let mut line = Vec::new();
    loop {
        line.clear();
        match read_line_kept(&mut stderr, &mut line) {
            Ok(false) | Err(_) => return,
            Ok(true) => record(String::from_utf8_lossy(&line).trim_end()),
        }
    }
}

/// Reads one line of `reader` into `line`, keeping its first
/// [`STDERR_LINE_LIMIT`] bytes. The unfinished line of one read carries
/// over to the next, up to the line break or the end. `false` when `reader`
/// had ended already.
fn read_line_kept(reader: &mut impl BufRead, line: &mut Vec<u8>) -> io::Result<bool> {
    let mut read_any = false;
    loop {
        let available = match reader.fill_buf() {
            Ok(available) => available,
            Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
            Err(error) => return Err(error),
        };
        if available.is_empty() {
            return Ok(read_any);
        }
        read_any = true;
        let (part, ended) = match available.iter().position(|&byte| byte == b'\n') {
            Some(end) => (&available[..=end], true),
            None => (available, false),
        };
        let room = STDERR_LINE_LIMIT.saturating_sub(line.len());
        line.extend_from_slice(&part[..part.len().min(room)]);
        let used = part.len();
        reader.consume(used);
        if ended {
            return Ok(true);
        }
    }
}

#[cfg(test)]
mod tests {
    use std::io::{BufReader, Cursor};

    use halonic_shell_log::find_key_shape;

    use super::{STDERR_LINE_LIMIT, read_lines};

    /// A made-up key: shaped like one, but no one's.
    fn key() -> String {
        format!("sk-proj-{}", "Ab3".repeat(6))
    }

    fn lines_of(reader: impl std::io::BufRead) -> Vec<String> {
        let mut lines = Vec::new();
        read_lines(reader, |line| lines.push(line.to_owned()));
        lines
    }

    #[test]
    fn hands_on_each_line_without_its_line_break() {
        let stderr = Cursor::new("listening on loopback\r\nready\nno line break");
        assert_eq!(
            lines_of(stderr),
            ["listening on loopback", "ready", "no line break"]
        );
    }

    #[test]
    fn a_key_split_across_two_reads_reaches_the_check_whole() {
        let key = key();
        let printed = format!("Error: 401 for {key}\n");
        let split_at = printed.find("Ab3Ab3").expect("the key's middle") + 4;
        // Each read gives at most `split_at` bytes, so the key comes in two.
        let stderr = BufReader::with_capacity(split_at, Cursor::new(printed));

        let lines = lines_of(stderr);

        assert_eq!(lines, [format!("Error: 401 for {key}")]);
        assert_eq!(find_key_shape(&lines[0]), Some("ai-provider-key"));
    }

    #[test]
    fn a_key_across_the_line_limit_never_starts_a_line_of_its_own() {
        let filler = "x ".repeat(STDERR_LINE_LIMIT / 2 - 5);
        let key = key();
        let printed = format!("{filler}{key}\nready\n");
        assert!(filler.len() < STDERR_LINE_LIMIT);
        assert!(filler.len() + key.len() > STDERR_LINE_LIMIT);

        let lines = lines_of(Cursor::new(printed));

        assert_eq!(lines.len(), 2, "the long line is one line");
        assert_eq!(lines[0].len(), STDERR_LINE_LIMIT);
        assert!(lines[0].ends_with("sk-proj-Ab"), "cut at the limit");
        assert!(!lines.iter().any(|line| line.contains("Ab3Ab3")));
        assert_eq!(lines[1], "ready");
    }
}
