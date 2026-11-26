//! Tests for `studio.src-tauri.open-windows` on the mock runtime: the
//! content commands and the first window's reopening.

use tauri::test::{MockRuntime, mock_builder};
use tauri::webview::WebviewWindowBuilder;
use tauri::{App, Manager, WebviewUrl};

use super::*;
use crate::open_windows::OpenWindow;

fn app_with(labels: &[&str]) -> App<MockRuntime> {
    let app = crate::shell(mock_builder())
        .build(tauri::generate_context!())
        .expect("the shell builds on the mock runtime");
    for label in labels {
        WebviewWindowBuilder::new(&app, *label, WebviewUrl::default())
            .build()
            .expect("the window opens");
    }
    app
}

fn window(app: &App<MockRuntime>, label: &str) -> WebviewWindow<MockRuntime> {
    app.get_webview_window(label).expect("the window is open")
}

fn set_from(app: &App<MockRuntime>, label: &str, content: &str) -> Result<(), &'static str> {
    tauri::async_runtime::block_on(window_content_set(
        window(app, label),
        Some(content.to_owned()),
    ))
}

fn labels(app: &App<MockRuntime>) -> Vec<String> {
    let mut labels: Vec<String> = app.webview_windows().into_keys().collect();
    labels.sort();
    labels
}

#[test]
fn open_windows_a_page_reads_back_only_its_own_windows_content() {
    let app = app_with(&["main", "inbox", "ask"]);
    set_from(&app, "inbox", "task-acme-1").expect("kept");
    assert_eq!(window_content_get(window(&app, "main")), Ok(None));
    assert_eq!(
        window_content_get(window(&app, "inbox")),
        Ok(Some("task-acme-1".to_owned()))
    );
    assert_eq!(set_from(&app, "ask", "x"), Err("not_an_app_window"));
    assert_eq!(
        window_content_get(window(&app, "ask")),
        Err("not_an_app_window")
    );
}

#[test]
fn open_windows_the_first_window_reopens_the_recorded_ones() {
    let app = app_with(&[]);
    seed(
        app.handle(),
        &[
            OpenWindow {
                label: "inbox".to_owned(),
                focused: true,
                content: None,
            },
            OpenWindow {
                label: "messenger".to_owned(),
                focused: false,
                content: None,
            },
        ],
    );
    open_studio(app.handle()).expect("Studio's window opens");
    assert_eq!(labels(&app), ["inbox", "main", "messenger"]);
}
