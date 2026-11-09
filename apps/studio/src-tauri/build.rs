// Reads tauri.conf.json and the capabilities, and prepares what the shell
// embeds at compile time.
//
// Naming the app's commands here makes each one need a permission, like a
// plugin's: a page may call `connect` only if a capability grants
// `allow-connect`. Add every new command to this list.
fn main() {
    let commands = tauri_build::AppManifest::new().commands(&["connect"]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(commands))
        .expect("the shell's build step failed");
}
