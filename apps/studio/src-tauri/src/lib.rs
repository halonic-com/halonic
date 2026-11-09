//! The Studio shell. Today it opens one window with the connect page
//! (tauri.conf.json) and offers it the `connect` command. The capabilities
//! and the navigation guard arrive with the next HAL-1375 pull request.

mod connect;

/// Starts the shell. Android calls this through the generated entry point;
/// on desktop, `main` calls it.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![connect::connect])
        .run(tauri::generate_context!())
        .expect("the Studio shell could not start");
}
