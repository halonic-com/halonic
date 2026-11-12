//! The hash built into the helper is the hash of the srt-win.exe the repo
//! ships. When sandbox-runtime is updated, this fails until
//! `SRT_WIN_SHA256` is updated with it.

use halonic_sandbox_elevate::sha256_hex;
use std::path::Path;

/// sandbox-runtime as the sandbox-srt package installs it (pnpm links it
/// there). The Tauri CI jobs install the repo's packages first.
const PACKAGE: &str =
    "../../../../../packages/adapters/sandbox-srt/node_modules/@anthropic-ai/sandbox-runtime";

fn shipped(arch: &str) -> String {
    let file = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join(PACKAGE)
        .join("vendor/srt-win")
        .join(arch)
        .join("srt-win.exe");
    let bytes = std::fs::read(&file).unwrap_or_else(|error| {
        panic!(
            "{} can't be read ({error}); run `pnpm install` first",
            file.display()
        )
    });
    sha256_hex(&bytes)
}

#[test]
fn sandbox_elevate_knows_the_hash_of_the_shipped_srt_win() {
    let arch = if cfg!(target_arch = "aarch64") {
        "arm64"
    } else {
        "x64"
    };
    assert_eq!(halonic_sandbox_elevate::SRT_WIN_SHA256, shipped(arch));
}
