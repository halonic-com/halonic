//! Where a folder is, seen from the CLI's profile (HAL-15201), for the pick,
//! reopen and New workspace commands in `trust.rs`. The rule is
//! `profile.profile-outside-workspace`, decided by `halonic-profile` as the
//! CLI's `checkProfilePlace` decides it: a profile a variable moved into the
//! folder, or a folder inside the profile, is refused. The built-in profile
//! in a home folder workspace stays allowed; the file fence keeps it out of
//! reach there (HAL-7039).

use std::path::Path;

use halonic_profile::{
    ProfilePlaces, ProfileRefusal, built_in_profile_folder, profile_folder, profile_mover,
    profile_refusal,
};
use halonic_trust_grant::FolderPlace;
use halonic_workspace_files::real_path_as_far_as_it_exists;
use tauri::{AppHandle, Runtime};

use crate::profile::cli_environment;

/// Where the folder at `real`, a real path made or not, is from the
/// profile. Without a profile to compare with (no home folder, a relative
/// `HALONIC_HOME`) nothing is refused here: the commands that use the
/// profile refuse that themselves.
pub fn folder_place<R: Runtime>(app: &AppHandle<R>, real: &Path) -> FolderPlace {
    let Ok(environment) = cli_environment(app) else {
        return FolderPlace::Apart;
    };
    let (Ok(profile), Ok(built_in)) = (
        profile_folder(&environment),
        built_in_profile_folder(&environment),
    ) else {
        return FolderPlace::Apart;
    };
    let real_text = |path: &str| {
        real_path_as_far_as_it_exists(Path::new(path))
            .to_string_lossy()
            .into_owned()
    };
    let (profile, built_in) = (real_text(&profile.root), real_text(&built_in.root));
    let workspace = real.to_string_lossy();
    let refusal = profile_refusal(&ProfilePlaces {
        platform: environment.platform,
        workspace: &workspace,
        profile: &profile,
        built_in: &built_in,
        moved_by: profile_mover(&environment),
    });
    match refusal {
        None => FolderPlace::Apart,
        Some(ProfileRefusal::ProfileInWorkspace(mover)) => FolderPlace::HoldsProfile(mover.name()),
        Some(ProfileRefusal::WorkspaceInProfile) => FolderPlace::InProfile,
    }
}
