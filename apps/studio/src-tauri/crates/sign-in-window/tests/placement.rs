//! Requirement `studio.src-tauri.crates.sign-in-window.sign-in-window`: after
//! the start, only the one window that wasn't there before is moved, and
//! the search ends at its deadline without moving anything.

use std::cell::RefCell;

use halonic_sign_in_window::{BrowserWindow, Handle, Placed, place_new_window};

fn shown(handle: Handle) -> BrowserWindow {
    BrowserWindow {
        handle,
        visible: true,
    }
}

fn hidden(handle: Handle) -> BrowserWindow {
    BrowserWindow {
        handle,
        visible: false,
    }
}

/// Runs the search over `lists`, one per look, with a deadline after the
/// last, and answers what it did and which windows it moved.
fn search(before: &[Handle], lists: Vec<Vec<BrowserWindow>>) -> (Placed, Vec<Handle>) {
    let moved = RefCell::new(Vec::new());
    let looks = RefCell::new(lists.into_iter());
    let placed = place_new_window(
        before,
        || Ok(looks.borrow_mut().next().unwrap_or_default()),
        |handle| {
            moved.borrow_mut().push(handle);
            Ok(())
        },
        || looks.borrow().len() > 0,
    );
    (placed, moved.into_inner())
}

#[test]
fn the_one_new_window_is_moved() {
    let (placed, moved) = search(&[1, 2], vec![vec![shown(1), shown(2), shown(7)]]);
    assert_eq!(placed, Placed::Moved);
    assert_eq!(moved, vec![7]);
}

#[test]
fn it_looks_again_until_the_window_shows() {
    let before = [1];
    let (placed, moved) = search(
        &before,
        vec![
            vec![shown(1)],
            vec![shown(1), hidden(7)],
            vec![shown(1), shown(7)],
        ],
    );
    assert_eq!(placed, Placed::Moved);
    assert_eq!(moved, vec![7]);
}

#[test]
fn a_window_that_was_there_hidden_is_never_the_new_one() {
    let (placed, moved) = search(
        &[1, 5],
        vec![vec![shown(1), shown(5)], vec![shown(1), shown(5)]],
    );
    assert_eq!(placed, Placed::NoneNew);
    assert!(moved.is_empty());
}

#[test]
fn nothing_new_by_the_deadline_moves_nothing() {
    let (placed, moved) = search(&[1], vec![vec![shown(1)], vec![shown(1)], vec![shown(1)]]);
    assert_eq!(placed, Placed::NoneNew);
    assert!(moved.is_empty());
}

#[test]
fn several_new_windows_move_nothing() {
    let (placed, moved) = search(&[], vec![vec![shown(3), shown(4)]]);
    assert_eq!(placed, Placed::Several(2));
    assert!(moved.is_empty());
}

#[test]
fn a_failed_list_or_move_is_reported() {
    let placed = place_new_window(
        &[],
        || Err("listing windows: denied".to_owned()),
        |_| Ok(()),
        || true,
    );
    assert_eq!(placed, Placed::Failed("listing windows: denied".to_owned()));
    let placed = place_new_window(
        &[],
        || Ok(vec![shown(9)]),
        |_| Err("moving the window: gone".to_owned()),
        || true,
    );
    assert_eq!(placed, Placed::Failed("moving the window: gone".to_owned()));
}
