//! The feedback shortcut's setting (HAL-18778). Studio's main window hears
//! the shortcut itself, only while it is focused; nothing registers a
//! system-wide key. The shell checks and saves a new shortcut here, so the
//! page never writes it unchecked.

use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime};

use super::held::shortcut_of;
use super::{FeedbackCapture, log};

/// The host setting that holds the shortcut, as the plugin writes it.
pub const SHORTCUT_SETTING: &str = "feedback.shortcut";

/// Saves `shortcut` as the feedback shortcut. Refused as `invalid` when
/// it isn't a shortcut or holds none of Ctrl, Alt and Super (⌘), and as
/// `failed` when it can't be saved. One change saves at a time.
#[tauri::command]
pub async fn shortcut_set<R: Runtime>(
    app: AppHandle<R>,
    shortcut: String,
) -> Result<(), &'static str> {
    let new = shortcut_of(&shortcut).ok_or("invalid")?;
    let state = app.state::<FeedbackCapture>();
    let _changing = state.changing.lock().await;
    let saving = app.clone();
    let value = Value::String(new.into_string());
    let saved = tauri::async_runtime::spawn_blocking(move || {
        crate::host_settings::save(&saving, SHORTCUT_SETTING, Some(&value))
    })
    .await;
    match saved {
        Ok(Ok(())) => Ok(()),
        Ok(Err(refusal)) => {
            log(format!("the shortcut {new} isn't saved: {refusal:?}"));
            Err("failed")
        }
        Err(error) => {
            log(format!("the shortcut {new} isn't saved: {error}"));
            Err("failed")
        }
    }
}
