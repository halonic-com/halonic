//! Picks one image out of an .ico file, as Windows would for an icon of a
//! given size (HAL-19716). Windows' own lookup (`LookupIconIdFromDirectoryEx`)
//! reads an icon *resource* directory, whose entries hold an ID; an .ico
//! *file*, as the shell embeds it, holds offsets instead, so it is read here.
//! Plain Rust, so it is tested on every platform.

/// One image of an .ico: its width and height, and its bytes (a PNG or a
/// bitmap, as `CreateIconFromResourceEx` takes either).
struct Entry<'a> {
    pixels: u32,
    bytes: &'a [u8],
}

/// The image in `ico` to draw an icon of `pixels` by `pixels` from: the one
/// of exactly that size, else the smallest bigger one (Windows shrinks it
/// sharper than it grows a smaller one), else the biggest. `None` for bytes
/// that aren't an .ico with at least one whole image.
pub fn image_for(ico: &[u8], pixels: u32) -> Option<&[u8]> {
    let entries = entries(ico)?;
    let best = entries
        .iter()
        .filter(|entry| entry.pixels >= pixels)
        .min_by_key(|entry| entry.pixels)
        .or_else(|| entries.iter().max_by_key(|entry| entry.pixels))?;
    Some(best.bytes)
}

/// Every image in `ico`, or `None` when the header, an entry or an image
/// runs past the end of the bytes.
fn entries(ico: &[u8]) -> Option<Vec<Entry<'_>>> {
    let reserved = u16_at(ico, 0)?;
    let kind = u16_at(ico, 2)?;
    // 1 is an icon; 2 would be a cursor.
    if reserved != 0 || kind != 1 {
        return None;
    }
    let count = usize::from(u16_at(ico, 4)?);
    let entries = (0..count)
        .map(|index| {
            let at = 6 + 16 * index;
            // A width of 0 means 256.
            let pixels = match *ico.get(at)? {
                0 => 256,
                width => u32::from(width),
            };
            let size = usize::try_from(u32_at(ico, at + 8)?).ok()?;
            let offset = usize::try_from(u32_at(ico, at + 12)?).ok()?;
            let bytes = ico.get(offset..offset.checked_add(size)?)?;
            Some(Entry { pixels, bytes })
        })
        .collect::<Option<Vec<_>>>()?;
    (!entries.is_empty()).then_some(entries)
}

fn u16_at(bytes: &[u8], at: usize) -> Option<u16> {
    Some(u16::from_le_bytes(bytes.get(at..at + 2)?.try_into().ok()?))
}

fn u32_at(bytes: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_le_bytes(bytes.get(at..at + 4)?.try_into().ok()?))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// An .ico of one image for each of `sizes`, each image's bytes being its
    /// size repeated, so a test can tell which one was picked.
    fn ico_of(sizes: &[u32]) -> Vec<u8> {
        let count = u16::try_from(sizes.len()).expect("a few sizes");
        let mut header = vec![0, 0, 1, 0];
        header.extend(count.to_le_bytes());
        let mut images = Vec::new();
        let mut offset = 6 + 16 * sizes.len();
        for &pixels in sizes {
            let image = vec![u8::try_from(pixels % 256).expect("a byte"); 4];
            let width = u8::try_from(pixels % 256).expect("a byte");
            header.extend([width, width, 0, 0, 1, 0, 32, 0]);
            header.extend(u32::try_from(image.len()).expect("small").to_le_bytes());
            header.extend(u32::try_from(offset).expect("small").to_le_bytes());
            offset += image.len();
            images.extend(image);
        }
        header.extend(images);
        header
    }

    #[test]
    fn picks_the_image_of_the_exact_size() {
        let ico = ico_of(&[16, 24, 32, 48]);
        assert_eq!(image_for(&ico, 24), Some(&[24; 4][..]));
    }

    #[test]
    fn picks_the_next_bigger_image_when_the_size_is_missing() {
        // 125%: Windows asks for a 40 px large icon; the .ico has 32 and 48.
        let ico = ico_of(&[16, 32, 48, 256]);
        assert_eq!(image_for(&ico, 40), Some(&[48; 4][..]));
    }

    #[test]
    fn picks_the_biggest_image_when_none_is_big_enough() {
        let ico = ico_of(&[16, 32]);
        assert_eq!(image_for(&ico, 64), Some(&[32; 4][..]));
    }

    #[test]
    fn reads_a_width_of_0_as_256() {
        let ico = ico_of(&[256, 16]);
        assert_eq!(image_for(&ico, 100), Some(&[0; 4][..]));
    }

    #[test]
    fn finds_nothing_in_bytes_that_are_not_a_whole_ico() {
        let ico = ico_of(&[16]);
        assert_eq!(image_for(&[], 16), None);
        assert_eq!(image_for(&ico_of(&[]), 16), None);
        assert_eq!(image_for(&ico[..ico.len() - 1], 16), None);
        let mut cursor = ico.clone();
        cursor[2] = 2;
        assert_eq!(image_for(&cursor, 16), None);
        let mut past_the_end = ico;
        past_the_end[6 + 12] = 0xff;
        assert_eq!(image_for(&past_the_end, 16), None);
    }
}
