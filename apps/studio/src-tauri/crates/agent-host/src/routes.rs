//! The agent host's routes a page may call through the shell, by name
//! (`"POST /v1/sandbox/sessions/open"`), never by URL. The names match
//! `agentHostRequestRoutes` and `agentHostStreamRoutes` in
//! `packages/adapters/agent-host-client`, and its `shell-routes.test.ts` fails
//! when the two drift apart.

/// How a route is called.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Method {
    Get,
    Post,
}

/// Whether a route answers once with JSON or with an NDJSON stream.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Answer {
    Json,
    Stream,
}

/// One route of the host's table (`apps/agent-host/README.md`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Route {
    pub method: Method,
    pub path: &'static str,
    pub answer: Answer,
}

const fn route(method: Method, path: &'static str, answer: Answer) -> Route {
    Route {
        method,
        path,
        answer,
    }
}

/// Every route a page may call, by its name.
const ROUTES: &[(&str, Route)] = &[
    (
        "GET /v1/health",
        route(Method::Get, "/v1/health", Answer::Json),
    ),
    (
        "GET /v1/sandbox/check",
        route(Method::Get, "/v1/sandbox/check", Answer::Json),
    ),
    (
        "GET /v1/sandbox/capabilities",
        route(Method::Get, "/v1/sandbox/capabilities", Answer::Json),
    ),
    (
        "POST /v1/sandbox/sessions/open",
        route(Method::Post, "/v1/sandbox/sessions/open", Answer::Json),
    ),
    (
        "POST /v1/sandbox/sessions/blocked",
        route(Method::Post, "/v1/sandbox/sessions/blocked", Answer::Stream),
    ),
    (
        "POST /v1/sandbox/sessions/close",
        route(Method::Post, "/v1/sandbox/sessions/close", Answer::Json),
    ),
    (
        "POST /v1/bridge/open",
        route(Method::Post, "/v1/bridge/open", Answer::Stream),
    ),
    (
        "POST /v1/bridge/answer",
        route(Method::Post, "/v1/bridge/answer", Answer::Json),
    ),
    (
        "POST /v1/bridge/close",
        route(Method::Post, "/v1/bridge/close", Answer::Json),
    ),
    (
        "GET /v1/harnesses",
        route(Method::Get, "/v1/harnesses", Answer::Json),
    ),
    (
        "POST /v1/harnesses/detect",
        route(Method::Post, "/v1/harnesses/detect", Answer::Json),
    ),
    (
        "POST /v1/harnesses/sign-in",
        route(Method::Post, "/v1/harnesses/sign-in", Answer::Json),
    ),
    (
        "POST /v1/harnesses/runs/start",
        route(Method::Post, "/v1/harnesses/runs/start", Answer::Stream),
    ),
    (
        "POST /v1/harnesses/runs/send",
        route(Method::Post, "/v1/harnesses/runs/send", Answer::Json),
    ),
    (
        "POST /v1/harnesses/runs/cancel",
        route(Method::Post, "/v1/harnesses/runs/cancel", Answer::Json),
    ),
];

/// The route a page names, when it is one of the table's and answers as
/// `answer`; `None` for any other name.
pub fn find_route(name: &str, answer: Answer) -> Option<Route> {
    ROUTES
        .iter()
        .find(|(each, route)| *each == name && route.answer == answer)
        .map(|(_, route)| *route)
}

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
