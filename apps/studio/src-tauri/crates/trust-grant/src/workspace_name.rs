use crate::refusal::TrustRefusal;

/// The longest folder name any common file system keeps, in bytes.
const MAX_NAME_BYTES: usize = 255;

/// Characters Windows doesn't allow in a name. Refused on every platform,
/// so a workspace made on Linux can still be checked out on Windows.
const WINDOWS_FORBIDDEN: &str = "<>:\"|?*";

/// Names Windows keeps for devices, with or without an extension.
const WINDOWS_DEVICES: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// The name a new workspace folder gets, trimmed, or a `name_invalid`
/// refusal whose `reason` is one of `empty`, `dots`, `separator`,
/// `too_long`, `forbidden_character`, `trailing_dot_or_space` or
/// `reserved_name`.
///
/// The rules are the same on every platform: the name must be one plain
/// folder name that works on Linux, macOS and Windows alike.
pub fn check_workspace_name(name: &str) -> Result<String, TrustRefusal> {
    let name = name.trim();
    let refuse = |reason, message: &str| {
        Err(TrustRefusal::because(
            "name_invalid",
            reason,
            format!("{name:?} {message}"),
        ))
    };
    if name.is_empty() {
        return refuse("empty", "is empty");
    }
    if name == "." || name == ".." {
        return refuse("dots", "isn't a folder name");
    }
    if name.contains(['/', '\\', '\0']) {
        return refuse("separator", "holds a path separator or a NUL");
    }
    if name.len() > MAX_NAME_BYTES {
        return refuse("too_long", "is longer than 255 bytes");
    }
    if name.contains(|c: char| WINDOWS_FORBIDDEN.contains(c) || c.is_control()) {
        return refuse("forbidden_character", "holds a character Windows refuses");
    }
    if name.ends_with(['.', ' ']) {
        return refuse("trailing_dot_or_space", "ends in a dot or a space");
    }
    // `CON.txt` is the device too, and so is `con`; trailing spaces before
    // the extension count (`CON .txt`).
    let stem = name.split('.').next().unwrap_or(name).trim_end();
    if WINDOWS_DEVICES
        .iter()
        .any(|device| stem.eq_ignore_ascii_case(device))
    {
        return refuse("reserved_name", "is a name Windows keeps for a device");
    }
    Ok(name.to_owned())
}
