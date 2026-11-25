//! Naming the folders the person opens to the host after it started
//! (requirement `opened-workspaces`). At start the host learns the folders
//! open then (`--sweep-root`); one opened later is unknown to it, and every
//! workspace route refuses it. So the shell sends the host, on its own
//! connection id 0, one notice per folder:
//!
//! ```text
//! {"op":"open_workspace","folder":"…"}
//! ```
//!
//! The host answers nothing; it checks the folder itself, and says on its
//! standard error why it refused one. Only the shell writes on id 0, so a
//! page can't name a folder of its choosing.
//!
//! Only a host beside the shell is told, and only when the shell answers
//! for its secrets, which gives it the channel. A host in Halonic's WSL
//! distro sees other paths than the shell's, so it isn't told.

use std::path::{Path, PathBuf};

use serde_json::json;

use crate::AgentHost;
use crate::relay::FRAME_LIMIT;

impl AgentHost {
    /// Names each of `folders` the host hasn't been told yet. A folder whose
    /// path isn't UTF-8, or whose notice wouldn't fit in one frame, isn't
    /// named: the host couldn't take it as a workspace either. Stops at a
    /// channel that has stopped; the shell starts a new host then, which
    /// learns the open folders at start.
    pub fn name_workspaces(&mut self, folders: &[PathBuf]) {
        let Some(secrets) = self.secrets.as_ref() else {
            return;
        };
        for folder in folders {
            if self.named.contains(folder) {
                continue;
            }
            let Some(notice) = open_workspace_notice(folder) else {
                continue;
            };
            if !secrets.notify(notice) {
                return;
            }
            self.named.push(folder.clone());
        }
    }
}

/// The notice that names `folder`, as sent; `None` when it can't be sent.
pub(crate) fn open_workspace_notice(folder: &Path) -> Option<Vec<u8>> {
    let folder = folder.to_str()?;
    let notice = json!({ "op": "open_workspace", "folder": folder }).to_string();
    (notice.len() <= FRAME_LIMIT).then(|| notice.into_bytes())
}

#[cfg(test)]
mod tests;
