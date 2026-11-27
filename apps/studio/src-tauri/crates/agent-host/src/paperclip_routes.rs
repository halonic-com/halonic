//! The agent host's Paperclip and agent messaging routes a page may call
//! through the shell, by name, as in `routes.rs`, which looks them up here.

use crate::route_kinds::{Answer, Method, Route, route};

/// The sign-in's confirm, which says the keychain has the approved key. Only
/// the shell sends it, once it has written the key (`paperclip_keep.rs`,
/// HAL-20278), so it isn't in [`PAPERCLIP_ROUTES`] and no page can name it.
pub const SIGN_IN_CONFIRM: Route =
    route(Method::Post, "/v1/paperclip/sign-in/confirm", Answer::Json);

/// The sign-in's cancel, as the shell sends it when it couldn't keep the
/// approved key, so the host revokes it. A page may cancel too, through
/// [`PAPERCLIP_ROUTES`].
pub const SIGN_IN_CANCEL: Route = route(Method::Post, "/v1/paperclip/sign-in/cancel", Answer::Json);

/// A Paperclip connection's key, handed back to the host when a workspace
/// opens (HAL-17495): the host keeps it in memory only, with the address and
/// company it was made for, and answers no key. Only the shell sends it,
/// from the keychain entry it keeps (`paperclip_restore.rs`, HAL-20278), so
/// it isn't in [`PAPERCLIP_ROUTES`] and no page can name it.
pub const KEY_HAND_OVER: Route = route(Method::Post, "/v1/paperclip/key", Answer::Json);

/// Every Paperclip and agent messaging route a page may call, by its name.
pub(crate) const PAPERCLIP_ROUTES: &[(&str, Route)] = &[
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
    // Screenshot feedback (HAL-18969): the host sends it with the key it
    // holds and answers only the outcome, never Paperclip's words or a key.
    (
        "POST /v1/paperclip/feedback",
        route(Method::Post, "/v1/paperclip/feedback", Answer::Json),
    ),
    (
        "POST /v1/paperclip/sign-in/start",
        route(Method::Post, "/v1/paperclip/sign-in/start", Answer::Json),
    ),
    // The approved poll's key goes to the keychain in the shell, and the page
    // gets the answer without it (`paperclip_keep.rs`, HAL-20278).
    (
        "POST /v1/paperclip/sign-in/poll",
        route(Method::Post, "/v1/paperclip/sign-in/poll", Answer::Json),
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
    // Message reactions (HAL-19139): a chat's reactions, and the person's own
    // added or removed; never a message, so they wake no agent.
    (
        "POST /v1/messaging/reactions",
        route(Method::Post, "/v1/messaging/reactions", Answer::Json),
    ),
    (
        "POST /v1/messaging/react",
        route(Method::Post, "/v1/messaging/react", Answer::Json),
    ),
    // The server engine's pairing (HAL-18744): the host puts the device token
    // straight into the keychain, so no answer holds it.
    (
        "POST /v1/messaging/server-engine/state",
        route(
            Method::Post,
            "/v1/messaging/server-engine/state",
            Answer::Json,
        ),
    ),
    (
        "POST /v1/messaging/server-engine/pair",
        route(
            Method::Post,
            "/v1/messaging/server-engine/pair",
            Answer::Json,
        ),
    ),
    (
        "POST /v1/messaging/server-engine/access",
        route(
            Method::Post,
            "/v1/messaging/server-engine/access",
            Answer::Json,
        ),
    ),
    (
        "POST /v1/messaging/server-engine/pair-status",
        route(
            Method::Post,
            "/v1/messaging/server-engine/pair-status",
            Answer::Json,
        ),
    ),
    (
        "POST /v1/messaging/server-engine/pair-cancel",
        route(
            Method::Post,
            "/v1/messaging/server-engine/pair-cancel",
            Answer::Json,
        ),
    ),
    (
        "POST /v1/messaging/server-engine/use-this-computer",
        route(
            Method::Post,
            "/v1/messaging/server-engine/use-this-computer",
            Answer::Json,
        ),
    ),
    (
        "POST /v1/messaging/focus",
        route(Method::Post, "/v1/messaging/focus", Answer::Json),
    ),
    // Settings › Sync diagnostics (HAL-19337): counts and timings only, never
    // a title, a body, an ID or a query.
    (
        "GET /v1/sync/diagnostics",
        route(Method::Get, "/v1/sync/diagnostics", Answer::Json),
    ),
];
