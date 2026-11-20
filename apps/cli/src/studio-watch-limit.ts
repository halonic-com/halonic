// The most files Studio's folder watch looks at, so `halonic doctor` can
// warn about a workspace Studio won't watch (HAL-12295). The shell's own
// limit is `MAX_WATCHED_FILES` in the `workspace-files` crate
// (`apps/studio/src-tauri/crates/workspace-files/src/watch.rs`); a test
// reads it from there and checks the two are equal.

/** Studio's folder watch limit: a folder with more files isn't watched. */
export const studioWatchedFileLimit = 50_000;
