//! The agent sandbox's administrator prompt, asked for by the shell itself
//! (HAL-14841): Settings › Agent sandbox and the Inbox setup card start the
//! signed helper through `sandbox_elevate`, with Studio's window as the
//! prompt's owner. Asked for by a hidden PowerShell under the agent host,
//! the prompt didn't show on a tester's PC, and the setup waited for ever
//! (HAL-14812).
//!
//! The page names only the verb. The helper is always the
//! `halonic-sandbox-elevate.exe` the installer put beside the app, started
//! with that one argument; the page never names a path, an argument or a
//! folder. The exit code alone never means the sandbox is set up: the page
//! then asks the agent host for its unelevated check, as before.

use serde::{Deserialize, Serialize};
#[cfg(windows)]
use tauri::Manager;
use tauri::{AppHandle, Runtime, WebviewWindow};

/// What the helper is asked to do.
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ElevateVerb {
    Setup,
    Remove,
}

/// How the start ended, for the page.
// Only Windows starts the helper; elsewhere the command refuses.
#[cfg_attr(not(windows), allow(dead_code))]
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(tag = "outcome", rename_all = "snake_case")]
pub enum Elevated {
    /// The helper ran and exited with this code.
    Exited {
        #[serde(rename = "exitCode")]
        exit_code: u32,
    },
    /// The person turned Windows' prompt down, or closed it.
    Cancelled,
    /// The helper still ran after [`LIMIT`]; it is left to finish.
    TimedOut,
    /// A helper started earlier still runs, so Windows wasn't asked again.
    StillRunning,
    /// Windows didn't start the helper, and why.
    Failed { reason: String },
}

/// How long the shell waits for the helper, as the installer does
/// (HAL-14812). It replaces HAL-1415's "no time limit" for Studio only.
#[cfg(windows)]
const LIMIT: std::time::Duration = std::time::Duration::from_secs(5 * 60);

/// The one start of the helper at a time, on Windows.
#[cfg(windows)]
pub struct ElevateState(halonic_elevate_start::Starts<halonic_elevate_start::Windows>);

#[cfg(windows)]
impl Default for ElevateState {
    fn default() -> Self {
        ElevateState(halonic_elevate_start::Starts::new(
            halonic_elevate_start::Windows,
        ))
    }
}

/// Starts the helper beside the app with `verb` and Windows' administrator
/// prompt, owned by the calling window, and waits at most five minutes.
/// Windows only: elsewhere there is nothing to set up.
#[tauri::command]
pub async fn sandbox_elevate<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    verb: ElevateVerb,
) -> Result<Elevated, String> {
    #[cfg(windows)]
    {
        // A window handle is a number to Windows; it isn't sent as a pointer.
        let owner = window.hwnd().map(|hwnd| hwnd.0 as isize).unwrap_or(0);
        let helper = std::env::current_exe()
            .map_err(|error| format!("the app's folder isn't known: {error}"))?
            .with_file_name("halonic-sandbox-elevate.exe");
        let verb = match verb {
            ElevateVerb::Setup => halonic_elevate_start::Verb::Setup,
            ElevateVerb::Remove => halonic_elevate_start::Verb::Remove,
        };
        tauri::async_runtime::spawn_blocking(move || {
            let state = app.state::<ElevateState>();
            Ok(answer(state.0.run(&helper, verb, owner, LIMIT)))
        })
        .await
        .map_err(|error| error.to_string())?
    }
    #[cfg(not(windows))]
    {
        let _ = (app, window, verb);
        Err("only Windows has a sandbox setup".to_owned())
    }
}

#[cfg(windows)]
fn answer(outcome: halonic_elevate_start::Outcome) -> Elevated {
    use halonic_elevate_start::Outcome;
    match outcome {
        Outcome::Exited(exit_code) => Elevated::Exited { exit_code },
        Outcome::Cancelled => Elevated::Cancelled,
        Outcome::TimedOut => Elevated::TimedOut,
        Outcome::StillRunning => Elevated::StillRunning,
        Outcome::Failed(reason) => Elevated::Failed { reason },
    }
}

#[cfg(test)]
mod tests {
    use serde_json::{Value, json};

    use super::{ElevateVerb, Elevated};

    #[test]
    fn sandbox_elevate_command_takes_only_a_verb() {
        let verb: ElevateVerb = serde_json::from_value(json!("setup")).expect("a verb");
        assert_eq!(verb, ElevateVerb::Setup);
        let verb: ElevateVerb = serde_json::from_value(json!("remove")).expect("a verb");
        assert_eq!(verb, ElevateVerb::Remove);
        for other in [
            json!("install"),
            json!("setup --x"),
            json!({"path": "a.exe"}),
        ] {
            assert!(serde_json::from_value::<ElevateVerb>(other).is_err());
        }
    }

    #[test]
    fn sandbox_elevate_command_answers_each_outcome() {
        let exited = Elevated::Exited { exit_code: 13 };
        let failed = Elevated::Failed {
            reason: "no".to_owned(),
        };
        assert_eq!(
            serde_json::to_value(exited).unwrap(),
            json!({"outcome": "exited", "exitCode": 13})
        );
        assert_eq!(
            serde_json::to_value(Elevated::Cancelled).unwrap(),
            json!({"outcome": "cancelled"})
        );
        assert_eq!(
            serde_json::to_value(Elevated::TimedOut).unwrap(),
            json!({"outcome": "timed_out"})
        );
        assert_eq!(
            serde_json::to_value(Elevated::StillRunning).unwrap(),
            json!({"outcome": "still_running"})
        );
        assert_eq!(
            serde_json::to_value(failed).unwrap(),
            json!({"outcome": "failed", "reason": "no"})
        );
    }

    #[test]
    fn sandbox_elevate_command_is_granted_to_the_local_main_window_only() {
        // A remote page, the Studio the computer serves, must never start
        // anything with administrator rights.
        let text = include_str!("../capabilities/desktop-sandbox-elevate.json");
        let capability: Value = serde_json::from_str(text).expect("the capability is JSON");
        assert_eq!(capability["local"], true);
        assert_eq!(capability["windows"], json!(["main"]));
        assert!(capability.get("remote").is_none(), "{capability}");
        assert!(capability.get("webviews").is_none(), "{capability}");
        assert_eq!(capability["platforms"], json!(["windows"]));
        assert_eq!(capability["permissions"], json!(["allow-sandbox-elevate"]));
    }
}
