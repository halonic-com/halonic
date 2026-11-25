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

fn checked(executable: &Path) -> Result<&str, LoginItemError> {
    let text = executable.to_str().ok_or(LoginItemError::UnsafePath)?;
    if !executable.is_absolute() || text.chars().any(unsafe_character) {
        return Err(LoginItemError::UnsafePath);
    }
    Ok(text)
}

/// Windows: the `Run` value's data, the path in double quotes, so a path with
/// spaces (`…\Acme Tools\Halonic.exe`) can't be read as a shorter program.
pub fn run_value(executable: &Path) -> Result<String, LoginItemError> {
    Ok(format!(
        "\"{}\" {BACKGROUND_ARGUMENT}",
        checked(executable)?
    ))
}

/// Linux: the XDG autostart file. `Exec`'s path is quoted as the Desktop
/// Entry spec says: `"`, `` ` ``, `$` and `\` take a backslash inside the
/// quotes, then every backslash is doubled because `Exec` is a string value,
/// and `%` is doubled because it starts a field code.
pub fn desktop_entry(executable: &Path) -> Result<String, LoginItemError> {
    let mut quoted = String::new();
    for character in checked(executable)?.chars() {
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
    let path = xml_text(checked(executable)?);
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
