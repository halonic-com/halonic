//! Requirement `plugin-folder-remove`: the one folder the shell deletes for
//! the page, whatever the page asks.

use std::path::PathBuf;

use serde_json::{Value, json};

use super::remove_plugin;

/// A folder of its own for one test, removed when the test ends.
struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let folder =
            std::env::temp_dir().join(format!("plugin-remove-{name}-{}", std::process::id()));
        // A crashed earlier run may have left it; it is ours to clear.
        let _ = std::fs::remove_dir_all(&folder);
        std::fs::create_dir_all(&folder).expect("the scratch folder");
        Self(folder)
    }

    fn plugins(&self) -> PathBuf {
        self.0.join("plugins")
    }

    fn write(&self, path: &str, text: &str) {
        let target = self.plugins().join(path);
        std::fs::create_dir_all(target.parent().expect("a parent")).expect("the folder");
        std::fs::write(target, text).expect("the file");
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[test]
fn plugin_folder_remove_test_deletes_one_plugin_and_leaves_the_others() {
    let scratch = Scratch::new("one");
    scratch.write("acme-weather/plugin.yaml", "id: acme-weather\n");
    scratch.write("acme-weather/src/index.js", "export {};\n");
    scratch.write("acme-other/plugin.yaml", "id: acme-other\n");

    remove_plugin(&scratch.plugins(), "acme-weather").expect("the removal");

    assert!(!scratch.plugins().join("acme-weather").exists());
    assert!(scratch.plugins().join("acme-other/plugin.yaml").exists());
}

#[test]
fn plugin_folder_remove_test_succeeds_when_there_is_nothing_to_remove() {
    let scratch = Scratch::new("missing");
    let root = scratch.plugins();
    assert_eq!(remove_plugin(&root, "acme-weather"), Ok(()));
    assert!(!root.exists(), "nothing is created");

    scratch.write("acme-other/plugin.yaml", "id: acme-other\n");
    assert_eq!(remove_plugin(&root, "acme-weather"), Ok(()));
    assert!(root.join("acme-other").exists());
}

#[test]
fn plugin_folder_remove_test_refuses_a_name_that_is_not_one_folder() {
    let scratch = Scratch::new("unsafe");
    scratch.write("acme-weather/src/index.js", "export {};\n");
    std::fs::create_dir_all(scratch.0.join("trust")).expect("the folder");
    std::fs::write(scratch.0.join("trust/a.json"), "{}\n").expect("the file");

    for name in [
        "",
        ".",
        "..",
        "../trust",
        "/etc",
        "acme-weather/src",
        "a\\b",
        ".git",
        "...",
        "acme-weather.",
        "acme-weather ",
    ] {
        let refusal = remove_plugin(&scratch.plugins(), name).expect_err(name);
        assert!(
            ["unsafe_path", "private_path"].contains(&refusal.kind()),
            "{name}: {}",
            refusal.kind()
        );
    }
    assert!(scratch.plugins().join("acme-weather/src/index.js").exists());
    assert!(scratch.0.join("trust/a.json").exists());
}

#[test]
fn plugin_folder_remove_test_refuses_a_plain_file() {
    let scratch = Scratch::new("file");
    scratch.write("stray.txt", "not a plugin\n");

    let refusal = remove_plugin(&scratch.plugins(), "stray.txt").expect_err("a file");
    assert_eq!(refusal.kind(), "special_path");
    assert!(scratch.plugins().join("stray.txt").exists());
}

#[cfg(unix)]
#[test]
fn plugin_folder_remove_test_removes_a_link_and_never_its_target() {
    use std::os::unix::fs::symlink;

    let scratch = Scratch::new("link");
    let outside = scratch.0.join("outside");
    std::fs::create_dir_all(&outside).expect("the outside folder");
    std::fs::write(outside.join("plugin.yaml"), "id: outside\n").expect("the file");
    std::fs::create_dir_all(scratch.plugins()).expect("the plugins folder");
    symlink(&outside, scratch.plugins().join("acme-linked")).expect("the link");

    remove_plugin(&scratch.plugins(), "acme-linked").expect("the removal");

    assert!(std::fs::symlink_metadata(scratch.plugins().join("acme-linked")).is_err());
    assert!(outside.join("plugin.yaml").exists(), "the target is left");
}

#[cfg(unix)]
#[test]
fn plugin_folder_remove_test_deletes_a_link_inside_a_plugin_and_not_its_target() {
    use std::os::unix::fs::symlink;

    let scratch = Scratch::new("inner-link");
    scratch.write("acme-weather/plugin.yaml", "id: acme-weather\n");
    let outside = scratch.0.join("outside");
    std::fs::create_dir_all(&outside).expect("the outside folder");
    std::fs::write(outside.join("keep.txt"), "keep\n").expect("the file");
    symlink(&outside, scratch.plugins().join("acme-weather/data")).expect("the link");

    remove_plugin(&scratch.plugins(), "acme-weather").expect("the removal");

    assert!(!scratch.plugins().join("acme-weather").exists());
    assert!(outside.join("keep.txt").exists(), "the target is left");
}

#[cfg(unix)]
#[test]
fn plugin_folder_remove_test_refuses_a_plugins_folder_that_is_a_link() {
    use std::os::unix::fs::symlink;

    let scratch = Scratch::new("root-link");
    let elsewhere = scratch.0.join("elsewhere");
    std::fs::create_dir_all(elsewhere.join("acme-weather")).expect("the folder");
    symlink(&elsewhere, scratch.plugins()).expect("the link");

    let refusal = remove_plugin(&scratch.plugins(), "acme-weather").expect_err("a link");
    assert_eq!(refusal.kind(), "private_path");
    assert!(elsewhere.join("acme-weather").exists());
}

#[test]
fn plugin_folder_remove_test_refuses_a_plugins_folder_that_is_a_file() {
    let scratch = Scratch::new("root-file");
    std::fs::write(scratch.plugins(), "not a folder").expect("the file");

    let refusal = remove_plugin(&scratch.plugins(), "acme-weather").expect_err("a file");
    assert_eq!(refusal.kind(), "special_path");
}

#[test]
fn plugin_folder_remove_test_is_granted_to_the_local_main_window_only() {
    // A remote page must never delete a plugin: the served Studio could
    // then remove every installed plugin.
    let text = include_str!("../capabilities/desktop-plugin-folder-remove.json");
    let capability: Value = serde_json::from_str(text).expect("the capability is JSON");
    assert_eq!(capability["local"], true);
    assert_eq!(capability["windows"], json!(["main"]));
    assert!(capability.get("remote").is_none(), "{capability}");
    assert_eq!(
        capability["permissions"],
        json!(["allow-plugin-folder-remove"])
    );
}
