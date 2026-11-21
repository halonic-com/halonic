/**
 * How long a setup may run before Studio says so, in minutes (SB3). The same as the shell's `LIMIT`
 * for its `runas` start of the helper (`apps/studio/src-tauri/src/sandbox_elevate.rs`, HAL-14841)
 * and the installer's wait: change them together. The command isn't stopped.
 */
export const SETUP_LIMIT_MINUTES = 5;
