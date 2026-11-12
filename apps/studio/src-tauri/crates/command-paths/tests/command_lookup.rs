//! Proves requirements/command-lookup.md.

use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};

use halonic_command_paths::{find_command, find_commands};

/// A folder of its own for one test, removed when the test ends.
struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let folder =
            std::env::temp_dir().join(format!("command-paths-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&folder);
        fs::create_dir_all(&folder).expect("the scratch folder can be created");
        Self(folder)
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn program(folder: &Path, name: &str) {
    let file = folder.join(name);
    fs::write(&file, "").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&file, fs::Permissions::from_mode(0o755)).unwrap();
    }
}

fn path_of(folders: &[&Path]) -> OsString {
    std::env::join_paths(folders).unwrap()
}

#[test]
fn command_lookup_finds_the_first_program_in_an_absolute_folder() {
    let first = Scratch::new("f1");
    let second = Scratch::new("f2");
    program(second.path(), "npx");
    program(first.path(), "npx");
    let path = path_of(&[first.path(), second.path()]);
    assert_eq!(
        find_command("npx", &path, &[]),
        Some(first.path().join("npx"))
    );
}

#[test]
fn command_lookup_skips_relative_and_empty_entries() {
    let folder = Scratch::new("f3");
    program(folder.path(), "npx");
    let path = OsString::from(format!(":relative:{}", folder.path().display()));
    let path = if cfg!(windows) {
        path_of(&[Path::new("relative")])
    } else {
        path
    };
    let found = find_command("npx", &path, &[]);
    if cfg!(windows) {
        assert_eq!(found, None);
    } else {
        assert_eq!(found, Some(folder.path().join("npx")));
    }
}

#[test]
fn command_lookup_gives_nothing_for_a_command_holding_a_folder() {
    let folder = Scratch::new("f4");
    program(folder.path(), "tool");
    let path = path_of(&[folder.path()]);
    for command in ["", "./tool", "a/tool", "a\\tool"] {
        assert_eq!(find_command(command, &path, &[]), None, "{command:?}");
    }
}

#[test]
fn command_lookup_tries_each_ending_or_the_one_it_has() {
    let folder = Scratch::new("f5");
    program(folder.path(), "npx.cmd");
    program(folder.path(), "tool.exe");
    let path = path_of(&[folder.path()]);
    let endings: Vec<String> = [".com", ".EXE", ".cmd"].map(String::from).to_vec();
    assert_eq!(
        find_command("npx", &path, &endings),
        Some(folder.path().join("npx.cmd"))
    );
    // A command that already ends in an ending is tried as written only.
    assert_eq!(
        find_command("tool.exe", &path, &endings),
        Some(folder.path().join("tool.exe"))
    );
    assert_eq!(find_command("npx", &path, &[]), None);
}

#[test]
fn command_lookup_ignores_folders_and_files_that_cant_run() {
    let folder = Scratch::new("f6");
    fs::create_dir(folder.path().join("npx")).unwrap();
    let path = path_of(&[folder.path()]);
    assert_eq!(find_command("npx", &path, &[]), None);
    #[cfg(unix)]
    {
        fs::write(folder.path().join("plain"), "").unwrap();
        assert_eq!(find_command("plain", &path, &[]), None);
    }
}

#[test]
fn command_lookup_leaves_out_what_it_cant_find() {
    let folder = Scratch::new("f7");
    program(folder.path(), "npx");
    let path = path_of(&[folder.path()]);
    let found = find_commands(&["npx".to_owned(), "missing".to_owned()], &path, &[]);
    assert_eq!(found.len(), 1);
    assert_eq!(found["npx"], folder.path().join("npx").to_str().unwrap());
}
