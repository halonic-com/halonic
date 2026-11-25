//! Halonic Inbox and Halonic Messenger as their own apps (HAL-17903, board
//! direction HAL-17358): the same install and exe, started with
//! `--app inbox` or `--app messenger` (the Start menu's shortcuts,
//! windows/installer.nsi). Halonic runs once: a second start hands its
//! arguments to the running Halonic (tauri-plugin-single-instance), which
//! opens that app's window or brings it forward. So every window shares one
//! connection, engine lock and cache.
//!
//! A focused app's window loads the same page as Studio's, under its own
//! label; the page tells which app it is from that label. Each has its own
//! title and, on Windows, its own taskbar entry: its AppUserModelID is the
//! one its Start menu shortcut carries, and its own icon: the halo with the
//! app's glyph (HAL-18693), drawn by icons/draw-app-icons.mjs.

use tauri::image::Image;
use tauri::{AppHandle, Builder, Manager, Runtime, WebviewWindow};

/// The argument that names the app to open.
const APP_ARGUMENT: &str = "--app";

/// The label of Studio's own window, which tauri.conf.json leaves unnamed.
pub const STUDIO_WINDOW: &str = "main";

/// An app the shell opens in its own window.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FocusedApp {
    Inbox,
    Messenger,
}

impl FocusedApp {
    /// Every focused app, as the installer adds their shortcuts.
    pub const ALL: [FocusedApp; 2] = [FocusedApp::Inbox, FocusedApp::Messenger];

    /// Its name after `--app`, which is also its window's label.
    pub fn name(self) -> &'static str {
        match self {
            FocusedApp::Inbox => "inbox",
            FocusedApp::Messenger => "messenger",
        }
    }

    /// Its window's title until the page sets one, as its shortcut is named.
    pub fn title(self) -> &'static str {
        match self {
            FocusedApp::Inbox => "Halonic Inbox",
            FocusedApp::Messenger => "Halonic Messenger",
        }
    }

    /// Its window's icon, 64 by 64 raw RGBA like the tray's (so it stays
    /// sharp on the taskbar at 125–200% scaling): the halo with the app's
    /// glyph, from the same drawing as its shortcut's icon
    /// (`icons/apps/<name>.ico`).
    pub fn icon(self) -> Image<'static> {
        Image::new(self.icon_bytes(), 64, 64)
    }

    fn icon_bytes(self) -> &'static [u8] {
        match self {
            FocusedApp::Inbox => include_bytes!("../icons/apps/inbox.rgba"),
            FocusedApp::Messenger => include_bytes!("../icons/apps/messenger.rgba"),
        }
    }

    /// Its AppUserModelID: the app's identifier and its name, as the
    /// installer sets it on its shortcut (`${BUNDLEID}.inbox`). Only Windows
    /// has one.
    #[cfg_attr(not(any(windows, test)), expect(dead_code))]
    pub fn app_user_model_id(self, identifier: &str) -> String {
        format!("{identifier}.{}", self.name())
    }

    fn named(name: &str) -> Option<FocusedApp> {
        FocusedApp::ALL.into_iter().find(|app| app.name() == name)
    }
}

/// The app a start's `arguments` ask for, or `None` for Studio: no `--app`,
/// or one naming no app this version has. Both `--app inbox` and
/// `--app=inbox` count.
pub fn requested<S: AsRef<str>>(arguments: &[S]) -> Option<FocusedApp> {
    let mut arguments = arguments.iter().map(AsRef::as_ref);
    while let Some(argument) = arguments.next() {
        if argument == APP_ARGUMENT {
            return arguments.next().and_then(FocusedApp::named);
        }
        if let Some(name) = argument
            .strip_prefix(APP_ARGUMENT)
            .and_then(|rest| rest.strip_prefix('='))
        {
            return FocusedApp::named(name);
        }
    }
    None
}

/// Every window the shell opens, by label: Studio's first, then each app's.
pub fn window_labels() -> [&'static str; 3] {
    [
        STUDIO_WINDOW,
        FocusedApp::Inbox.name(),
        FocusedApp::Messenger.name(),
    ]
}

/// The first of `labels` whose window is open, or `None` when none is.
pub fn first_open<R: Runtime>(handle: &AppHandle<R>, labels: &[&str]) -> Option<WebviewWindow<R>> {
    labels
        .iter()
        .find_map(|label| handle.get_webview_window(label))
}

/// Opens the window `app` asks for (Studio's for `None`), or brings it
/// forward when it is already open.
pub fn show<R: Runtime>(handle: &AppHandle<R>, app: Option<FocusedApp>) -> tauri::Result<()> {
    let label = app.map_or(STUDIO_WINDOW, FocusedApp::name);
    if let Some(window) = handle.get_webview_window(label) {
        return bring_forward(&window);
    }
    match app {
        None => crate::window::open(handle).map(|_| ()),
        Some(app) => crate::window::open_focused(handle, app).map(|_| ()),
    }
}

/// Halonic runs once (HAL-17903): a second start, such as the Start menu's
/// Halonic Inbox, hands its arguments to the running Halonic and quits.
/// Registered first, so the second start sets nothing else up. Not in
/// `shell`, so the tests' apps don't claim the one instance.
pub fn single_instance<R: Runtime>(builder: Builder<R>) -> Builder<R> {
    builder.plugin(tauri_plugin_single_instance::init(
        |app, arguments, _folder| started_again(app, &arguments),
    ))
}

/// What the running Halonic does when it is started again with `arguments`.
/// A window that can't open leaves the others as they are. A start at login
/// opens nothing: Halonic runs already (`background_start.rs`).
pub fn started_again<R: Runtime>(handle: &AppHandle<R>, arguments: &[String]) {
    if crate::background_start::requested(arguments) {
        return;
    }
    if let Err(error) = show(handle, requested(arguments)) {
        halonic_shell_log::record("window", format!("a window didn't open: {error}"));
    }
}

/// The `show_main_window` command (HAL-18188): a focused app's window with
/// no workspace to open has an "Open Halonic" button, which brings Studio's
/// window forward, or opens it when it was closed, so a workspace can be
/// chosen there. It takes nothing from the page and only ever shows Studio's
/// window. Only the focused apps' windows are granted it
/// (capabilities/desktop-show-main-window.json). A window that can't show
/// is refused as `failed`, with the reason in the shell's log.
#[tauri::command]
pub async fn show_main_window<R: Runtime>(app: AppHandle<R>) -> Result<(), &'static str> {
    show(&app, None).map_err(|error| {
        halonic_shell_log::record("window", format!("Studio's window didn't show: {error}"));
        "failed"
    })
}

/// Shows `window`, restored if it was minimised, with the keyboard focus.
fn bring_forward<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<()> {
    window.unminimize()?;
    window.show()?;
    window.set_focus()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn requested_reads_the_app_after_its_argument() {
        assert_eq!(
            requested(&["Halonic.exe", "--app", "inbox"]),
            Some(FocusedApp::Inbox)
        );
        assert_eq!(
            requested(&["Halonic.exe", "--app=messenger"]),
            Some(FocusedApp::Messenger)
        );
    }

    #[test]
    fn requested_is_studio_without_a_known_app() {
        assert_eq!(requested(&["Halonic.exe"]), None);
        assert_eq!(requested(&["Halonic.exe", "--app"]), None);
        assert_eq!(requested(&["Halonic.exe", "--app", "runs"]), None);
        assert_eq!(requested(&["Halonic.exe", "--app=Inbox"]), None);
        assert_eq!(requested(&["Halonic.exe", "inbox"]), None);
    }

    #[test]
    fn each_app_is_titled_as_its_shortcut() {
        assert_eq!(FocusedApp::Inbox.title(), "Halonic Inbox");
        assert_eq!(FocusedApp::Messenger.title(), "Halonic Messenger");
    }

    #[test]
    fn each_app_has_its_own_64_by_64_icon() {
        for app in FocusedApp::ALL {
            assert_eq!(app.icon_bytes().len(), 64 * 64 * 4, "{}", app.name());
            assert_eq!((app.icon().width(), app.icon().height()), (64, 64));
        }
        assert_ne!(
            FocusedApp::Inbox.icon_bytes(),
            FocusedApp::Messenger.icon_bytes()
        );
    }

    #[test]
    fn app_user_model_id_adds_the_name_to_the_identifier() {
        assert_eq!(
            FocusedApp::Messenger.app_user_model_id("com.halonic.studio"),
            "com.halonic.studio.messenger"
        );
    }

    #[test]
    fn show_opens_each_window_once() {
        let app = crate::shell(tauri::test::mock_builder())
            .build(tauri::generate_context!())
            .expect("the shell builds on the mock runtime");
        show(app.handle(), Some(FocusedApp::Inbox)).expect("the Inbox opens");
        show(app.handle(), Some(FocusedApp::Inbox)).expect("the Inbox comes forward");
        show(app.handle(), None).expect("Studio opens");
        let mut labels: Vec<String> = app.webview_windows().into_keys().collect();
        labels.sort();
        assert_eq!(labels, ["inbox", "main"]);
    }

    #[test]
    fn show_main_window_opens_studio_beside_a_focused_app() {
        let app = crate::shell(tauri::test::mock_builder())
            .build(tauri::generate_context!())
            .expect("the shell builds on the mock runtime");
        show(app.handle(), Some(FocusedApp::Messenger)).expect("the Messenger opens");
        tauri::async_runtime::block_on(show_main_window(app.handle().clone()))
            .expect("Studio opens");
        tauri::async_runtime::block_on(show_main_window(app.handle().clone()))
            .expect("Studio comes forward");
        let mut labels: Vec<String> = app.webview_windows().into_keys().collect();
        labels.sort();
        assert_eq!(labels, ["main", "messenger"]);
    }

    #[test]
    fn show_main_window_is_granted_to_the_focused_apps_only_and_never_served() {
        let capability: serde_json::Value = serde_json::from_str(include_str!(
            "../capabilities/desktop-show-main-window.json"
        ))
        .expect("the capability");
        assert_eq!(capability["local"], true);
        assert_eq!(
            capability["windows"],
            serde_json::json!(["inbox", "messenger"])
        );
        assert!(capability.get("remote").is_none());
        assert_eq!(
            capability["permissions"],
            serde_json::json!(["allow-show-main-window"])
        );
    }
}
