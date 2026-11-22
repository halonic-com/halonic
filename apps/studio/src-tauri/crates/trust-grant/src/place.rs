//! Where a folder is, seen from the profile (HAL-15201). The shell works it
//! out from the real paths as `halonic-profile` decides it; this crate only
//! turns the answer into a refusal, so the kinds are tested without a
//! profile.

use std::path::Path;

use crate::refusal::TrustRefusal;

/// Where a folder is, seen from this computer's profile folder.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FolderPlace {
    /// The two are apart, or the profile in the folder is the built-in one.
    Apart,
    /// A variable put the profile in the folder: `HALONIC_HOME`,
    /// `XDG_DATA_HOME` or `LOCALAPPDATA`, which the refusal gives as its
    /// `reason`, so the page can name it in the fix.
    HoldsProfile(&'static str),
    /// The folder is the profile or inside it.
    InProfile,
}

impl FolderPlace {
    /// Refuses a folder that would be opened as a workspace:
    /// `profile_inside`, naming the variable, when it holds a moved profile,
    /// `workspace_inside_profile` when it is inside the profile.
    pub(crate) fn check_open(self, folder: &Path) -> Result<(), TrustRefusal> {
        match self {
            FolderPlace::Apart => Ok(()),
            FolderPlace::HoldsProfile(moved_by) => Err(holds_profile(folder, moved_by)),
            FolderPlace::InProfile => Err(TrustRefusal::new(
                "workspace_inside_profile",
                format!("{:?} is inside the profile folder", folder.display()),
            )),
        }
    }

    /// Refuses a folder New workspace would make or open: `profile_inside`
    /// as for opening, and `parent_private` when it is inside the profile,
    /// the shell's own folder.
    pub(crate) fn check_new(self, folder: &Path) -> Result<(), TrustRefusal> {
        match self {
            FolderPlace::Apart => Ok(()),
            FolderPlace::HoldsProfile(moved_by) => Err(holds_profile(folder, moved_by)),
            FolderPlace::InProfile => Err(TrustRefusal::new(
                "parent_private",
                format!(
                    "{:?} is the shell's own folder or inside it",
                    folder.display()
                ),
            )),
        }
    }
}

fn holds_profile(folder: &Path, moved_by: &'static str) -> TrustRefusal {
    TrustRefusal::because(
        "profile_inside",
        moved_by,
        format!(
            "{:?} holds the profile folder {moved_by} put there",
            folder.display()
        ),
    )
}
