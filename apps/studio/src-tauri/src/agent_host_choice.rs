//! Which host the shell starts (HAL-7373): the local one, or the one in
//! Halonic's WSL distro. The sandbox choice decides, as the page's
//! `SandboxChoiceService` does, so the two never disagree about where an
//! agent runs.

use std::path::Path;

use halonic_host_settings::read_sandbox_backend;
use halonic_profile::{Platform, ProfileFolder, join_path};

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

/// The backend the person's saved choice names, `None` when none is saved.
///
/// # Errors
///
/// Naming the file, when it can't be read or isn't exactly a valid choice.
/// That never counts as "no choice".
pub fn saved_backend(profile: &ProfileFolder) -> Result<Option<&'static str>, String> {
    let folder = join_path(profile.platform, &profile.root, &[SANDBOX_FOLDER_NAME]);
    read_sandbox_backend(Path::new(&folder)).map_err(|error| error.to_string())
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
