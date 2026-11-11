//! The workspace's files, for the Studio shell's `fs_*` commands (HAL-5761)
//! and the desktop `DefinitionStore` in `packages/adapters/fs-tauri` built
//! over them. It keeps the files as `FolderDefinitionStore` in `fs-node`
//! does, so the desktop app and the CLI can work on one folder.
//!
//! The page that calls the commands isn't trusted, so every path is checked
//! here as `checkPublicWorkspacePath` in `@halonicjs/ports` checks it, and no
//! call reads, writes or removes through a symbolic link or a junction.
//! Which folders may be used at all is the shell's to decide (`git-guard`'s
//! `OpenedFolders`): a [`WorkspaceFolder`] trusts the root it is given.

mod error;
mod folder;
mod links;
mod temporary_write;
mod workspace_path;
mod write_locks;

pub use error::FileError;
pub use folder::{WorkspaceFolder, WriteOutcome, content_digest};
pub use workspace_path::{
    check_public_workspace_path, check_workspace_path, is_private_workspace_path, segment_as_opened,
};
pub use write_locks::WriteLocks;
