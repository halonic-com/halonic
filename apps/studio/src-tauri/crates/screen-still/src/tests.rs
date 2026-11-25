//! Requirement `studio.src-tauri.crates.screen-still.screen-still`.

use super::{CropBox, Still, still_from_bgra_rows};

/// A 3 × 2 still whose every pixel names its own column and row.
fn numbered_still() -> Still {
    let mut rgba = Vec::new();
    for row in 0..2u8 {
        for column in 0..3u8 {
            rgba.extend_from_slice(&[column, row, 9, 0xff]);
        }
    }
    Still {
        width: 3,
        height: 2,
        rgba,
    }
}

#[test]
fn bgra_rows_become_opaque_rgba() {
    let bytes = [10, 20, 30, 0, 40, 50, 60, 7];
    let still = still_from_bgra_rows(&bytes, 2, 1, 8).expect("a still");
    assert_eq!(still.rgba, vec![30, 20, 10, 0xff, 60, 50, 40, 0xff]);
}

#[test]
fn padding_at_the_end_of_each_row_is_skipped() {
    let bytes = [1, 2, 3, 4, 0xee, 0xee, 5, 6, 7, 8, 0xee, 0xee];
    let still = still_from_bgra_rows(&bytes, 1, 2, 6).expect("a still");
    assert_eq!(still.rgba, vec![3, 2, 1, 0xff, 7, 6, 5, 0xff]);
}

#[test]
fn rows_too_short_for_the_size_are_refused() {
    assert_eq!(still_from_bgra_rows(&[0; 7], 2, 1, 8), None);
    assert_eq!(still_from_bgra_rows(&[0; 16], 2, 2, 4), None);
}

#[test]
fn a_crop_keeps_only_the_pixels_inside_the_box() {
    let crop = numbered_still()
        .crop(CropBox {
            left: 1,
            top: 1,
            width: 2,
            height: 1,
        })
        .expect("a crop");
    assert_eq!((crop.width, crop.height), (2, 1));
    assert_eq!(crop.rgba, vec![1, 1, 9, 0xff, 2, 1, 9, 0xff]);
}

#[test]
fn a_crop_of_the_whole_still_is_the_still() {
    let still = numbered_still();
    let whole = CropBox {
        left: 0,
        top: 0,
        width: 3,
        height: 2,
    };
    assert_eq!(still.crop(whole), Some(still));
}

#[test]
fn an_empty_box_or_one_reaching_outside_gives_no_crop() {
    let still = numbered_still();
    let boxes = [
        (0, 0, 0, 1),
        (0, 0, 1, 0),
        (2, 0, 2, 1),
        (0, 1, 1, 2),
        (u32::MAX, 0, 2, 1),
    ];
    for (left, top, width, height) in boxes {
        let crop = CropBox {
            left,
            top,
            width,
            height,
        };
        assert_eq!(still.crop(crop), None, "{crop:?}");
    }
}
