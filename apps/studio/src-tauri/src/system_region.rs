//! The `system_region` command (HAL-9452, HAL-9385 B17): the region and
//! language the computer is set to, as a BCP 47 tag like `de-CH`, so the
//! Formats settings follow the system on desktop as they follow the
//! browser when served. It takes nothing from the page and reads only the
//! operating system's locale; it is `null` when the system names none.

/// The system's locale as a BCP 47 tag, or `None` when it has none or the
/// one it has is not a tag.
fn region_tag(locale: Option<String>) -> Option<String> {
    let locale = locale?;
    // `C` and `POSIX` are Linux's "no locale"; they are not a region.
    let tag = locale.split(['.', '@']).next()?.replace('_', "-");
    let valid = !tag.is_empty()
        && tag.split('-').all(|part| {
            (1..=8).contains(&part.len()) && part.chars().all(|c| c.is_ascii_alphanumeric())
        });
    (valid && !matches!(tag.as_str(), "C" | "POSIX")).then_some(tag)
}

/// The region and language the computer is set to, or `null`.
#[tauri::command]
pub fn system_region() -> Option<String> {
    region_tag(sys_locale::get_locale())
}

#[cfg(test)]
mod tests {
    use super::region_tag;

    fn tag(locale: &str) -> Option<String> {
        region_tag(Some(locale.to_owned()))
    }

    #[test]
    fn a_bcp_47_tag_is_kept() {
        assert_eq!(tag("de-CH").as_deref(), Some("de-CH"));
    }

    #[test]
    fn a_posix_locale_becomes_a_tag() {
        assert_eq!(tag("en_GB.UTF-8").as_deref(), Some("en-GB"));
        assert_eq!(tag("sr_RS@latin").as_deref(), Some("sr-RS"));
    }

    #[test]
    fn no_locale_is_none() {
        assert_eq!(region_tag(None), None);
        assert_eq!(tag("C"), None);
        assert_eq!(tag("POSIX"), None);
        assert_eq!(tag(""), None);
    }

    #[test]
    fn something_that_is_not_a_tag_is_none() {
        assert_eq!(tag("not a locale"), None);
        assert_eq!(tag("../etc"), None);
    }
}
