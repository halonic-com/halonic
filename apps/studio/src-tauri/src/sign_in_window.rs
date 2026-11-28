//! The `open_sign_in` command (HAL-20515): the page asks for a sign-in page,
//! and where the default browser is Chromium the shell opens it as a small
//! app window of that browser, centred on the calling window
//! (`halonic-sign-in-window`). The window is always the command's own, never
//! one the page names. It answers `opened`, or `fallback` when the browser
//! isn't Chromium, can't be found or didn't start, and then the page opens
//! the address as every other link. An address that isn't `https`, or plain
//! `http` to this computer, or isn't on exactly the `origin` the page names
//! for the service it signs in to, is refused as `invalid`. Studio's main window is
//! granted it (capabilities/desktop-sign-in-window.json).

use halonic_sign_in_window::{Rect, popup_rect, sign_in_url};
use tauri::{Runtime, WebviewWindow};

const LOG: &str = "sign-in-window";

/// Opens `url`, which must be on `origin`, as a sign-in window over the
/// calling window.
#[tauri::command]
pub async fn open_sign_in<R: Runtime>(
    window: WebviewWindow<R>,
    url: String,
    origin: String,
) -> Result<&'static str, &'static str> {
    let url = sign_in_url(&url, &origin).ok_or("invalid")?;
    let Some((rect, scale_factor)) = sign_in_rect(&window) else {
        return Ok("fallback");
    };
    // Reading the registry and starting the browser wait on the system, so
    // they run off the async runtime's threads.
    let launched = tauri::async_runtime::spawn_blocking(move || {
        halonic_sign_in_window::launch(&url, rect, scale_factor)
    })
    .await;
    match launched {
        Ok(Ok(Some(launch))) => {
            // The search for the new window waits up to three seconds; the
            // page doesn't wait for it.
            tauri::async_runtime::spawn_blocking(move || {
                halonic_shell_log::record(LOG, launch.place().to_string());
            });
            Ok("opened")
        }
        Ok(Ok(None)) => Ok("fallback"),
        Ok(Err(error)) => {
            halonic_shell_log::record(LOG, format!("opening the sign-in window: {error}"));
            Ok("fallback")
        }
        Err(error) => {
            halonic_shell_log::record(LOG, format!("the sign-in window's start stopped: {error}"));
            Ok("fallback")
        }
    }
}

/// Where the sign-in window goes over `window`, in physical pixels, and its
/// monitor's scale factor, or `None`, logged, when the window's place or its
/// monitor can't be read.
fn sign_in_rect<R: Runtime>(window: &WebviewWindow<R>) -> Option<(Rect, f64)> {
    let placed = window
        .outer_position()
        .and_then(|position| Ok((position, window.outer_size()?)))
        .and_then(|placed| Ok((placed, window.current_monitor()?)));
    match placed {
        Ok(((position, size), Some(monitor))) => {
            let area = monitor.work_area();
            let owner = Rect {
                x: position.x,
                y: position.y,
                width: size.width,
                height: size.height,
            };
            let work_area = Rect {
                x: area.position.x,
                y: area.position.y,
                width: area.size.width,
                height: area.size.height,
            };
            Some((popup_rect(owner, work_area), monitor.scale_factor()))
        }
        Ok((_, None)) => {
            halonic_shell_log::record(
                LOG,
                format!("{}: no monitor to place it on", window.label()),
            );
            None
        }
        Err(error) => {
            halonic_shell_log::record(LOG, format!("{}: its place: {error}", window.label()));
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PAPERCLIP: &str = "https://paperclip.acme.test";

    fn app_window() -> WebviewWindow<tauri::test::MockRuntime> {
        let app = crate::shell(tauri::test::mock_builder())
            .build(tauri::generate_context!())
            .expect("the shell builds on the mock runtime");
        crate::window::open(&app).expect("the app window opens")
    }

    #[test]
    fn an_address_that_may_not_open_is_refused() {
        let window = app_window();
        for url in [
            "http://paperclip.acme.test/",
            "file:///C:/x.exe",
            "--app=x",
            "",
            "https://other.acme.test/cli-auth/challenge-1",
        ] {
            let answer = tauri::async_runtime::block_on(open_sign_in(
                window.clone(),
                url.to_owned(),
                PAPERCLIP.to_owned(),
            ));
            assert_eq!(answer, Err("invalid"), "{url:?}");
        }
    }

    #[cfg(not(windows))]
    #[test]
    fn off_windows_the_page_opens_it_as_before() {
        let answer = tauri::async_runtime::block_on(open_sign_in(
            app_window(),
            "https://paperclip.acme.test/cli-auth/challenge-1".to_owned(),
            PAPERCLIP.to_owned(),
        ));
        assert_eq!(answer, Ok("fallback"));
    }

    #[test]
    fn granted_to_the_main_window_only_and_never_served() {
        let capability: serde_json::Value =
            serde_json::from_str(include_str!("../capabilities/desktop-sign-in-window.json"))
                .expect("the capability");
        assert_eq!(capability["local"], true);
        assert_eq!(capability["windows"], serde_json::json!(["main"]));
        assert_eq!(
            capability["permissions"],
            serde_json::json!(["allow-open-sign-in"])
        );
    }
}
