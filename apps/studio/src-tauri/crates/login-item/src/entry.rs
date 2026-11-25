//! What each system's entry holds, built from the executable's path alone,
//! so the tests check every system's text on any computer. The argument is
//! always exactly `--background`: nothing the page sends reaches an entry.

use std::path::Path;

use crate::{BACKGROUND_ARGUMENT, LoginItemError};

/// A path character no entry may hold: a control character (a newline would
/// start a new line in a `.desktop` file or a plist) or, for Windows, a
/// double quote, which would end the quoted path early.
fn unsafe_character(character: char) -> bool {
    character.is_control() || character == '"'
}

/// The path as text, if it is absolute by `absolute` and holds no unsafe
/// character. Each system's entry passes its own rule, read from the text
/// rather than `Path::is_absolute` (which follows the computer the code runs
/// on), so every entry is checked the same way on any computer.
fn checked(executable: &Path, absolute: fn(&str) -> bool) -> Result<&str, LoginItemError> {
    let text = executable.to_str().ok_or(LoginItemError::UnsafePath)?;
    if !absolute(text) || text.chars().any(unsafe_character) {
        return Err(LoginItemError::UnsafePath);
    }
    Ok(text)
}

/// A macOS or Linux absolute path: it starts at the root.
fn unix_absolute(text: &str) -> bool {
    text.starts_with('/')
}

/// A Windows absolute path: a drive (`D:\`) or a UNC share (`\\server\`).
fn windows_absolute(text: &str) -> bool {
    let bytes = text.as_bytes();
    let drive =
        bytes.len() >= 3 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' && bytes[2] == b'\\';
    drive || text.starts_with(r"\\")
}

/// Windows: the `Run` value's data, the path in double quotes, so a path with
/// spaces (`…\Acme Tools\Halonic.exe`) can't be read as a shorter program.
pub fn run_value(executable: &Path) -> Result<String, LoginItemError> {
    Ok(format!(
        "\"{}\" {BACKGROUND_ARGUMENT}",
        checked(executable, windows_absolute)?
    ))
}

/// Linux: the XDG autostart file. `Exec`'s path is quoted as the Desktop
/// Entry spec says: `"`, `` ` ``, `$` and `\` take a backslash inside the
/// quotes, then every backslash is doubled because `Exec` is a string value,
/// and `%` is doubled because it starts a field code.
pub fn desktop_entry(executable: &Path) -> Result<String, LoginItemError> {
    let mut quoted = String::new();
    for character in checked(executable, unix_absolute)?.chars() {
        match character {
            '`' | '$' => quoted.push_str(&format!("\\\\{character}")),
            '\\' => quoted.push_str("\\\\\\\\"),
            '%' => quoted.push_str("%%"),
            other => quoted.push(other),
        }
    }
    Ok(format!(
        "[Desktop Entry]\nType=Application\nName=Halonic\nExec=\"{quoted}\" {BACKGROUND_ARGUMENT}\nTerminal=false\nX-GNOME-Autostart-enabled=true\n"
    ))
}

/// macOS: the LaunchAgent plist, with the path and the argument as separate
/// `ProgramArguments` strings, so no shell reads them, and XML-escaped.
pub fn launch_agent(label: &str, executable: &Path) -> Result<String, LoginItemError> {
    let path = xml_text(checked(executable, unix_absolute)?);
    Ok(format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n\
         <plist version=\"1.0\">\n<dict>\n\
         <key>Label</key><string>{}</string>\n\
         <key>ProgramArguments</key><array><string>{path}</string><string>{BACKGROUND_ARGUMENT}</string></array>\n\
         <key>RunAtLoad</key><true/>\n\
         </dict>\n</plist>\n",
        xml_text(label)
    ))
}

fn xml_text(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('\'', "&apos;")
}

#[cfg(test)]
#[path = "entry_tests.rs"]
mod tests;
