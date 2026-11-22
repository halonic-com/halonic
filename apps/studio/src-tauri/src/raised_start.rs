//! Studio doesn't start with administrator rights (HAL-16541). Studio
//! installs per user, so the agent host it starts is in a folder the user's
//! programs without those rights can write. Opened with "Run as
//! administrator", Studio would start whatever such a program put there,
//! raised. So before anything starts, the shell reads its token's elevation
//! type by the installer's rule (`halonic_elevate_start::raised`) and, when
//! it is raised, shows one native message and quits.
//!
//! It refuses rather than restarting itself without those rights: a restart
//! needs another process's token, such as Explorer's, which may not run, or
//! may itself run raised when UAC is off. A message the person acts on has
//! no such case.

/// The message's title.
const TITLE: &str = "Open Halonic without administrator rights";

/// The message's text: what happened, and what to do.
const MESSAGE: &str = "Halonic was opened with administrator rights (for example with \"Run as administrator\"), so it didn't start. \
With those rights, its agents could change anything on this computer.\n\n\
Open Halonic again the usual way, from the Start menu or its shortcut. \
If this keeps happening, check that the shortcut isn't set to \"Run as administrator\".";

/// `true` when Studio was started raised: the message has then been shown,
/// and the shell must quit without starting anything.
pub fn refused() -> bool {
    if !halonic_elevate_start::raised_start() {
        return false;
    }
    let _ = rfd::MessageDialog::new()
        .set_level(rfd::MessageLevel::Error)
        .set_title(TITLE)
        .set_description(MESSAGE)
        .set_buttons(rfd::MessageButtons::Ok)
        .show();
    true
}
