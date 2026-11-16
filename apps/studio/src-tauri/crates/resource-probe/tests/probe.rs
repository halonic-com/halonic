use halonic_resource_probe::{folder_size_bytes, free_disk_bytes, process_memory_bytes};
use std::fs;
use std::path::PathBuf;

/// How far two readings of one drive's free space may drift apart while a
/// test runs.
const FREE_SPACE_TOLERANCE_BYTES: u64 = 64 * 1024 * 1024;

/// A new empty folder under the system's temporary folder, removed when
/// dropped.
struct TempFolder(PathBuf);

impl TempFolder {
    fn new(name: &str) -> Self {
        let path =
            std::env::temp_dir().join(format!("resource-probe-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).expect("create the test folder");
        Self(path)
    }
}

impl Drop for TempFolder {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn resource_probe_reads_this_process_s_memory() {
    // A running test program holds at least a few hundred kilobytes.
    assert!(process_memory_bytes().expect("memory") > 100 * 1024);
}

#[test]
fn resource_probe_reads_the_free_space_of_a_folder() {
    let free = free_disk_bytes(&std::env::temp_dir()).expect("free space");
    assert!(free > 0);
}

#[test]
fn resource_probe_reads_the_drive_of_a_folder_that_does_not_exist_yet() {
    let folder = TempFolder::new("missing-drive");
    let not_yet = folder.0.join("not").join("yet");
    let of_missing = free_disk_bytes(&not_yet).expect("free space");
    let of_existing = free_disk_bytes(&folder.0).expect("free space");
    // Free space on a shared drive moves between two readings, so the two
    // only have to be close. A different drive would differ by far more.
    assert!(
        of_missing.abs_diff(of_existing) <= FREE_SPACE_TOLERANCE_BYTES,
        "free space of the missing folder ({of_missing}) is not the drive's ({of_existing})",
    );
}

#[test]
fn resource_probe_adds_up_the_files_in_a_folder_and_the_folders_in_it() {
    let folder = TempFolder::new("sum");
    fs::write(folder.0.join("a.txt"), [0u8; 100]).unwrap();
    fs::create_dir_all(folder.0.join("sub").join("deeper")).unwrap();
    fs::write(folder.0.join("sub").join("b.txt"), [0u8; 20]).unwrap();
    fs::write(folder.0.join("sub").join("deeper").join("c.txt"), [0u8; 3]).unwrap();
    assert_eq!(folder_size_bytes(&folder.0).unwrap(), 123);
}

#[test]
fn resource_probe_counts_an_empty_folder_as_nothing() {
    let folder = TempFolder::new("empty");
    assert_eq!(folder_size_bytes(&folder.0).unwrap(), 0);
}

#[test]
fn resource_probe_counts_a_folder_that_does_not_exist_as_nothing() {
    let folder = TempFolder::new("absent");
    assert_eq!(folder_size_bytes(&folder.0.join("absent")).unwrap(), 0);
}

#[cfg(unix)]
#[test]
fn resource_probe_does_not_follow_a_symbolic_link() {
    let outside = TempFolder::new("link-outside");
    fs::write(outside.0.join("big.bin"), [0u8; 5000]).unwrap();
    let folder = TempFolder::new("link-inside");
    fs::write(folder.0.join("a.txt"), [0u8; 7]).unwrap();
    std::os::unix::fs::symlink(&outside.0, folder.0.join("to-outside")).unwrap();
    std::os::unix::fs::symlink(&folder.0, folder.0.join("to-itself")).unwrap();
    assert_eq!(folder_size_bytes(&folder.0).unwrap(), 7);
}
