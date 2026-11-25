//! Whether this Halonic runs from where it was installed (security review on
//! HAL-14212, D9): a copy run from a download or an update's temporary
//! folder may not add itself to the login items. Each system's rule is a
//! plain function of paths, so the tests check all three anywhere.

use std::path::Path;

/// Windows: the executable sits directly in the folder the installer wrote
/// as `InstallLocation` in Halonic's uninstall entry (the installer stores
/// it in double quotes). Windows paths ignore case.
pub fn in_install_location(executable: &Path, install_location: &str) -> bool {
    let folder = install_location.trim().trim_matches('"');
    let Some(parent) = executable.parent().and_then(Path::to_str) else {
        return false;
    };
    let parent = parent.trim_end_matches(['\\', '/']);
    let folder = folder.trim_end_matches(['\\', '/']);
    !folder.is_empty() && parent.eq_ignore_ascii_case(folder)
}

/// macOS: the executable is `Contents/MacOS/<name>` of an app bundle directly
/// in `/Applications` or in the user's own `~/Applications`.
pub fn in_applications(executable: &Path, home: Option<&Path>) -> bool {
    let bundle = executable
        .parent()
        .filter(|folder| folder.ends_with("Contents/MacOS"))
        .and_then(Path::parent)
        .and_then(Path::parent);
    let Some(bundle) = bundle else {
        return false;
    };
    let named_app = bundle
        .extension()
        .is_some_and(|extension| extension == "app");
    let Some(folder) = bundle.parent() else {
        return false;
    };
    let user_applications = home.map(|home| home.join("Applications"));
    named_app
        && (folder == Path::new("/Applications") || Some(folder) == user_applications.as_deref())
}

/// Linux: the executable is under `/usr` or `/opt`, where a package puts it.
/// No Linux package is built yet (B1 ships for Windows first), so this keeps
/// a copy run from a home or temporary folder out.
pub fn in_system_folder(executable: &Path) -> bool {
    executable.starts_with("/usr/") || executable.starts_with("/opt/")
}

#[cfg(test)]
#[path = "installed_tests.rs"]
mod tests;
