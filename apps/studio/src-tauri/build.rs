// Reads tauri.conf.json and the capabilities, and prepares what the shell
// embeds at compile time.
//
// Naming the app's commands here makes each one need a permission, like a
// plugin's: a page may call `connect` only if a capability grants
// `allow-connect`. Add every new command to this list.
fn main() {
    let commands = tauri_build::AppManifest::new().commands(&["connect"]);
    let attributes = tauri_build::Attributes::new()
        .app_manifest(commands)
        .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
    tauri_build::try_build(attributes).expect("the shell's build step failed");
    embed_windows_manifest();
}

// tauri-build embeds its Windows manifest in the app binary only. The
// manifest asks for version 6 of the Windows common controls, which the
// WebView code links against, so a test binary without it exits at start
// with STATUS_ENTRYPOINT_NOT_FOUND. Passing the manifest to the linker
// ourselves puts it in every binary, tests included.
fn embed_windows_manifest() {
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let target_env = std::env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();
    if target_os != "windows" || target_env != "msvc" {
        return;
    }
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").expect("cargo sets CARGO_MANIFEST_DIR");
    let manifest = std::path::Path::new(&manifest_dir).join("windows-app-manifest.xml");
    println!("cargo:rerun-if-changed={}", manifest.display());
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
}
