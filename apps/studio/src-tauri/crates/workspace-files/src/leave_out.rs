//! Folders a list leaves out when the page asks: the working folders agents
//! write in and `node_modules`, as `LeaveOut`, `checkLeaveOut` and
//! `isLeftOut` in `packages/core/ports/src/definition-store-left-out.ts`
//! have them (requirement `ports.definition-store-left-out`). It is about
//! scale, not privacy: a left-out file still reads, writes and removes.

use crate::error::FileError;
use crate::workspace_path::{check_workspace_path, segment_as_opened};

/// What a list leaves out: every file in or under one of `folders`, and
/// every file with a segment that is one of `names`. Segments are kept as
/// [`segment_as_opened`] gives them, so they compare as a file system that
/// folds case would open them. The default leaves out nothing.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct LeaveOut {
    folders: Vec<Vec<String>>,
    names: Vec<String>,
}

impl LeaveOut {
    /// The folders (paths from the workspace root) and names (one segment
    /// each) to leave out. Refuses an unsafe folder, a name with a `/`, and
    /// a segment that is empty once folded (`...`, ` `), as `checkLeaveOut`
    /// does, so `a/../b` can't leave out more than it says.
    pub fn new(folders: &[String], names: &[String]) -> Result<Self, FileError> {
        let mut leave_out = Self::default();
        for folder in folders {
            check_workspace_path(folder)?;
            leave_out.folders.push(folded_segments(folder)?);
        }
        for name in names {
            check_workspace_path(name)?;
            if name.contains('/') {
                return Err(FileError::UnsafePath {
                    path: name.clone(),
                    reason: "a folder name has no \"/\"",
                });
            }
            leave_out.names.extend(folded_segments(name)?);
        }
        Ok(leave_out)
    }

    /// Whether a safe workspace path is left out: it is one of the folders,
    /// or inside one, or one of its segments is one of the names. The walk
    /// asks it for a folder's own path, so it never steps into one.
    pub(crate) fn holds(&self, path: &str) -> bool {
        if path.is_empty() || (self.folders.is_empty() && self.names.is_empty()) {
            return false;
        }
        let segments: Vec<String> = path.split('/').map(segment_as_opened).collect();
        segments.iter().any(|segment| self.names.contains(segment))
            || self
                .folders
                .iter()
                .any(|folder| segments.starts_with(folder))
    }
}

/// The path's segments as [`segment_as_opened`] gives them, refusing one
/// that folds to nothing: it would match whatever else folds to nothing,
/// not one real folder.
fn folded_segments(path: &str) -> Result<Vec<String>, FileError> {
    let segments: Vec<String> = path.split('/').map(segment_as_opened).collect();
    if segments.iter().any(String::is_empty) {
        return Err(FileError::UnsafePath {
            path: path.to_owned(),
            reason: "a segment is empty once its case and trailing dots are folded",
        });
    }
    Ok(segments)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn strings(values: &[&str]) -> Vec<String> {
        values.iter().map(|&value| value.to_owned()).collect()
    }

    #[test]
    fn leaves_out_a_folder_and_what_is_under_it_but_not_a_longer_name() {
        let leave_out = LeaveOut::new(&strings(&["repo"]), &[]).expect("a safe folder");
        assert!(leave_out.holds("repo"));
        assert!(leave_out.holds("repo/src/a.ts"));
        assert!(leave_out.holds("REPO/a.ts"));
        assert!(!leave_out.holds("repository.md"));
        assert!(!leave_out.holds("hubs/repo/a.ts"));
        assert!(!leave_out.holds(""));
    }

    #[test]
    fn leaves_out_a_name_at_any_depth_in_any_case() {
        let leave_out = LeaveOut::new(&[], &strings(&["node_modules"])).expect("a safe name");
        assert!(leave_out.holds("node_modules/x.js"));
        assert!(leave_out.holds("tools/Node_Modules/x/index.js"));
        assert!(!leave_out.holds("node_modules.md"));
    }

    #[test]
    fn leaves_out_nothing_by_default() {
        assert!(!LeaveOut::default().holds("node_modules/x.js"));
    }

    #[test]
    fn refuses_what_could_leave_out_more_than_it_says() {
        for (folders, names) in [
            (strings(&["a/../b"]), vec![]),
            (strings(&["/repo"]), vec![]),
            (strings(&["..."]), vec![]),
            (vec![], strings(&["a/b"])),
            (vec![], strings(&[" "])),
        ] {
            let refused = LeaveOut::new(&folders, &names).map_err(|error| error.kind());
            assert_eq!(refused, Err("unsafe_path"), "{folders:?} {names:?}");
        }
    }
}
