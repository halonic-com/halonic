//! The Studio shell. Today it only opens one window with the connect page
//! (tauri.conf.json). The `connect` command, the capabilities and the
//! navigation guard arrive with HAL-1140.

/// Starts the shell. Android calls this through the generated entry point;
/// on desktop, `main` calls it.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("the Studio shell could not start");
}
