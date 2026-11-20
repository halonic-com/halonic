//! Which host the shell starts (HAL-7373): the local one, or the one in
//! Halonic's WSL distro. The sandbox choice decides, as the page's
//! `SandboxChoiceService` does, so the two never disagree about where an
//! agent runs.

use std::path::Path;

use halonic_host_settings::{SandboxSetting, read_sandbox_setting};
use halonic_profile::{Platform, ProfileFolder, join_path};
use tauri::{AppHandle, Runtime};

/// The folder of the choice in the profile, `sandbox`, where
/// `FileSandboxSettingStore` in `packages/adapters/fs-node` keeps
/// `sandbox-setting.json`.
const SANDBOX_FOLDER_NAME: &str = "sandbox";

/// Where a host runs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HostKind {
    /// A process next to the shell.
    Local,
    /// In Halonic's WSL distro, behind a relay on loopback.
    Distro,
}

/// The host for a saved backend (`None` when nothing is saved). `srt-wsl`
/// runs in the distro, and so does Windows without a saved choice, because
/// `defaultBackendOrder("win32")` is `srt-wsl` alone. Every other backend
/// uses the local host.
pub fn host_for(backend: Option<&str>, platform: Platform) -> HostKind {
    match (backend, platform) {
        (Some("srt-wsl"), _) | (None, Platform::Windows) => HostKind::Distro,
        _ => HostKind::Local,
    }
}

/// Whether the host the shell starts runs beside it, which is where the
/// removal of Halonic's WSL setup is served (the host in the distro can't
/// unregister the distro it runs in). A choice that can't be read says no.
pub fn host_runs_beside_shell<R: Runtime>(app: &AppHandle<R>) -> bool {
    let Ok(profile) = crate::profile::cli_profile(app) else {
        return false;
    };
    matches!(
        saved_backend(&profile).map(|backend| host_for(backend, profile.platform)),
        Ok(HostKind::Local)
    )
}

/// The backend the person's saved choice names, `None` when none is saved.
///
/// # Errors
///
/// Naming the file, when it can't be read or isn't exactly a valid choice.
/// That never counts as "no choice".
pub fn saved_backend(profile: &ProfileFolder) -> Result<Option<&'static str>, String> {
    Ok(saved_setting(profile)?.map(|setting| setting.backend()))
}

/// The person's saved choice, `None` when none is saved.
///
/// # Errors
///
/// As [`saved_backend`].
pub fn saved_setting(profile: &ProfileFolder) -> Result<Option<SandboxSetting>, String> {
    read_sandbox_setting(Path::new(&sandbox_folder(profile))).map_err(|error| error.to_string())
}

/// The folder in the profile that holds the choice.
pub fn sandbox_folder(profile: &ProfileFolder) -> String {
    join_path(profile.platform, &profile.root, &[SANDBOX_FOLDER_NAME])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_saved_wsl_choice_uses_the_distro_on_every_platform() {
        for platform in [Platform::Windows, Platform::Macos, Platform::Linux] {
            assert_eq!(host_for(Some("srt-wsl"), platform), HostKind::Distro);
        }
    }

    #[test]
    fn no_saved_choice_follows_the_platform_default() {
        assert_eq!(host_for(None, Platform::Windows), HostKind::Distro);
        assert_eq!(host_for(None, Platform::Macos), HostKind::Local);
        assert_eq!(host_for(None, Platform::Linux), HostKind::Local);
    }

    #[test]
    fn any_other_saved_choice_uses_the_local_host_even_on_windows() {
        for backend in ["srt", "mxc", "none", "docker-sbx", "cloud"] {
            assert_eq!(host_for(Some(backend), Platform::Windows), HostKind::Local);
        }
    }
}
