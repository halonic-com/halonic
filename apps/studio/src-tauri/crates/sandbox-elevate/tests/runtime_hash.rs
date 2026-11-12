//! The hashes built into the helper are the hashes of the `vcruntime140.dll`
//! the installer build fetches. `windows/vcruntime.json` pins that file for
//! the build; when it changes, this fails until `RUNTIME_SHA256` follows.

use halonic_sandbox_elevate::RUNTIME_SHA256;
use std::path::Path;

fn pinned() -> String {
    let file = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../windows/vcruntime.json");
    std::fs::read_to_string(&file)
        .unwrap_or_else(|error| panic!("{} can't be read ({error})", file.display()))
}

#[test]
fn sandbox_elevate_runtime_knows_the_hash_of_the_pinned_vcruntime() {
    let arch = if cfg!(target_arch = "aarch64") {
        "arm64"
    } else {
        "x64"
    };
    // The entry for this architecture, up to the next one's closing brace.
    let pin = pinned();
    let entry = pin
        .split(&format!("\"{arch}\""))
        .nth(1)
        .and_then(|rest| rest.split('}').next())
        .expect("an entry for this architecture in vcruntime.json");
    assert!(
        entry.contains(&format!("\"sha256\": \"{RUNTIME_SHA256}\"")),
        "vcruntime.json pins another vcruntime140.dll than the helper knows"
    );
}
