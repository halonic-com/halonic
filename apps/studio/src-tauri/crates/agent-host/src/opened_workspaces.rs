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
//! The host checks the folder itself, says on its standard error why it
//! refused one, and then answers, on id 0 too:
//!
//! ```text
//! {"op":"noticed","folder":"…"}
//! ```
//!
//! The shell waits for that answer before its next call to the host, so the
//! call finds the folder. Only the shell writes on id 0, so a page can't
//! name a folder of its choosing.
//!
//! Only a host beside the shell is told, and only when the shell answers
//! for its secrets, which gives it the channel. A host in Halonic's WSL
//! distro sees other paths than the shell's, so it isn't told.

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use serde::Deserialize;
use serde_json::json;

use crate::AgentHost;
use crate::relay::FRAME_LIMIT;

/// How long the shell waits for the host to answer the notices of one call.
/// The host checks a folder in well under a second; this only keeps a hung
/// host from holding the shell's call.
const NOTICED_WAIT: Duration = Duration::from_secs(5);

impl AgentHost {
    /// Names each of `folders` the host hasn't been told yet, and waits up to
    /// [`NOTICED_WAIT`] in all for the host to answer that it handled each.
    /// A folder whose path isn't UTF-8, or whose notice wouldn't fit in one
    /// frame, isn't named: the host couldn't take it as a workspace either.
    /// Stops at a channel that has stopped; the shell starts a new host then,
    /// which learns the open folders at start. A host that doesn't answer in
    /// time isn't asked again: the call goes on, and at worst it is refused
    /// as `unknown_workspace` once.
    pub fn name_workspaces(&mut self, folders: &[PathBuf]) {
        let Some(secrets) = self.secrets.as_ref() else {
            return;
        };
        let mut sent = Vec::new();
        for folder in folders {
            if self.named.contains(folder) {
                continue;
            }
            let Some((notice, name)) = open_workspace_notice(folder) else {
                continue;
            };
            if !secrets.notify(notice) {
                break;
            }
            self.named.push(folder.clone());
            sent.push(name);
        }
        let deadline = Instant::now() + NOTICED_WAIT;
        for name in sent {
            if !secrets.wait_noticed(&name, deadline) {
                return;
            }
        }
    }
}

/// The notice that names `folder`, as sent, and the folder as the host's
/// answer names it; `None` when it can't be sent.
pub(crate) fn open_workspace_notice(folder: &Path) -> Option<(Vec<u8>, String)> {
    let folder = folder.to_str()?;
    let notice = json!({ "op": "open_workspace", "folder": folder }).to_string();
    (notice.len() <= FRAME_LIMIT).then(|| (notice.into_bytes(), folder.to_owned()))
}

#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "lowercase", deny_unknown_fields)]
enum FromHost {
    Noticed { folder: String },
}

/// The folder a `{"op":"noticed","folder":…}` answer from the host names;
/// `None` for anything else, such as a secret request, which never has that
/// `op`.
pub(crate) fn noticed_folder(bytes: &[u8]) -> Option<String> {
    let FromHost::Noticed { folder } = serde_json::from_slice(bytes).ok()?;
    Some(folder)
}

#[cfg(test)]
mod tests;
