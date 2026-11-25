//! Requirement `server-session-brief-window`: the brief window gets the
//! whole brief unchanged, has no script, answers Start only for its Start
//! link, answers Cancel when closed, and serves its page to itself only.

use tauri::test::{MockRuntime, mock_builder};
use tauri::{App, Manager, Url, WindowEvent};

use super::{BriefNavigation, BriefState, WINDOW, escape, navigation, page, serve, window_event};

fn shell_app() -> App<MockRuntime> {
    crate::shell(mock_builder())
        .build(tauri::generate_context!())
        .expect("the shell builds on the mock runtime")
}

/// A brief near the 8 KB limit, with everything HTML could take as markup.
fn long_brief() -> String {
    let mut brief = String::from(
        "\nTask: https://paperclip.acme.example/HAL/issues/HAL-1234\n\
         Steps:\n\t1. Don't run </textarea><script>alert(1)</script>\n\
         2. Keep \"&amp;\" & <b>these</b> as written\n",
    );
    while brief.len() < 8000 {
        brief.push_str("3. Restart the worker on build.acme.example and check its log.\n");
    }
    brief
}

/// The text box's content as the browser reads it: the one line break
/// after `<textarea …>` dropped, the escapes turned back.
fn shown_brief(page: &str) -> String {
    let opening = page.find("<textarea").expect("a text box");
    let start = opening + page[opening..].find(">\n").expect("the box opens") + 2;
    let end = start + page[start..].find("</textarea>").expect("the box closes");
    page[start..end]
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&amp;", "&")
}

#[test]
fn the_window_gets_the_whole_brief_unchanged() {
    let brief = long_brief();
    let shown = page(
        "Start Claude Code on ops@build.acme.example for HAL-1234?",
        "Intro:",
        &brief,
    );
    assert_eq!(shown_brief(&shown), brief);
    assert_eq!(
        shown.matches("</textarea>").count(),
        1,
        "the brief can't close the box"
    );
    assert!(!shown.contains("<script"), "the page has no script");
    assert!(shown.contains("<textarea readonly"));
}

#[test]
fn the_window_keeps_the_title_the_server_line_and_both_buttons() {
    let shown = page(
        "Start Claude Code on ops@build.acme.example for HAL-1234?",
        "Intro:",
        "Task: x",
    );
    assert!(shown.contains("<title>Start Claude Code on your server?</title>"));
    assert!(shown.contains("<p>Start Claude Code on ops@build.acme.example for HAL-1234?</p>"));
    assert!(shown.contains(">Start</a>"));
    assert!(shown.contains(">Cancel</a>"));
}

#[test]
fn the_heading_is_escaped_too() {
    assert_eq!(
        escape(r#"<a href="x">&'"#),
        "&lt;a href=&quot;x&quot;&gt;&amp;&#39;"
    );
}

#[test]
fn only_the_start_link_answers_start() {
    let answer = |url: &str| navigation(&Url::parse(url).expect("a test URL"));
    assert_eq!(answer("halonic-brief://localhost/"), BriefNavigation::Load);
    assert_eq!(
        answer("halonic-brief://localhost/start"),
        BriefNavigation::Answer(true)
    );
    assert_eq!(
        answer("halonic-brief://localhost/cancel"),
        BriefNavigation::Answer(false)
    );
    for refused in [
        "halonic-brief://localhost/start?again",
        "halonic-brief://localhost/start#x",
        "halonic-brief://evil/start",
        "tauri://localhost/studio.html",
        "https://acme.example/start",
        "javascript:alert(1)",
    ] {
        assert_eq!(answer(refused), BriefNavigation::Refuse, "{refused}");
    }
}

#[test]
fn closing_the_window_answers_cancel() {
    let app = shell_app();
    let state = app.state::<BriefState>();
    let (id, answered) = state.begin("page".to_owned()).expect("no brief is open");
    window_event(app.handle(), id, &WindowEvent::Destroyed);
    assert_eq!(answered.recv(), Ok(false));
    // A Start after the window closed changes nothing.
    state.answer(None, true);
    assert!(answered.try_recv().is_err());
}

#[test]
fn a_start_is_answered_once_and_a_closed_old_window_cancels_nothing_new() {
    let app = shell_app();
    let state = app.state::<BriefState>();
    let (old, answered) = state.begin("page".to_owned()).expect("no brief is open");
    assert!(
        state.begin("second".to_owned()).is_none(),
        "one brief window at a time"
    );
    state.answer(None, true);
    assert_eq!(answered.recv(), Ok(true));
    state.end(old);
    let (_, next) = state
        .begin("next".to_owned())
        .expect("the first brief ended");
    window_event(app.handle(), old, &WindowEvent::Destroyed);
    assert!(
        next.try_recv().is_err(),
        "the old window's close is not the new answer"
    );
}

#[test]
fn the_page_is_served_to_the_brief_window_only_and_only_while_open() {
    let app = shell_app();
    let status = |label: &str, path: &str| serve(app.handle(), label, path).status().as_u16();
    assert_eq!(status(WINDOW, "/"), 404, "nothing is open");
    let (id, _answered) = app
        .state::<BriefState>()
        .begin("<p>brief</p>".to_owned())
        .expect("no brief is open");
    let response = serve(app.handle(), WINDOW, "/");
    assert_eq!(response.status().as_u16(), 200);
    assert_eq!(response.body(), b"<p>brief</p>");
    let policy = response.headers()["content-security-policy"]
        .to_str()
        .expect("text");
    assert!(policy.starts_with("default-src 'none';"), "{policy}");
    assert!(!policy.contains("script-src"), "{policy}");
    assert_eq!(status("main", "/"), 404);
    assert_eq!(status(WINDOW, "/start"), 404);
    app.state::<BriefState>().end(id);
    assert_eq!(status(WINDOW, "/"), 404);
}
