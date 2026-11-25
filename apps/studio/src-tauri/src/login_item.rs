//! The `login_item_get` and `login_item_set` commands (B1 step 6,
//! HAL-14221; D9 of the HAL-14206 design note): Settings › Startup's
//! "Start Halonic when I log in" switch reads and sets Halonic's login item
//! through them, and nothing else does. The security review (HAL-14212)
//! asked for exactly this: no window gets an autostart plugin's own
//! commands, `login_item_set` takes only on or off, and the entry's
//! argument is fixed in `halonic-login-item` (exactly `--background`).
//! Only the app's own main window is granted them
//! (capabilities/desktop-login-item.json), never a focused app's window or
//! the Studio the computer serves.

use halonic_login_item::{LoginItem, LoginItemError};
use serde::Serialize;

/// Why the switch couldn't change, in words the page maps to its own text.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LoginItemRefusal {
    /// This Halonic doesn't run from where it was installed.
    NotInstalled,
    /// The system refused or the path can't be written; the shell's log
    /// says which, without the path.
    Failed,
}

/// Whether Halonic's login item is on.
#[tauri::command]
pub async fn login_item_get() -> Result<bool, LoginItemRefusal> {
    let item = LoginItem::for_this_halonic().map_err(refused)?;
    item.is_on().map_err(refused)
}

/// Turns Halonic's login item on or off, and answers whether it is on now.
#[tauri::command]
pub async fn login_item_set(on: bool) -> Result<bool, LoginItemRefusal> {
    let item = LoginItem::for_this_halonic().map_err(refused)?;
    let installed = on && item.is_installed();
    set(&item, on, installed)
}

/// Turning on writes the entry again, so it always names this executable;
/// turning off never asks where Halonic runs from.
fn set(item: &LoginItem, on: bool, installed: bool) -> Result<bool, LoginItemRefusal> {
    let changed = if on {
        item.turn_on(installed)
    } else {
        item.turn_off()
    };
    changed.map_err(refused)?;
    item.is_on().map_err(refused)
}

fn refused(error: LoginItemError) -> LoginItemRefusal {
    halonic_shell_log::record("login-item", &error);
    match error {
        LoginItemError::NotInstalled => LoginItemRefusal::NotInstalled,
        LoginItemError::UnsafePath | LoginItemError::Failed(_) => LoginItemRefusal::Failed,
    }
}

#[cfg(test)]
#[path = "login_item_tests.rs"]
mod tests;
