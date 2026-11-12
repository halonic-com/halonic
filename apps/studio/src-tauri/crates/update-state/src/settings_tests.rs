use std::fs;
use std::path::PathBuf;

use super::{Migrated, backup_path, migrate_settings_file};

/// A folder of its own under the system's temporary folder, removed after.
struct Folder(PathBuf);

impl Folder {
    fn new(name: &str) -> Self {
        let path = std::env::temp_dir().join(format!(
            "halonic-update-state-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).expect("a test folder");
        Folder(path)
    }
}

impl Drop for Folder {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn rename_theme(text: &str) -> Migrated {
    Migrated {
        text: text.replace("\"theme\"", "\"appearance\""),
        not_carried_over: vec!["fontLigatures".to_owned()],
    }
}

#[test]
fn update_state_names_the_backup_after_the_old_version() {
    let file = PathBuf::from("settings").join("host.json");
    assert_eq!(
        backup_path(&file, "0.1.0"),
        PathBuf::from("settings").join("host.json.0.1.0.bak")
    );
}

#[test]
fn update_state_keeps_the_old_settings_before_it_changes_them() {
    let folder = Folder::new("migrate");
    let file = folder.0.join("host.json");
    fs::write(&file, r#"{"theme":"dark"}"#).expect("written");
    let lost = migrate_settings_file(&file, "0.1.0", rename_theme).expect("migrated");
    assert_eq!(lost, vec!["fontLigatures".to_owned()]);
    assert_eq!(
        fs::read_to_string(&file).expect("read"),
        r#"{"appearance":"dark"}"#
    );
    let backup = folder.0.join("host.json.0.1.0.bak");
    assert_eq!(
        fs::read_to_string(&backup).expect("kept"),
        r#"{"theme":"dark"}"#
    );
    // A second migration from the same version never writes over the backup.
    fs::write(&file, r#"{"theme":"light"}"#).expect("written");
    migrate_settings_file(&file, "0.1.0", rename_theme).expect("migrated");
    assert_eq!(
        fs::read_to_string(&backup).expect("kept"),
        r#"{"theme":"dark"}"#
    );
}

#[test]
fn update_state_leaves_settings_alone_when_nothing_changes() {
    let folder = Folder::new("unchanged");
    let file = folder.0.join("host.json");
    fs::write(&file, r#"{"appearance":"dark"}"#).expect("written");
    let lost = migrate_settings_file(&file, "0.1.0", rename_theme).expect("migrated");
    assert_eq!(lost, vec!["fontLigatures".to_owned()]);
    assert!(!folder.0.join("host.json.0.1.0.bak").exists());
    let missing = folder.0.join("missing.json");
    assert_eq!(
        migrate_settings_file(&missing, "0.1.0", rename_theme).expect("nothing to do"),
        Vec::<String>::new()
    );
    assert!(!missing.exists());
}
