//! Decides which outbound HTTP requests the Studio page may have the shell
//! make for it (HAL-10348).
//!
//! This crate holds no Tauri types and makes no network call: the shell's
//! `http_fetch` command runs [`check_request`] on what the page sent, then
//! [`check_address`] on every address the host name resolves to, and again
//! for each redirect hop. A refusal is a value with a stable `code`, never a
//! panic, and never carries a header value, so a key can't end up in an error.
//!
//! When `HTTPS_PROXY` is set, [`route_for`] decides for each hop whether it
//! goes direct, with the address check, or through the proxy.

mod address;
mod no_proxy;
mod proxy;
mod request;

pub use address::check_address;
pub use no_proxy::NoProxy;
pub use proxy::{ProxyEndpoint, ProxySetting, Route, route_for};
pub use request::{
    CheckedRequest, MAX_BODY_BYTES, MAX_REDIRECTS, MAX_RESPONSE_BYTES, PageRequest, Refusal,
    check_redirect, check_request,
};
