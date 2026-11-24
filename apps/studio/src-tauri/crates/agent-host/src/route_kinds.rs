//! What a route of the shell's table is: how it is called and how it
//! answers. The table itself, which `shell-routes.test.ts` in
//! `packages/adapters/agent-host-client` reads, is in `routes.rs`.

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

/// A route of the table, written in one line of it.
pub(crate) const fn route(method: Method, path: &'static str, answer: Answer) -> Route {
    Route {
        method,
        path,
        answer,
    }
}
