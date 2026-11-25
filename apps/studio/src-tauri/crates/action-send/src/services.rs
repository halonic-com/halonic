//! The services the shell sends steps to, with their fixed API origins.
//!
//! The origin is Rust code, not part of the route list: the list is
//! generated from the catalog, and a route may only name a service listed
//! here. Adding a service adds an origin to the shell, so it is a security
//! review (architecture note on HAL-17491, 3.3).

/// One service the shell can send to.
#[derive(Debug, PartialEq, Eq)]
pub struct Service {
    /// The catalog's name for it, such as `github`.
    pub name: &'static str,
    /// Where every call goes: `https`, a host and nothing else.
    pub api_origin: &'static str,
    /// Headers the service's API asks for, sent with every call. Never a
    /// token: the shell adds `Authorization` itself.
    pub headers: &'static [(&'static str, &'static str)],
}

/// GitHub's REST API (decision 2 on HAL-17491: a GitHub App's user token).
pub const GITHUB: Service = Service {
    name: "github",
    api_origin: "https://api.github.com",
    headers: &[
        ("accept", "application/vnd.github+json"),
        ("x-github-api-version", "2022-11-28"),
    ],
};

/// Every service the shell can send to. Cloudflare joins with its sign-in.
pub const SERVICES: [&Service; 1] = [&GITHUB];

/// The service called `name`, or `None` when the shell doesn't send to it.
pub fn service(name: &str) -> Option<&'static Service> {
    SERVICES.into_iter().find(|service| service.name == name)
}
