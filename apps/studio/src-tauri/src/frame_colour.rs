//! The `set_frame_colour` command (HAL-18698): the page tells the shell its
//! frame's colour as `#rrggbb`, and on Windows the window's title bar takes
//! it, so the bar and the frame are one colour. It colours only the window
//! of the page that calls it, and takes nothing else from the page. Anything
//! but `#rrggbb` is refused as `invalid`. A bar Windows can't colour, such as
//! Windows 10's, keeps the system colour; that is refused as `failed`, with
//! Windows' answer in the shell's log. Elsewhere the command does nothing:
//! macOS and Linux draw their own title bars. Studio's and the focused apps'
//! windows are granted it (capabilities/desktop-frame-colour.json).

use tauri::{Runtime, WebviewWindow};

/// Colours the calling window's title bar `colour`, a `#rrggbb`.
#[tauri::command]
pub fn set_frame_colour<R: Runtime>(
    window: WebviewWindow<R>,
    colour: String,
) -> Result<(), &'static str> {
    let caption = halonic_window_caption::parse_hex(&colour).ok_or("invalid")?;
    colour_title_bar(&window, caption)
}

#[cfg(windows)]
fn colour_title_bar<R: Runtime>(
    window: &WebviewWindow<R>,
    caption: halonic_window_caption::Rgb,
) -> Result<(), &'static str> {
    let coloured = window
        .hwnd()
        .map_err(|error| format!("the window's handle: {error}"))
        .and_then(|handle| halonic_window_caption::set(handle.0, caption));
    coloured.map_err(|error| {
        halonic_shell_log::record("window", format!("{}: {error}", window.label()));
        "failed"
    })
}

#[cfg(not(windows))]
fn colour_title_bar<R: Runtime>(
    _window: &WebviewWindow<R>,
    _caption: halonic_window_caption::Rgb,
) -> Result<(), &'static str> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn app_window() -> WebviewWindow<tauri::test::MockRuntime> {
        let app = crate::shell(tauri::test::mock_builder())
            .build(tauri::generate_context!())
            .expect("the shell builds on the mock runtime");
        crate::window::open(&app).expect("the app window opens")
    }

    #[test]
    fn anything_but_six_hex_digits_is_refused() {
        let window = app_window();
        for colour in ["", "#fff", "f4f7fa", "rgb(244 247 250)", "#f4f7fa;", "red"] {
            assert_eq!(
                set_frame_colour(window.clone(), colour.to_owned()),
                Err("invalid"),
                "{colour:?}"
            );
        }
    }

    #[cfg(not(windows))]
    #[test]
    fn a_colour_off_windows_changes_nothing() {
        assert_eq!(set_frame_colour(app_window(), "#f4f7fa".to_owned()), Ok(()));
    }

    #[test]
    fn granted_to_the_app_windows_only_and_never_served() {
        let capability: serde_json::Value =
            serde_json::from_str(include_str!("../capabilities/desktop-frame-colour.json"))
                .expect("the capability");
        assert_eq!(capability["local"], true);
        assert!(capability.get("remote").is_none());
        assert_eq!(
            capability["windows"],
            serde_json::json!(["main", "inbox", "messenger"])
        );
        assert_eq!(
            capability["permissions"],
            serde_json::json!(["allow-set-frame-colour"])
        );
    }
}
