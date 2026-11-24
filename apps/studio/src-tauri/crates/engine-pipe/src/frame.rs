use std::io::{ErrorKind, Read, Write};

use crate::fault::PipeFault;

/// The length prefix in front of each frame's JSON: a `u32`, big-endian.
pub const FRAME_LENGTH_BYTES: usize = 4;

/// The most JSON bytes in a frame the engine sends.
pub const MAX_ENGINE_FRAME_BYTES: usize = 64 * 1024;

/// The most JSON bytes in a frame the shell sends: a secret's value can be
/// up to 16 KiB, and JSON escapes a byte in at most 6.
pub const MAX_SHELL_FRAME_BYTES: usize = 128 * 1024;

/// Reads the next frame's JSON bytes from the engine's standard output.
/// The length is checked before anything is allocated for it, so a frame
/// never takes more than [`MAX_ENGINE_FRAME_BYTES`].
///
/// # Errors
///
/// [`PipeFault::Length`] for a length of 0 or over the cap,
/// [`PipeFault::Cut`] when the pipe ends inside a frame, and
/// [`PipeFault::Read`] when reading fails.
///
/// Returns `Ok(None)` when the pipe ends between frames: the engine exited.
pub fn read_frame(input: &mut impl Read) -> Result<Option<Vec<u8>>, PipeFault> {
    let mut prefix = [0_u8; FRAME_LENGTH_BYTES];
    let first = read_some(input, &mut prefix)?;
    if first == 0 {
        return Ok(None);
    }
    read_all(input, &mut prefix[first..])?;
    let length = usize::try_from(u32::from_be_bytes(prefix)).map_err(|_| PipeFault::Length)?;
    if length == 0 || length > MAX_ENGINE_FRAME_BYTES {
        return Err(PipeFault::Length);
    }
    let mut json = vec![0_u8; length];
    read_all(input, &mut json)?;
    Ok(Some(json))
}

/// Writes `json` as one frame to the engine's standard input.
///
/// # Errors
///
/// [`PipeFault::Length`] when `json` is empty or longer than
/// [`MAX_SHELL_FRAME_BYTES`], which the engine would refuse, and
/// [`PipeFault::Write`] when writing fails.
pub fn write_frame(output: &mut impl Write, json: &[u8]) -> Result<(), PipeFault> {
    if json.is_empty() || json.len() > MAX_SHELL_FRAME_BYTES {
        return Err(PipeFault::Length);
    }
    let length = u32::try_from(json.len()).map_err(|_| PipeFault::Length)?;
    let mut frame = Vec::with_capacity(FRAME_LENGTH_BYTES + json.len());
    frame.extend_from_slice(&length.to_be_bytes());
    frame.extend_from_slice(json);
    output
        .write_all(&frame)
        .and_then(|()| output.flush())
        .map_err(|_| PipeFault::Write)
}

/// Reads at least one byte into `buffer`, or none at the pipe's end.
fn read_some(input: &mut impl Read, buffer: &mut [u8]) -> Result<usize, PipeFault> {
    loop {
        match input.read(buffer) {
            Ok(count) => return Ok(count),
            Err(error) if error.kind() == ErrorKind::Interrupted => {}
            Err(_) => return Err(PipeFault::Read),
        }
    }
}

fn read_all(input: &mut impl Read, buffer: &mut [u8]) -> Result<(), PipeFault> {
    input
        .read_exact(buffer)
        .map_err(|error| match error.kind() {
            ErrorKind::UnexpectedEof => PipeFault::Cut,
            _ => PipeFault::Read,
        })
}
