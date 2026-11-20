//! Executable stand-ins for tests, safe from "Text file busy". See the
//! README for the race this avoids.

/// Writes `text` (a script, starting with its `#!` line) to `path` and
/// makes it executable. Panics if either step fails, as a test should.
///
/// The file is written by a separate `/bin/sh`, never opened here: a write
/// handle open in the test process could be copied into a child another
/// test starts at that moment, and while that child holds it, running the
/// script fails with "Text file busy".
#[cfg(unix)]
pub fn write_executable(path: &std::path::Path, text: &str) {
    use std::os::unix::fs::PermissionsExt;

    // `printf` is built into sh, so the handle lives only in that one
    // process, and `output` returns once it has exited.
    let output = std::process::Command::new("/bin/sh")
        .args(["-c", "printf '%s' \"$2\" > \"$1\"", "write-stand-in"])
        .arg(path)
        .arg(text)
        .output()
        .expect("sh starts to write the stand-in");
    assert!(
        output.status.success(),
        "the stand-in {} is written: {}",
        path.display(),
        String::from_utf8_lossy(&output.stderr)
    );
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755))
        .expect("the stand-in is executable");
}
