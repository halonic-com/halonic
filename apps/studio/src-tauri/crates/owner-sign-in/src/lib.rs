//! Signs the desktop shell in to an owner's own server (`mode: owner`) with
//! the server's password, and out again (HAL-18944, the decision recorded on
//! HAL-13265).
//!
//! This crate holds no Tauri types and makes no calls itself: the shell's
//! `owner_login`, `owner_logout` and `owner_status` commands check the origin
//! with [`owner_address`], give [`sign_in`] and [`sign_out`] an
//! [`OwnerServer`] that calls the checked addresses only, and hand the page
//! the [`OwnerAnswer`]. The page never sees the session, and the password is
//! never stored or logged.

mod answer;
mod flow;
mod hello;
mod stored;

pub use answer::{OwnerAnswer, OwnerError};
pub use flow::{
    Call, HelloAnswer, LoginAnswer, OwnerServer, owner_address, owner_origin, sign_in, sign_out,
    signed_in,
};
pub use hello::{StudioVersions, check_owner_hello};
pub use stored::{SESSION_COOKIE, session_from_set_cookie};
