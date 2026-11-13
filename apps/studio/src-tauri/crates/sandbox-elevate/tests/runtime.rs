//! The pinned C++ runtime beside srt-win, against a pretend Windows. Each
//! test's name starts with the requirement it proves (`sandbox_elevate_runtime_`).

mod common;

use common::{Pretend, RUNTIME_BYTES, SHIPPED, app, folder};
use halonic_sandbox_elevate::{RUNTIME, RUNTIME_SHIPPED, Verb, code};

#[test]
fn sandbox_elevate_runtime_goes_beside_srt_win_and_never_into_the_app_folder() {
    let machine = Pretend::new(app(), Some(SHIPPED));
    assert_eq!(machine.run(Verb::SetUp), code::OK);
    // Under its own name in the admin-only folder, for Users to read and run.
    assert_eq!(
        machine.file(folder().join(RUNTIME)).as_deref(),
        Some(RUNTIME_BYTES)
    );
    assert!(machine.shared.borrow().contains(&folder().join(RUNTIME)));
    // The app folder holds it only under the shipped name, which no program
    // loads, and the helper wrote nothing there.
    assert_eq!(machine.file(app().join(RUNTIME)), None);
    assert!(
        machine
            .written
            .borrow()
            .iter()
            .all(|file| file.parent() == Some(folder().as_path()))
    );
}

#[test]
fn sandbox_elevate_runtime_refuses_a_swapped_copy_and_deletes_the_one_in_the_folder() {
    let machine = Pretend::new(app(), Some(SHIPPED));
    machine
        .files
        .borrow_mut()
        .insert(app().join(RUNTIME_SHIPPED), b"a planted runtime".to_vec());
    // A copy from an earlier setup.
    machine
        .files
        .borrow_mut()
        .insert(folder().join(RUNTIME), RUNTIME_BYTES.to_vec());
    assert_eq!(machine.run(Verb::SetUp), code::WRONG_RUNTIME);
    assert!(machine.ran().is_empty());
    assert_eq!(machine.file(folder().join(RUNTIME)), None);
    assert!(!machine.written.borrow().contains(&folder().join(RUNTIME)));
    assert_eq!(*machine.entry.borrow(), None);
}

#[test]
fn sandbox_elevate_runtime_missing_stops_setup() {
    let machine = Pretend::new(app(), Some(SHIPPED));
    machine
        .files
        .borrow_mut()
        .remove(&app().join(RUNTIME_SHIPPED));
    assert_eq!(machine.run(Verb::SetUp), code::NO_RUNTIME);
    assert!(machine.ran().is_empty());
}

#[test]
fn sandbox_elevate_runtime_is_removed_with_the_folder_and_an_older_setup_still_removes() {
    let machine = Pretend::new(app(), Some(SHIPPED));
    assert_eq!(machine.run(Verb::SetUp), code::OK);
    let mut from_installed_apps = Pretend::new(folder(), Some(SHIPPED));
    from_installed_apps.files = machine.files;
    from_installed_apps.entry = machine.entry;
    // A setup before the runtime was shipped left none.
    from_installed_apps
        .files
        .borrow_mut()
        .remove(&folder().join(RUNTIME));
    assert_eq!(from_installed_apps.run(Verb::Remove), code::OK);
    assert!(
        from_installed_apps
            .deleted
            .borrow()
            .contains(&folder().join(RUNTIME))
    );
}
