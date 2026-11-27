// No console window next to the app in Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() -> std::process::ExitCode {
    // Started as `Halonic Inbox.exe` or `Halonic Messenger.exe`, hard links
    // to this exe that the installer makes (HAL-20468), it runs only that
    // app's frame: never Tauri, so a frame never takes Halonic's
    // single-instance place.
    #[cfg(windows)]
    if let Some(app) = std::env::current_exe()
        .ok()
        .as_deref()
        .and_then(halonic_app_frame::started_as)
    {
        return halonic_app_frame::run(app);
    }
    halonic_studio::run();
    std::process::ExitCode::SUCCESS
}
