//! The services the shell sends steps to, with their fixed API origins.
//!
//! The origin is Rust code, not part of the route list: the list is
//! generated from the catalog, and a route may only name a service listed
//! here. Adding a service adds an origin to the shell, so it is a security
//! review (architecture note on HAL-17491, 3.3).

/// How a service wraps its answers.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AnswerShape {
    /// The answer is the object itself, and a failure's text is its
    /// `message` (GitHub).
    Plain,
    /// The answer is `{ success, errors: [{ code, message }], result }`, and
    /// a list's size is in `result_info.total_count` (Cloudflare).
    Envelope,
}

/// One service the shell can send to.
#[derive(Debug, PartialEq, Eq)]
pub struct Service {
    /// The catalog's name for it, such as `github`.
    pub name: &'static str,
    /// Where every call goes: `https`, a host and nothing else.
    pub api_origin: &'static str,
    /// The fixed path every route's path goes under, such as `/client/v4`,
    /// or `""`. Shell code, like the origin, so the list can't change it.
    pub base_path: &'static str,
    /// Headers the service's API asks for, sent with every call. Never a
    /// token: the shell adds `Authorization` itself.
    pub headers: &'static [(&'static str, &'static str)],
    pub answers: AnswerShape,
}

/// GitHub's REST API (decision 2 on HAL-17491: a GitHub App's user token).
pub const GITHUB: Service = Service {
    name: "github",
    api_origin: "https://api.github.com",
    base_path: "",
    headers: &[
        ("accept", "application/vnd.github+json"),
        ("x-github-api-version", "2022-11-28"),
    ],
    answers: AnswerShape::Plain,
};

/// Cloudflare's API v4, with a user API token the user pasted (note on
/// HAL-17491, 3.2; plan on HAL-17530).
pub const CLOUDFLARE: Service = Service {
    name: "cloudflare",
    api_origin: "https://api.cloudflare.com",
    base_path: "/client/v4",
    headers: &[("accept", "application/json")],
    answers: AnswerShape::Envelope,
};

/// Every service the shell can send to.
pub const SERVICES: [&Service; 2] = [&GITHUB, &CLOUDFLARE];

/// The service called `name`, or `None` when the shell doesn't send to it.
pub fn service(name: &str) -> Option<&'static Service> {
    SERVICES.into_iter().find(|service| service.name == name)
}
