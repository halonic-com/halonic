use std::fmt;

/// What broke the control pipe. On any fault the shell closes the engine's
/// standard input, kills it and counts it as a crash. A fault never holds
/// the frame's content, which may hold a secret.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PipeFault {
    /// A frame's length is 0 or over the cap.
    Length,
    /// The pipe ended inside a frame.
    Cut,
    /// Reading the engine's standard output failed.
    Read,
    /// Writing to the engine's standard input failed.
    Write,
    /// The frame isn't UTF-8 JSON, or isn't one of the engine's messages
    /// with exactly its fields.
    NotAMessage,
    /// A frame came before the handshake.
    BeforeHandshake,
    /// A second handshake.
    SecondHandshake,
    /// The handshake names another protocol version.
    Protocol,
    /// The handshake's address isn't `http://127.0.0.1:<port>`, or its
    /// token isn't 43 base64url characters.
    Handshake,
    /// A request id that isn't higher than every id before it.
    RequestId,
    /// `stopped` when the shell sent no `stop`, or a frame after `stopped`.
    Stopped,
}

impl fmt::Display for PipeFault {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let text = match self {
            PipeFault::Length => "a frame's length is zero or over the cap",
            PipeFault::Cut => "the pipe ended inside a frame",
            PipeFault::Read => "reading the pipe failed",
            PipeFault::Write => "writing to the pipe failed",
            PipeFault::NotAMessage => "a frame isn't one of the engine's messages",
            PipeFault::BeforeHandshake => "a frame came before the handshake",
            PipeFault::SecondHandshake => "a second handshake",
            PipeFault::Protocol => "the handshake names another protocol version",
            PipeFault::Handshake => "the handshake's address or token is malformed",
            PipeFault::RequestId => "a request id was repeated or went down",
            PipeFault::Stopped => "`stopped` out of turn",
        };
        write!(formatter, "The engine's control pipe broke: {text}.")
    }
}

impl std::error::Error for PipeFault {}
