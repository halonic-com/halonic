//! The feedback shortcut's keys (HAL-18778): the global-shortcut plugin,
//! registered from Rust only with the one feedback shortcut, and the
//! command that changes it. No capability grants the plugin's commands, so
//! no page can register a key or hear one.

use std::future::Future;
use std::sync::{Mutex, MutexGuard, PoisonError};

use serde_json::Value;
use tauri::async_runtime::Mutex as AsyncMutex;
use tauri::{AppHandle, Builder, Manager, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcut, Shortcut, ShortcutState};

use super::held::{saved_shortcut, shortcut_of};
use super::{FeedbackCapture, log, pressed};

/// The host setting that holds the shortcut, as the plugin writes it.
pub const SHORTCUT_SETTING: &str = "feedback.shortcut";

/// The global-shortcut plugin, whose only key is the feedback shortcut.
/// Left out on Linux without an X display, which has no global keys: the
/// plugin would stop Studio starting.
pub fn keys<R: Runtime>(builder: Builder<R>) -> Builder<R> {
    if cfg!(target_os = "linux") && std::env::var_os("DISPLAY").is_none() {
        return builder;
    }
    builder.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    pressed(app);
                }
            })
            .build(),
    )
}

/// The global-shortcut plugin, when Studio started with it.
fn shortcuts<R: Runtime>(app: &AppHandle<R>) -> Option<&GlobalShortcut<R>> {
    app.try_state::<GlobalShortcut<R>>()
        .map(|state| state.inner())
}

/// Registers the saved shortcut. It reads the profile, so it runs off the
/// UI thread; a shortcut another app holds is logged, and Studio runs on.
pub fn register_saved<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let Some(shortcuts) = shortcuts(&app) else {
            return;
        };
        let saved =
            crate::host_settings::saved_value(&app, SHORTCUT_SETTING).unwrap_or_else(|error| {
                log(format!("the saved shortcut can't be read: {error:?}"));
                None
            });
        let shortcut = saved_shortcut(saved.as_ref());
        match shortcuts.register(shortcut) {
            Ok(()) => *registered(&app.state::<FeedbackCapture>().shortcut) = Some(shortcut),
            Err(error) => log(format!("the shortcut {shortcut} isn't registered: {error}")),
        }
    });
}

fn registered(shortcut: &Mutex<Option<Shortcut>>) -> MutexGuard<'_, Option<Shortcut>> {
    shortcut.lock().unwrap_or_else(PoisonError::into_inner)
}

/// Saves `shortcut` as the feedback shortcut. Refused as `invalid` when
/// it isn't a shortcut or holds none of Ctrl, Alt and Super (⌘), `taken`
/// when the system or another app holds it, and `unavailable` where Studio
/// hears no keys. When it can't be saved, the old keys come back.
#[tauri::command]
pub async fn shortcut_set<R: Runtime>(
    app: AppHandle<R>,
    shortcut: String,
) -> Result<(), &'static str> {
    let new = shortcut_of(&shortcut).ok_or("invalid")?;
    if shortcuts(&app).is_none() {
        return Err("unavailable");
    }
    let state = app.state::<FeedbackCapture>();
    let saving = app.clone();
    let save = move |value: Value| async move {
        let saved = tauri::async_runtime::spawn_blocking(move || {
            crate::host_settings::save(&saving, SHORTCUT_SETTING, Some(&value))
        })
        .await;
        match saved {
            Ok(Ok(())) => Ok(()),
            Ok(Err(refusal)) => Err(format!("{refusal:?}")),
            Err(error) => Err(error.to_string()),
        }
    };
    change_shortcut(&app, &state.shortcut, &state.changing, new, save).await
}

/// Registers `new` instead of the registered keys and saves it with
/// `save`, putting the old keys back when it can't be saved. One change
/// runs at a time, from registering until saved or put back: two that
/// interleaved would each put back keys the other had already let go of.
pub async fn change_shortcut<Save, Saving>(
    keys: &impl Keys,
    shortcut: &Mutex<Option<Shortcut>>,
    changing: &AsyncMutex<()>,
    new: Shortcut,
    save: Save,
) -> Result<(), &'static str>
where
    Save: FnOnce(Value) -> Saving,
    Saving: Future<Output = Result<(), String>>,
{
    let _changing = changing.lock().await;
    let old = register_instead(keys, &mut registered(shortcut), new)?;
    let Err(failure) = save(Value::String(new.into_string())).await else {
        return Ok(());
    };
    log(format!("the shortcut {new} isn't saved: {failure}"));
    put_back(keys, &mut registered(shortcut), new, old);
    Err("failed")
}

/// The two calls the shortcut change makes on the global-shortcut plugin,
/// so the change tests without a keyboard.
pub trait Keys {
    /// Starts hearing `shortcut`; refused when another app holds it.
    fn register(&self, shortcut: Shortcut) -> Result<(), String>;
    /// Stops hearing `shortcut`.
    fn unregister(&self, shortcut: Shortcut) -> Result<(), String>;
}

/// The plugin, looked up on each call, so a change holds only the app
/// while it waits for the save.
impl<R: Runtime> Keys for AppHandle<R> {
    fn register(&self, shortcut: Shortcut) -> Result<(), String> {
        let plugin = shortcuts(self).ok_or("no keys are heard here")?;
        plugin.register(shortcut).map_err(|error| error.to_string())
    }

    fn unregister(&self, shortcut: Shortcut) -> Result<(), String> {
        let plugin = shortcuts(self).ok_or("no keys are heard here")?;
        plugin
            .unregister(shortcut)
            .map_err(|error| error.to_string())
    }
}

/// Registers `new` before it lets go of the old shortcut, so a refused
/// change leaves the old one working. Gives what was registered before.
pub fn register_instead(
    keys: &impl Keys,
    registered: &mut Option<Shortcut>,
    new: Shortcut,
) -> Result<Option<Shortcut>, &'static str> {
    let old = *registered;
    if old == Some(new) {
        return Ok(old);
    }
    keys.register(new).map_err(|_| "taken")?;
    *registered = Some(new);
    if let Some(old) = old
        && let Err(error) = keys.unregister(old)
    {
        log(format!("the old shortcut {old} stays registered: {error}"));
    }
    Ok(old)
}

/// Undoes `register_instead` when the new shortcut can't be saved: the
/// `old` keys come back and `new` is let go. When another app took the old
/// keys in between, or `new` won't let go, `new` stays, so some shortcut
/// still works and the one registered is the one a later change lets go.
pub fn put_back(
    keys: &impl Keys,
    registered: &mut Option<Shortcut>,
    new: Shortcut,
    old: Option<Shortcut>,
) {
    if old == Some(new) {
        return;
    }
    if let Some(old) = old
        && let Err(error) = keys.register(old)
    {
        log(format!("the old shortcut {old} can't come back: {error}"));
        return;
    }
    if let Err(error) = keys.unregister(new) {
        log(format!(
            "the unsaved shortcut {new} stays registered: {error}"
        ));
        if let Some(old) = old
            && let Err(error) = keys.unregister(old)
        {
            log(format!("the old shortcut {old} stays registered: {error}"));
        }
        return;
    }
    *registered = old;
}
