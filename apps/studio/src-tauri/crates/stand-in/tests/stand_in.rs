//! The stand-ins run, even while other threads write and start theirs.
#![cfg(unix)]

use std::path::PathBuf;
use std::process::Command;

use halonic_stand_in::write_executable;

/// A folder of the test's own in the temp directory, removed when dropped.
struct Folder(PathBuf);

impl Folder {
    fn new(name: &str) -> Folder {
        let path =
            std::env::temp_dir().join(format!("halonic-stand-in-{}-{name}", std::process::id()));
        std::fs::create_dir_all(&path).expect("make the folder");
        Folder(path)
    }
}

impl Drop for Folder {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[test]
fn stand_in_runs_with_its_text_as_written() {
    let folder = Folder::new("text");
    let script = folder.0.join("acme");
    let text = "#!/bin/sh\nprintf '%s|' \"$@\" '100%' \"it's\"\n";
    write_executable(&script, text);
    assert_eq!(std::fs::read_to_string(&script).expect("read it"), text);
    let output = Command::new(&script)
        .arg("one")
        .output()
        .expect("it starts");
    assert!(output.status.success());
    assert_eq!(String::from_utf8_lossy(&output.stdout), "one|100%|it's|");
}

/// What made the agent host's `wsl.exe` stand-in fail now and then
/// (HAL-14265): many threads writing scripts and starting them at once.
#[test]
fn stand_ins_start_while_other_threads_write_and_start_theirs() {
    let folder = Folder::new("busy");
    std::thread::scope(|scope| {
        for thread in 0..8 {
            let folder = &folder.0;
            scope.spawn(move || {
                for round in 0..40 {
                    let script = folder.join(format!("acme-{thread}-{round}"));
                    write_executable(&script, "#!/bin/sh\nexit 0\n");
                    let status = Command::new(&script)
                        .status()
                        .unwrap_or_else(|error| panic!("{}: {error}", script.display()));
                    assert!(status.success());
                }
            });
        }
    });
}
