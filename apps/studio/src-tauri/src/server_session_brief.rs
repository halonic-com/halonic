//! The window that asks before Claude Code starts on the user's server
//! (HAL-18014, Liam's review of HAL-17843, item 1). rfd's message box
//! doesn't scroll, so a brief near 8 KB ran off a small screen; this window
//! shows the whole brief in a read-only text box that scrolls.
//!
//! It is a second window with a fixed page the shell writes itself, served
//! from its own scheme to this window only. No capability names the window,
//! so its page can call no command, and the page has no script at all: its
//! content security policy allows none. Start and Cancel are links the
//! shell catches before they load; closing the window answers Cancel.

use std::sync::mpsc::{Receiver, Sender, channel};
use std::sync::{Mutex, PoisonError};

use tauri::http::{Response, StatusCode, header};
use tauri::webview::WebviewWindowBuilder;
use tauri::{AppHandle, Manager, Runtime, Url, Webview, WebviewUrl, WindowEvent};

use halonic_trust_grant::CANCEL_BUTTON;

/// The window's label. No file in `capabilities/` names it.
pub const WINDOW: &str = "server-session-brief";

/// The scheme the page is served from, to [`WINDOW`] only.
pub const SCHEME: &str = "halonic-brief";

/// The page, and the two links the shell catches instead of loading.
const PAGE_URL: &str = "halonic-brief://localhost/";
const START_URL: &str = "halonic-brief://localhost/start";
const CANCEL_URL: &str = "halonic-brief://localhost/cancel";

/// No script, no request out, nothing framed: only the page's own style.
const PAGE_POLICY: &str = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/// The label of the shell's main window, the brief window's parent.
const SHELL_WINDOW: &str = "main";

/// The brief the window shows now, and who waits for the person's answer.
struct OpenBrief {
    id: u64,
    page: String,
    answer: Option<Sender<bool>>,
}

/// The one brief window that may be open at a time.
#[derive(Default)]
pub struct BriefState {
    open: Mutex<Option<OpenBrief>>,
    next_id: Mutex<u64>,
}

impl BriefState {
    /// Holds `page` for the window; `None` while another brief is open.
    fn begin(&self, page: String) -> Option<(u64, Receiver<bool>)> {
        let mut open = self.open.lock().unwrap_or_else(PoisonError::into_inner);
        if open.is_some() {
            return None;
        }
        let mut next_id = self.next_id.lock().unwrap_or_else(PoisonError::into_inner);
        *next_id += 1;
        let (answer, answered) = channel();
        *open = Some(OpenBrief {
            id: *next_id,
            page,
            answer: Some(answer),
        });
        Some((*next_id, answered))
    }

    /// Gives the first answer for brief `id`, or for the open brief when
    /// `id` is `None`; later answers are ignored.
    fn answer(&self, id: Option<u64>, start: bool) {
        let mut open = self.open.lock().unwrap_or_else(PoisonError::into_inner);
        let Some(brief) = open
            .as_mut()
            .filter(|brief| id.is_none_or(|id| brief.id == id))
        else {
            return;
        };
        if let Some(answer) = brief.answer.take() {
            // The receiver is gone only once `ask` has stopped waiting.
            let _ = answer.send(start);
        }
    }

    /// Forgets brief `id`, so its page is served no more.
    fn end(&self, id: u64) {
        let mut open = self.open.lock().unwrap_or_else(PoisonError::into_inner);
        if open.as_ref().is_some_and(|brief| brief.id == id) {
            *open = None;
        }
    }

    fn page(&self) -> Option<String> {
        let open = self.open.lock().unwrap_or_else(PoisonError::into_inner);
        open.as_ref().map(|brief| brief.page.clone())
    }
}

/// Shows `heading`, `intro` and the whole `brief` in the brief window and
/// waits; `true` only when the person presses Start. Closing the window,
/// a window that can't open, or a brief window already open answers no.
pub fn ask<R: Runtime>(app: &AppHandle<R>, heading: &str, intro: &str, brief: &str) -> bool {
    let state = app.state::<BriefState>();
    let Some((id, answered)) = state.begin(page(heading, intro, brief)) else {
        halonic_shell_log::record("server_session", "a brief window is already open");
        return false;
    };
    let start = match open_window(app, id) {
        Ok(()) => answered.recv().unwrap_or(false),
        Err(error) => {
            halonic_shell_log::record("server_session", format!("the brief window: {error}"));
            false
        }
    };
    state.end(id);
    start
}

/// Opens the brief window over the shell's window; closing it answers no.
fn open_window<R: Runtime>(app: &AppHandle<R>, id: u64) -> tauri::Result<()> {
    let page = Url::parse(PAGE_URL).map_err(tauri::Error::InvalidUrl)?;
    let mut builder = WebviewWindowBuilder::new(app, WINDOW, WebviewUrl::CustomProtocol(page))
        .title(crate::server_session::DIALOG_TITLE)
        .inner_size(560.0, 600.0)
        .min_inner_size(400.0, 320.0)
        .center()
        .minimizable(false)
        .focused(true);
    if let Some(shell) = app.get_webview_window(SHELL_WINDOW) {
        builder = builder.parent(&shell)?;
    }
    let window = builder.build()?;
    let shell = app.clone();
    window.on_window_event(move |event| window_event(&shell, id, event));
    Ok(())
}

/// Closing brief `id`'s window answers Cancel.
pub(crate) fn window_event<R: Runtime>(app: &AppHandle<R>, id: u64, event: &WindowEvent) {
    if matches!(
        event,
        WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed
    ) {
        app.state::<BriefState>().answer(Some(id), false);
    }
}

/// What a navigation in the brief window does.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum BriefNavigation {
    /// The page itself loads.
    Load,
    /// Start (`true`) or Cancel (`false`): nothing loads, the window closes.
    Answer(bool),
    /// Anything else: nothing loads.
    Refuse,
}

/// Decides one navigation in the brief window.
pub(crate) fn navigation(url: &Url) -> BriefNavigation {
    match url.as_str() {
        PAGE_URL => BriefNavigation::Load,
        START_URL => BriefNavigation::Answer(true),
        CANCEL_URL => BriefNavigation::Answer(false),
        _ => BriefNavigation::Refuse,
    }
}

/// The navigation guard's decision for the brief window: true lets the page
/// load. Start and Cancel give the answer and close the window.
pub fn on_navigation<R: Runtime>(webview: &Webview<R>, url: &Url) -> bool {
    match navigation(url) {
        BriefNavigation::Load => true,
        BriefNavigation::Answer(start) => {
            webview.state::<BriefState>().answer(None, start);
            close(webview);
            false
        }
        BriefNavigation::Refuse => false,
    }
}

/// The guard's check of a page that loaded in the brief window: anything
/// but the page closes it, which answers Cancel.
pub fn on_page_load<R: Runtime>(webview: &Webview<R>, url: &Url) {
    if navigation(url) != BriefNavigation::Load {
        close(webview);
    }
}

/// Closes the brief window. It answers Cancel first, so the person's
/// answer never waits on the close event; after Start it changes nothing.
fn close<R: Runtime>(webview: &Webview<R>) {
    webview.state::<BriefState>().answer(None, false);
    if let Err(error) = webview.window().destroy() {
        halonic_shell_log::record("server_session", format!("the brief window stays: {error}"));
    }
}

/// Serves the open brief's page to the brief window, and nothing to any
/// other window or path.
pub fn serve<R: Runtime>(app: &AppHandle<R>, label: &str, path: &str) -> Response<Vec<u8>> {
    let page = (label == WINDOW && path == "/")
        .then(|| app.state::<BriefState>().page())
        .flatten();
    let Some(page) = page else {
        return Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Vec::new())
            .unwrap_or_default();
    };
    Response::builder()
        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
        .header(header::CONTENT_SECURITY_POLICY, PAGE_POLICY)
        .header(header::CACHE_CONTROL, "no-store")
        .body(page.into_bytes())
        .unwrap_or_default()
}

/// Escapes text for HTML, so a brief shows as written and adds no markup.
pub(crate) fn escape(text: &str) -> String {
    let mut escaped = String::with_capacity(text.len());
    for character in text.chars() {
        match character {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&#39;"),
            other => escaped.push(other),
        }
    }
    escaped
}

/// The page: the title, who and where, the whole brief read-only in a box
/// that scrolls, and Cancel and Start.
pub(crate) fn page(heading: &str, intro: &str, brief: &str) -> String {
    // HTML drops a line break right after `<textarea>`, so one is added:
    // a brief that starts with a line break keeps it.
    format!(
        r#"<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{title}</title>
<style>{STYLE}</style>
</head>
<body>
<h1>{title}</h1>
<p>{heading}</p>
<p id="intro">{intro}</p>
<textarea readonly aria-labelledby="intro" spellcheck="false">
{brief}</textarea>
<nav><a href="{CANCEL_URL}">{cancel}</a><a class="start" href="{START_URL}">{start}</a></nav>
</body>
</html>
"#,
        title = escape(crate::server_session::DIALOG_TITLE),
        heading = escape(heading),
        intro = escape(intro),
        brief = escape(brief),
        cancel = escape(CANCEL_BUTTON),
        start = escape(crate::server_session::DIALOG_BUTTON),
    )
}

const STYLE: &str = "
:root { color-scheme: light dark; font: 13px system-ui, -apple-system, sans-serif; }
body { margin: 0; padding: 16px; height: 100vh; box-sizing: border-box; display: flex; flex-direction: column; gap: 8px; }
h1 { font-size: 15px; margin: 0; }
p { margin: 0; overflow-wrap: anywhere; }
textarea { flex: 1; min-height: 120px; resize: none; font: 12px ui-monospace, monospace; white-space: pre-wrap; padding: 8px; }
nav { display: flex; justify-content: flex-end; gap: 8px; }
a { padding: 6px 16px; border: 1px solid GrayText; border-radius: 6px; color: CanvasText; text-decoration: none; }
a:focus-visible { outline: 2px solid Highlight; outline-offset: 2px; }
a.start { background: Highlight; color: HighlightText; border-color: Highlight; }
";

#[cfg(test)]
#[path = "server_session_brief_tests.rs"]
mod tests;
