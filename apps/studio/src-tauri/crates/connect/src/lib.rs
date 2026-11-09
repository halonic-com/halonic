//! Checks the address the Android app connects to and reads the computer's
//! hello answer (flow-install-update 5.3 and 5.4).
//!
//! The address check and the hello parsing arrive in the next pull request
//! of HAL-1140. This crate holds no Tauri types: the shell's `connect`
//! command is a thin wrapper around it.
