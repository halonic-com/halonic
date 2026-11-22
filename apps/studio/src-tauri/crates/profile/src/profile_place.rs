//! Where the profile folder may be, seen from a workspace (HAL-15201), as
//! `profile-placement.ts` in `@halonicjs/profile` decides it. A profile a
//! variable moved into a workspace is refused: git could carry trust records
//! and the yes to run without the sandbox into it. So is a workspace inside
//! the profile. The built-in default stays allowed in a home folder
//! workspace, where the file fence keeps it out of reach (HAL-7039).

use halonic_workspace_files::segment_as_opened;

use crate::{Platform, ProfileEnvironment, ProfileError, ProfileFolder, is_absolute_path};

/// The variable that put the profile where it is, when it isn't the
/// built-in default.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProfileMover {
    HalonicHome,
    XdgDataHome,
    LocalAppData,
}

impl ProfileMover {
    /// The variable's name, as the person sets it.
    pub fn name(self) -> &'static str {
        match self {
            ProfileMover::HalonicHome => "HALONIC_HOME",
            ProfileMover::XdgDataHome => "XDG_DATA_HOME",
            ProfileMover::LocalAppData => "LOCALAPPDATA",
        }
    }
}

/// Why a workspace can't be opened with this profile.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProfileRefusal {
    /// The profile is the workspace or inside it, and a variable put it there.
    ProfileInWorkspace(ProfileMover),
    /// The workspace is the profile or inside it, wherever the profile is.
    WorkspaceInProfile,
}

/// The real paths [`profile_refusal`] compares, worked out by the caller.
#[derive(Debug, Clone, Copy)]
pub struct ProfilePlaces<'a> {
    pub platform: Platform,
    /// The workspace's root.
    pub workspace: &'a str,
    /// The profile folder, as far as it exists.
    pub profile: &'a str,
    /// The built-in profile folder, from [`built_in_profile_folder`], as far
    /// as it exists.
    pub built_in: &'a str,
    /// What put the profile where it is, from [`profile_mover`].
    pub moved_by: Option<ProfileMover>,
}

/// The profile folder as it would be with no variables set: the home folder
/// and the platform's own data folder.
pub fn built_in_profile_folder(
    environment: &ProfileEnvironment,
) -> Result<ProfileFolder, ProfileError> {
    crate::profile_folder(&ProfileEnvironment {
        halonic_home: None,
        local_app_data: None,
        xdg_data_home: None,
        ..environment.clone()
    })
}

/// The variable [`crate::profile_folder`] took the profile's place from:
/// `HALONIC_HOME` when it is set, else `LOCALAPPDATA` on Windows or
/// `XDG_DATA_HOME` on Linux when it is set and absolute; `None` when the
/// profile is in its built-in place.
pub fn profile_mover(environment: &ProfileEnvironment) -> Option<ProfileMover> {
    let platform = environment.platform;
    let absolute = |value: &Option<String>| {
        value
            .as_deref()
            .is_some_and(|value| !value.is_empty() && is_absolute_path(platform, value))
    };
    if environment
        .halonic_home
        .as_deref()
        .is_some_and(|value| !value.is_empty())
    {
        return Some(ProfileMover::HalonicHome);
    }
    match platform {
        Platform::Windows if absolute(&environment.local_app_data) => {
            Some(ProfileMover::LocalAppData)
        }
        Platform::Linux if absolute(&environment.xdg_data_home) => Some(ProfileMover::XdgDataHome),
        _ => None,
    }
}

/// Whether a workspace may be opened with this profile: a workspace inside
/// the profile never; a profile inside the workspace only when it is the
/// built-in default. Names are compared as a file system that folds case
/// might open them, as the file fence compares them.
pub fn profile_refusal(places: &ProfilePlaces<'_>) -> Option<ProfileRefusal> {
    let workspace = parts_of(places.platform, places.workspace);
    let profile = parts_of(places.platform, places.profile);
    let built_in = parts_of(places.platform, places.built_in);
    if let Some(mover) = places.moved_by
        && profile != built_in
        && profile.starts_with(&workspace)
    {
        return Some(ProfileRefusal::ProfileInWorkspace(mover));
    }
    if workspace.starts_with(&profile) {
        return Some(ProfileRefusal::WorkspaceInProfile);
    }
    None
}

/// A path's names, without the separators, as `segment_as_opened` gives them.
fn parts_of(platform: Platform, path: &str) -> Vec<String> {
    let separator =
        |character: char| character == '/' || (platform == Platform::Windows && character == '\\');
    path.split(separator)
        .filter(|name| !name.is_empty())
        .map(segment_as_opened)
        .collect()
}
