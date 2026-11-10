//! Which folder a trust grant may open, and what the shell asks the person
//! first (HAL-2612, plan approved on HAL-2652; requirement `trust-grants`).
//! The shell's `pick_folder` and `trust_*` commands only wire these rules to
//! Tauri, the profile and the native dialogs, so the rules are tested here
//! without a window. This crate holds no Tauri types.
//!
//! A folder joins the opened folders, the one list git and the file
//! commands share, only from a choice the person makes in the shell: a
//! folder they picked in the folder dialog, a folder inside one, or a folder
//! they said yes to when the shell asked. The page never names a folder
//! that is then opened without them.

mod grants;
mod question;
mod refusal;

pub use grants::TrustState;
pub use question::{CANCEL_BUTTON, QUESTION_TITLE, TRUST_BUTTON, question_text, shown_path};
pub use refusal::TrustRefusal;
