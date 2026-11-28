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
//!
//! Quick ask (`--app ask`, HAL-18787) is a focused app too, but its window
//! is the box `quick_ask` shows over other apps: no Start menu shortcut,
//! taskbar entry or icon of its own.

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
    Ask,
}

impl FocusedApp {
    /// Every focused app with a Start menu shortcut, as the installer adds
    /// them. Quick ask has none: its keys open it. Only the tests read it,
    /// since `--app` parsing goes through `STARTED`.
    #[cfg(test)]
    pub const ALL: [FocusedApp; 2] = [FocusedApp::Inbox, FocusedApp::Messenger];

    /// Every focused app `--app` can name.
    const STARTED: [FocusedApp; 3] = [FocusedApp::Inbox, FocusedApp::Messenger, FocusedApp::Ask];

    /// Its name after `--app`, which is also its window's label.
    pub fn name(self) -> &'static str {
        match self {
            FocusedApp::Inbox => "inbox",
            FocusedApp::Messenger => "messenger",
            FocusedApp::Ask => "ask",
        }
    }

    /// Its window's title until the page sets one, as its shortcut is named.
    pub fn title(self) -> &'static str {
        match self {
            FocusedApp::Inbox => "Halonic Inbox",
            FocusedApp::Messenger => "Halonic Messenger",
            // Read by screen readers only: the box has no title bar.
            FocusedApp::Ask => "Ask an agent",
        }
    }

    /// Its window's icon, 64 by 64 raw RGBA like the tray's (so it stays
    /// sharp on the taskbar at 125–200% scaling): the halo with the app's
    /// glyph, from the same drawing as its shortcut's icon
    /// (`icons/apps/<name>.ico`). `None` for quick ask, which has no
    /// taskbar entry.
    pub fn icon(self) -> Option<Image<'static>> {
        self.icon_bytes().map(|bytes| Image::new(bytes, 64, 64))
    }

    fn icon_bytes(self) -> Option<&'static [u8]> {
        match self {
            FocusedApp::Inbox => Some(include_bytes!("../icons/apps/inbox.rgba")),
            FocusedApp::Messenger => Some(include_bytes!("../icons/apps/messenger.rgba")),
            FocusedApp::Ask => None,
        }
    }

    /// The .ico its Start menu shortcut carries (`icons/apps/<name>.ico`).
    /// On Windows its window takes its small and large icons from it, at the
    /// sizes the window's display asks for (HAL-19716), instead of shrinking
    /// the 64 px one. `None` for quick ask.
    #[cfg(any(windows, test))]
    pub fn ico(self) -> Option<&'static [u8]> {
        match self {
            FocusedApp::Inbox => Some(include_bytes!("../icons/apps/inbox.ico")),
            FocusedApp::Messenger => Some(include_bytes!("../icons/apps/messenger.ico")),
            FocusedApp::Ask => None,
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
        FocusedApp::STARTED
            .into_iter()
            .find(|app| app.name() == name)
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
/// forward when it is already open. Quick ask's box shows on the screen
/// the pointer is on.
pub fn show<R: Runtime>(handle: &AppHandle<R>, app: Option<FocusedApp>) -> tauri::Result<()> {
    if app == Some(FocusedApp::Ask) {
        return crate::quick_ask::show_box(handle);
    }
    // On Windows the Inbox and the Messenger open in their own frames.
    #[cfg(windows)]
    if let Some(app) = app
        && let Some(shown) = crate::app_frames::show(handle, app)
    {
        return shown;
    }
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
/// `shell`, so the tests' apps don't claim the one instance. The start runs
/// from the event loop, after setup (`starts_after_setup.rs`).
pub fn single_instance<R: Runtime>(builder: Builder<R>) -> Builder<R> {
    builder.plugin(tauri_plugin_single_instance::init(
        |app, arguments, _folder| crate::starts_after_setup::started_again(app, arguments),
    ))
}

/// What the running Halonic does when it is started again with `arguments`.
/// A window that can't open leaves the others as they are. A start at login
/// opens nothing: Halonic runs already (`background_start.rs`).
pub fn started_again<R: Runtime>(handle: &AppHandle<R>, arguments: &[String]) {
    if crate::background_start::requested(arguments) {
        return;
    }
    // A frame that started Halonic again hands over its window.
    #[cfg(windows)]
    crate::app_frames::hand_over(arguments);
    // The first window after a start at login reopens the windows open at
    // the last quit with it (`open_windows_track`).
    if let Err(error) = crate::open_windows_track::open(handle, requested(arguments)) {
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

/// Shows `window`, restored if it was minimised, with the keyboard focus:
/// on Windows through its frame, when it sits in one.
#[cfg(windows)]
fn bring_forward<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<()> {
    crate::app_frames::bring_forward(window)
}

/// Shows `window`, restored if it was minimised, with the keyboard focus.
#[cfg(not(windows))]
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

    /// `studio.src-tauri.quick-ask-window`: `--app ask` opens the box,
    /// which the installer gives no shortcut of its own.
    #[test]
    fn requested_reads_quick_ask_which_has_no_start_menu_shortcut() {
        assert_eq!(
            requested(&["halonic-studio", "--app", "ask"]),
            Some(FocusedApp::Ask)
        );
        assert_eq!(
            requested(&["halonic-studio", "--app=ask"]),
            Some(FocusedApp::Ask)
        );
        assert_eq!(requested(&["halonic-studio", "--app=Ask"]), None);
        assert!(!FocusedApp::ALL.contains(&FocusedApp::Ask));
        assert!(FocusedApp::Ask.icon().is_none());
        assert!(FocusedApp::Ask.ico().is_none());
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
            let bytes = app
                .icon_bytes()
                .expect("an app with a shortcut has an icon");
            assert_eq!(bytes.len(), 64 * 64 * 4, "{}", app.name());
            let icon = app.icon().expect("its icon");
            assert_eq!((icon.width(), icon.height()), (64, 64));
        }
        assert_ne!(
            FocusedApp::Inbox.icon_bytes(),
            FocusedApp::Messenger.icon_bytes()
        );
    }

    /// HAL-19716: a window's icons come from its app's .ico, at each size
    /// Windows asks for at 100 to 200% display scaling (small 16 to 32 px,
    /// large 32 to 64 px), so the taskbar never takes Halonic's exe icon.
    #[test]
    fn each_app_has_an_ico_image_for_every_window_icon_size() {
        for app in FocusedApp::ALL {
            let ico = app.ico().expect("an app with a shortcut has an .ico");
            for pixels in [16, 20, 24, 30, 32, 36, 40, 48, 64] {
                let image = halonic_window_app_id::image_for(ico, pixels)
                    .unwrap_or_else(|| panic!("{}'s .ico at {pixels} px", app.name()));
                assert_eq!(&image[..4], b"\x89PNG", "{} at {pixels} px", app.name());
            }
        }
        assert_ne!(FocusedApp::Inbox.ico(), FocusedApp::Messenger.ico());
    }

    /// `studio.src-tauri.app-frames`: each frame carries the shell's
    /// identifier, the name and title of its app, and so its taskbar ID.
    #[test]
    fn each_frame_matches_its_focused_app() {
        use halonic_app_frame::FrameApp;
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).expect("tauri.conf.json");
        assert_eq!(config["identifier"], halonic_app_frame::IDENTIFIER);
        for (app, frame) in [
            (FocusedApp::Inbox, FrameApp::Inbox),
            (FocusedApp::Messenger, FrameApp::Messenger),
        ] {
            assert_eq!(frame.name(), app.name());
            assert_eq!(frame.title(), app.title());
            assert_eq!(
                frame.app_user_model_id(),
                app.app_user_model_id(halonic_app_frame::IDENTIFIER)
            );
            assert_eq!(Some(frame.ico()), app.ico());
        }
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
