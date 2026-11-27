//! The Studio shell's side of user-only action steppers (HAL-17525;
//! architecture note on HAL-17491, 2.4 and 3; ADR 2026-11-24, action
//! sender). Plain Rust with no Tauri types: the shell's `action_*` commands
//! wrap it and give it the keychain, the network and the native dialogs.
//!
//! - [`RouteList`]: every step the shell may send or open, generated from
//!   the catalog and compiled in.
//! - [`Sender::send`]: one call step, only from the list, to the service's
//!   fixed origin with the user's token, following no redirect, handing back
//!   only kept fields. An `irreversible` step's target name and any
//!   `secret-input` value are typed into the shell's dialog ([`ask_page`]).
//! - [`open_guided`] and [`open_page`]: a guided step's page, and a
//!   `browser` block's address checked against the web origins.
//! - [`account`]: where the token and the signed-in account are kept.
//! - [`DeviceFlow::sign_in`]: GitHub's device-flow sign-in, which runs
//!   only while its stepper is open and stores the token with [`account`].
//! - [`RecordFiles`]: each request's record, one user-only file per
//!   request, holding only events [`check_record_event`] takes.

pub mod account;
mod answer;
mod ask;
pub mod ask_page;
mod call;
mod device_flow;
mod kinds;
mod opens;
mod pattern;
mod private_file;
mod record_check;
mod record_files;
mod routes;
mod send;
mod services;
mod sign_in;
mod target;
mod template;
mod web;
mod wipe;

pub use answer::{MAX_ERROR_CHARS, MORE_THAN_ONE, error_text};
pub use ask::{AskSheet, Typed, TypedText};
pub use call::{MAX_LIST_ITEMS, Refusal, SendRequest, StepRef};
pub use device_flow::{DEVICE_PAGE, DeviceFlow, NEVER_EXPIRES, is_client_id};
pub use opens::{ANY_PAGE_GAP_MS, OpenLimiter, SAME_PAGE_GAP_MS, open_guided, open_page};
pub use pattern::{MAX_VALUE_CHARS, Pattern};
pub use record_check::{
    MAX_ID_CHARS, MAX_KEPT_FIELDS, MAX_KEPT_VALUE_CHARS, check_record_event, check_request_id,
    seconds_of,
};
pub use record_files::{KEEP_FINISHED_SECONDS, MAX_RECORD_BYTES, Record, RecordError, RecordFiles};
pub use routes::{FORMAT, Risk, RouteList};
pub use send::{Answer, ConfirmSheet, Dialogs, Outgoing, SendResult, Sender, Tokens, Transport};
pub use services::{AnswerShape, CLOUDFLARE, GITHUB, SERVICES, Service, service};
pub use sign_in::{Clock, CodeScreen, Keychain, SignInCancel, SignInResult, UserCode};
