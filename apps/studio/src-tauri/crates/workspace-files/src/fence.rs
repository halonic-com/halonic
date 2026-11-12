//! A folder the file calls never reach, even when an opened folder holds it:
//! the profile (HAL-7039). With the home folder opened, the page could
//! otherwise write the shell's own files there, such as the list of picked
//! folders that open after a restart without a dialog.

use std::ffi::OsString;
use std::path::{Component, Path};

use crate::error::FileError;
use crate::workspace_path::segment_as_opened;

/// Where the fenced folder is, seen from a workspace's root.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub enum Fence {
    /// The fenced folder isn't under the root: every path may be used.
    #[default]
    Outside,
    /// The root is the fenced folder or inside it: no path may be used.
    Whole,
    /// The fenced folder is at these segments under the root, each as
    /// [`segment_as_opened`] gives it.
    At(Vec<String>),
}

impl Fence {
    /// Where `fenced` is under `root`, the real path of a workspace. The
    /// fenced folder's real path is worked out as far as it exists, so a
    /// profile not made yet is fenced too, and a link to it doesn't get
    /// around the fence. Names are compared as a file system that folds
    /// case might open them, so a folder that only differs in case is
    /// fenced too.
    pub fn around(root: &Path, fenced: &Path) -> Self {
        let root = opened_components(root);
        let fenced = opened_components(&real_path_as_far_as_it_exists(fenced));
        if root.starts_with(&fenced) {
            return Self::Whole;
        }
        match fenced.strip_prefix(root.as_slice()) {
            Some(below) => Self::At(below.to_vec()),
            None => Self::Outside,
        }
    }

    /// Refuses a safe workspace path that is the fenced folder or inside
    /// it, as a private path is refused.
    pub(crate) fn check(&self, path: &str) -> Result<(), FileError> {
        if self.holds(path) {
            return Err(FileError::PrivatePath {
                path: path.to_owned(),
            });
        }
        Ok(())
    }

    /// Whether a safe workspace path (`""` for the root) is the fenced
    /// folder or inside it.
    pub(crate) fn holds(&self, path: &str) -> bool {
        match self {
            Self::Outside => false,
            Self::Whole => true,
            Self::At(fenced) => {
                let segments: Vec<String> = path.split('/').map(segment_as_opened).collect();
                !path.is_empty() && segments.starts_with(fenced)
            }
        }
    }
}

/// The path's parts as compared: names as [`segment_as_opened`] gives
/// them, and the rest (a drive or the root) as written.
fn opened_components(path: &Path) -> Vec<String> {
    path.components()
        .map(|component| match component {
            Component::Normal(name) => segment_as_opened(&name.to_string_lossy()),
            other => other.as_os_str().to_string_lossy().into_owned(),
        })
        .collect()
}

/// The real path of the longest part of `path` that exists, followed by the
/// rest as written.
fn real_path_as_far_as_it_exists(path: &Path) -> std::path::PathBuf {
    let mut rest: Vec<OsString> = Vec::new();
    let mut existing = path;
    loop {
        if let Ok(mut real) = std::fs::canonicalize(existing) {
            real.extend(rest.iter().rev());
            return real;
        }
        match (existing.parent(), existing.file_name()) {
            (Some(parent), Some(name)) => {
                rest.push(name.to_owned());
                existing = parent;
            }
            _ => return path.to_path_buf(),
        }
    }
}
