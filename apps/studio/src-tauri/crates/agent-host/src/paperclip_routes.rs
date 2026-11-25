//! The agent host's Paperclip and agent messaging routes a page may call
//! through the shell, by name, as in `routes.rs`, which looks them up here.

use crate::route_kinds::{Answer, Method, Route, route};

/// Every Paperclip and agent messaging route a page may call, by its name.
pub(crate) const PAPERCLIP_ROUTES: &[(&str, Route)] = &[
    // A Paperclip connection's key, handed over when the person connects
    // (HAL-17495): the host keeps it in memory only, with the address and
    // company it was made for, and answers no key.
    (
        "POST /v1/paperclip/key",
        route(Method::Post, "/v1/paperclip/key", Answer::Json),
    ),
    // Disconnect and the desktop engine's AgentMessaging (HAL-17438); no key comes back.
    (
        "POST /v1/paperclip/disconnect",
        route(Method::Post, "/v1/paperclip/disconnect", Answer::Json),
    ),
    // Settings › Connections and the Paperclip sign-in (HAL-17439, HAL-17897):
    // only the first approved poll answers the key, once, for the keychain.
    (
        "POST /v1/paperclip/connections",
        route(Method::Post, "/v1/paperclip/connections", Answer::Json),
    ),
    (
        "POST /v1/paperclip/sign-in/start",
        route(Method::Post, "/v1/paperclip/sign-in/start", Answer::Json),
    ),
    (
        "POST /v1/paperclip/sign-in/poll",
        route(Method::Post, "/v1/paperclip/sign-in/poll", Answer::Json),
    ),
    (
        "POST /v1/paperclip/sign-in/confirm",
        route(Method::Post, "/v1/paperclip/sign-in/confirm", Answer::Json),
    ),
    (
        "POST /v1/paperclip/sign-in/cancel",
        route(Method::Post, "/v1/paperclip/sign-in/cancel", Answer::Json),
    ),
    (
        "POST /v1/messaging/read",
        route(Method::Post, "/v1/messaging/read", Answer::Json),
    ),
    (
        "POST /v1/messaging/answer",
        route(Method::Post, "/v1/messaging/answer", Answer::Json),
    ),
    (
        "POST /v1/messaging/send",
        route(Method::Post, "/v1/messaging/send", Answer::Json),
    ),
    (
        "POST /v1/messaging/attachment",
        route(Method::Post, "/v1/messaging/attachment", Answer::Json),
    ),
    (
        "POST /v1/messaging/changes",
        route(Method::Post, "/v1/messaging/changes", Answer::Json),
    ),
    // The Messenger's activity panel (HAL-18567): read-only, no log or output.
    (
        "POST /v1/messaging/runs",
        route(Method::Post, "/v1/messaging/runs", Answer::Json),
    ),
    (
        "POST /v1/messaging/pull-requests",
        route(Method::Post, "/v1/messaging/pull-requests", Answer::Json),
    ),
    (
        "POST /v1/messaging/focus",
        route(Method::Post, "/v1/messaging/focus", Answer::Json),
    ),
];
