//! The folders one workspace has in the profile, exactly as
//! `workspaceFolders` in `@halonicjs/profile` names them (HAL-2701), so the
//! Studio shell and the CLI read and write the same runs. Each workspace
//! gets one folder, `workspaces/<key>`, named from a hash of its real path.

use std::fmt;

use icu_normalizer::ComposingNormalizerBorrowed;
use sha2::{Digest, Sha256};

use crate::{Platform, ProfileFolder, is_absolute_path, join_path, without_trailing_separators};

/// The folder in the profile that holds one folder per workspace.
const WORKSPACES_FOLDER_NAME: &str = "workspaces";

/// How many hex characters of the SHA-256 name a workspace's folder: 128
/// bits, so two workspaces never share a folder, while the path stays short
/// enough for Windows.
const KEY_LENGTH: usize = 32;

/// The longest deployment id `deployments.yaml` allows, which keeps the runs
/// folder's path under Windows' 260-character limit.
const DEPLOYMENT_ID_MAX_LENGTH: usize = 64;

/// Names Windows keeps for devices; a folder can't have them. `com` and
/// `lpt` count only with one digit after them.
const WINDOWS_DEVICE_NAMES: [&str; 4] = ["con", "prn", "aux", "nul"];
const WINDOWS_NUMBERED_DEVICE_NAMES: [&str; 2] = ["com", "lpt"];

/// The verbatim prefix Rust's `canonicalize` puts before a Windows path.
const VERBATIM_PREFIX: &str = r"\\?\";
/// The verbatim prefix before a network share, `\\?\UNC\server\share`.
const VERBATIM_SHARE_PREFIX: &str = r"\\?\UNC\";

/// The folders one workspace has in the profile. Nothing is created.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceFolders {
    platform: Platform,
    /// The workspace's own folder in the profile.
    pub folder: String,
}

/// Why a workspace's folders can't be named.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WorkspaceError {
    /// The workspace path isn't absolute.
    WorkspaceNotAbsolute { value: String },
    /// The id isn't one `deployments.yaml` accepts.
    NotADeploymentId { value: String },
}

impl fmt::Display for WorkspaceError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            WorkspaceError::WorkspaceNotAbsolute { value } => {
                write!(
                    formatter,
                    "the workspace path must be absolute, not {value:?}"
                )
            }
            WorkspaceError::NotADeploymentId { value } => write!(
                formatter,
                "not a deployment id: {value:?}; use 1 to 64 lowercase letters, digits, '-' or '_', \
                 starting with a letter or digit, and not a name Windows keeps for a device"
            ),
        }
    }
}

impl std::error::Error for WorkspaceError {}

impl ProfileFolder {
    /// The folders a workspace has in the profile, as `workspaceFolders`
    /// names them.
    ///
    /// Pass the workspace's real path, as `canonicalize` gives it. Before
    /// hashing, the path is put in one spelling: trailing separators are
    /// dropped everywhere; on Windows `/` becomes `\`, the verbatim prefix
    /// is dropped and case is ignored; on macOS case and Unicode form (NFC)
    /// are ignored. The steps run in the same order as in TypeScript, so
    /// both give the same key.
    pub fn workspace_folders(
        &self,
        workspace_real_path: &str,
    ) -> Result<WorkspaceFolders, WorkspaceError> {
        if !is_absolute_path(self.platform, workspace_real_path) {
            return Err(WorkspaceError::WorkspaceNotAbsolute {
                value: workspace_real_path.to_owned(),
            });
        }
        let key = workspace_key(self.platform, workspace_real_path);
        let folder = join_path(self.platform, &self.root, &[WORKSPACES_FOLDER_NAME, &key]);
        Ok(WorkspaceFolders {
            platform: self.platform,
            folder,
        })
    }
}

impl WorkspaceFolders {
    /// The folder for the workspace's runs: `runs`, or
    /// `deployments/<id>/runs` for one deployment's runs.
    pub fn runs_folder(&self, deployment_id: Option<&str>) -> Result<String, WorkspaceError> {
        let Some(deployment_id) = deployment_id else {
            return Ok(join_path(self.platform, &self.folder, &["runs"]));
        };
        if !is_deployment_id(deployment_id) {
            return Err(WorkspaceError::NotADeploymentId {
                value: deployment_id.to_owned(),
            });
        }
        Ok(join_path(
            self.platform,
            &self.folder,
            &["deployments", deployment_id, "runs"],
        ))
    }

    /// The folder for the blobs the workspace's runs refer to, as
    /// `blobsFolder` names it.
    pub fn blobs_folder(&self) -> String {
        join_path(self.platform, &self.folder, &["blobs"])
    }

    /// The folder for the workspace's records, agent notes and collections,
    /// as `recordsFolder` names it.
    pub fn records_folder(&self) -> String {
        join_path(self.platform, &self.folder, &["records"])
    }
}

/// The first 32 hex characters of the SHA-256 of the path's one spelling.
fn workspace_key(platform: Platform, real_path: &str) -> String {
    let hash = Sha256::digest(keyed_path(platform, real_path).as_bytes());
    let hex: String = hash.iter().map(|byte| format!("{byte:02x}")).collect();
    hex[..KEY_LENGTH].to_owned()
}

/// The workspace path in the one spelling that is hashed. The CLI gets its
/// real path from Node and the shell from `canonicalize`, which spell one
/// Windows folder differently.
fn keyed_path(platform: Platform, real_path: &str) -> String {
    match platform {
        Platform::Windows => {
            let backslashed = without_verbatim_prefix(&real_path.replace('/', "\\"));
            without_trailing_separators(platform, &backslashed).to_lowercase()
        }
        Platform::Macos => {
            // macOS volumes ignore case and Unicode form by default, and not
            // every realpath gives back the name as it is stored, so fold
            // both: NFC first, then lower case, as `keyedPath` does.
            let trimmed = without_trailing_separators(platform, real_path);
            ComposingNormalizerBorrowed::new_nfc()
                .normalize(&trimmed)
                .to_lowercase()
        }
        Platform::Linux => without_trailing_separators(platform, real_path),
    }
}

/// A Windows path without the verbatim prefix: `\\?\` before a drive is
/// dropped, and `\\?\UNC\server\share` (`UNC` in any case) becomes
/// `\\server\share`.
fn without_verbatim_prefix(path: &str) -> String {
    let share_prefix = path.get(..VERBATIM_SHARE_PREFIX.len());
    if share_prefix.is_some_and(|prefix| prefix.eq_ignore_ascii_case(VERBATIM_SHARE_PREFIX)) {
        return format!(r"\\{}", &path[VERBATIM_SHARE_PREFIX.len()..]);
    }
    path.strip_prefix(VERBATIM_PREFIX)
        .unwrap_or(path)
        .to_owned()
}

/// Whether an id is one `deployments.yaml` accepts: 1 to 64 lowercase
/// ASCII letters, digits, `-` or `_`, starting with a letter or digit, and
/// not a Windows device name.
fn is_deployment_id(id: &str) -> bool {
    let mut characters = id.chars();
    let Some(first) = characters.next() else {
        return false;
    };
    let allowed = |character: char| character.is_ascii_lowercase() || character.is_ascii_digit();
    id.len() <= DEPLOYMENT_ID_MAX_LENGTH
        && allowed(first)
        && characters.all(|character| allowed(character) || character == '-' || character == '_')
        && !is_windows_device_name(id)
}

/// Whether Windows keeps the name for a device: `con`, `prn`, `aux`, `nul`,
/// or `com` or `lpt` with one digit.
fn is_windows_device_name(name: &str) -> bool {
    if WINDOWS_DEVICE_NAMES.contains(&name) {
        return true;
    }
    WINDOWS_NUMBERED_DEVICE_NAMES.iter().any(|stem| {
        name.strip_prefix(stem).is_some_and(|rest| {
            rest.len() == 1 && rest.starts_with(|digit: char| digit.is_ascii_digit())
        })
    })
}
