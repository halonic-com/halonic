//! Requirement `plugin-folder-commands`: the plugins folder the shell reads
//! for the page, whatever the page asks.

use std::path::{Path, PathBuf};

use serde_json::{Value, json};

use super::{entries, folder_to_reveal, location, read};

/// A folder of its own for one test, removed when the test ends.
struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let folder =
            std::env::temp_dir().join(format!("plugin-folder-{name}-{}", std::process::id()));
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

fn kinds(root: &Path) -> Vec<(String, &'static str)> {
    let answers = entries(root, None, None, true).expect("the entries");
    let json = serde_json::to_value(answers).expect("it serialises");
    json.as_array()
        .expect("a list")
        .iter()
        .map(|entry| {
            let kind = match entry["kind"].as_str().expect("a kind") {
                "file" => "file",
                "folder" => "folder",
                "link" => "link",
                _ => "other",
            };
            (entry["path"].as_str().expect("a path").to_owned(), kind)
        })
        .collect()
}

#[test]
fn plugin_folder_test_lists_and_reads_the_installed_plugins() {
    let scratch = Scratch::new("reads");
    scratch.write("acme-weather/plugin.yaml", "id: acme-weather\n");

    assert_eq!(
        kinds(&scratch.plugins()),
        vec![
            ("acme-weather".to_owned(), "folder"),
            ("acme-weather/plugin.yaml".to_owned(), "file"),
        ]
    );
    let bytes = read(&scratch.plugins(), "acme-weather/plugin.yaml").expect("the read");
    assert_eq!(bytes.as_deref(), Some("aWQ6IGFjbWUtd2VhdGhlcgo"));
    assert_eq!(read(&scratch.plugins(), "acme-weather/nope.yaml"), Ok(None));
}

#[test]
fn plugin_folder_test_answers_as_an_empty_folder_and_makes_none() {
    let scratch = Scratch::new("missing");
    let root = scratch.plugins();

    assert_eq!(kinds(&root), vec![]);
    assert_eq!(read(&root, "a/plugin.yaml"), Ok(None));
    assert_eq!(location(&root, None), Ok(None));
    assert_eq!(folder_to_reveal(&root, None), Ok(None));
    assert!(!root.exists(), "nothing is created");
}

#[test]
fn plugin_folder_test_refuses_an_unsafe_path() {
    let scratch = Scratch::new("unsafe");
    scratch.write("acme-weather/plugin.yaml", "id: acme-weather\n");

    for path in ["../trust/a.json", "/etc/passwd", "a/../../b", "a\\b"] {
        let refusal = read(&scratch.plugins(), path).expect_err(path);
        assert_eq!(refusal.kind(), "unsafe_path", "{path}");
    }
    let outside = folder_to_reveal(&scratch.plugins(), Some("../trust")).expect_err("outside");
    assert_eq!(outside.kind(), "unsafe_path");
    let nested =
        folder_to_reveal(&scratch.plugins(), Some("acme-weather/src")).expect_err("not one name");
    assert_eq!(nested.kind(), "unsafe_path");
}

#[test]
fn plugin_folder_test_reveals_the_plugins_folder_and_an_installed_plugin_only() {
    let scratch = Scratch::new("reveal");
    scratch.write("acme-weather/plugin.yaml", "id: acme-weather\n");
    scratch.write("stray.txt", "not a plugin\n");
    let root = scratch.plugins();

    let all = folder_to_reveal(&root, None).expect("the folder");
    assert_eq!(all, Some(std::fs::canonicalize(&root).expect("real")));
    let one = folder_to_reveal(&root, Some("acme-weather")).expect("the plugin");
    assert_eq!(
        one,
        Some(std::fs::canonicalize(root.join("acme-weather")).expect("real"))
    );
    assert_eq!(folder_to_reveal(&root, Some("stray.txt")), Ok(None));
    assert_eq!(folder_to_reveal(&root, Some("acme-other")), Ok(None));
}

#[cfg(unix)]
#[test]
fn plugin_folder_test_never_follows_a_link() {
    use std::os::unix::fs::symlink;

    let scratch = Scratch::new("links");
    scratch.write("acme-weather/plugin.yaml", "id: acme-weather\n");
    let outside = scratch.0.join("outside");
    std::fs::create_dir_all(&outside).expect("the outside folder");
    std::fs::write(outside.join("plugin.yaml"), "id: outside\n").expect("the file");
    symlink(&outside, scratch.plugins().join("acme-linked")).expect("the link");

    let listed = kinds(&scratch.plugins());
    assert!(
        listed.contains(&("acme-linked".to_owned(), "link")),
        "{listed:?}"
    );
    assert!(
        listed
            .iter()
            .all(|(path, _)| !path.starts_with("acme-linked/"))
    );
    let through = read(&scratch.plugins(), "acme-linked/plugin.yaml").expect_err("through a link");
    assert_eq!(through.kind(), "private_path");
    assert_eq!(
        folder_to_reveal(&scratch.plugins(), Some("acme-linked")),
        Ok(None)
    );
}

#[cfg(unix)]
#[test]
fn plugin_folder_test_refuses_a_plugins_folder_that_is_a_link() {
    use std::os::unix::fs::symlink;

    let scratch = Scratch::new("root-link");
    let elsewhere = scratch.0.join("elsewhere");
    std::fs::create_dir_all(elsewhere.join("acme-weather")).expect("the folder");
    symlink(&elsewhere, scratch.plugins()).expect("the link");

    let refusal = entries(&scratch.plugins(), None, None, true).expect_err("a link");
    assert_eq!(refusal.kind(), "private_path");
    assert_eq!(
        read(&scratch.plugins(), "acme-weather/plugin.yaml")
            .expect_err("a link")
            .kind(),
        "private_path"
    );
    assert!(folder_to_reveal(&scratch.plugins(), None).is_err());
}

#[test]
fn plugin_folder_test_refuses_a_plugins_folder_that_is_a_file() {
    let scratch = Scratch::new("root-file");
    std::fs::write(scratch.plugins(), "not a folder").expect("the file");

    let refusal = entries(&scratch.plugins(), None, None, true).expect_err("a file");
    assert_eq!(refusal.kind(), "special_path");
}

#[test]
fn plugin_folder_test_sees_the_commands_granted_to_the_local_main_window_only() {
    // A remote page must never reach the plugin folder: the served Studio
    // could then read every installed plugin's files.
    let text = include_str!("../capabilities/desktop-plugin-folder.json");
    let capability: Value = serde_json::from_str(text).expect("the capability is JSON");
    assert_eq!(capability["local"], true);
    assert_eq!(capability["windows"], json!(["main"]));
    assert!(capability.get("remote").is_none(), "{capability}");
    assert_eq!(
        capability["permissions"],
        json!([
            "allow-plugin-folder-entries",
            "allow-plugin-folder-read",
            "allow-plugin-folder-location",
            "allow-plugin-folder-reveal"
        ])
    );
}
