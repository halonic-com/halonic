//! The folders the host sweeps, why `wsl.exe` failed, and the refusal for a
//! distro without its runtime.

use halonic_agent_host::WslError;
use serde_json::json;

use super::super::progress::{FailureCause, StartFailure};
use super::{runtime_missing, sweep_roots, wsl_failure};

#[test]
fn start_status_keeps_the_exit_code_of_a_wsl_exe_that_failed() {
    assert_eq!(
        wsl_failure(&WslError::Failed(Some(4))),
        StartFailure {
            cause: FailureCause::WslFailed,
            exit_code: Some(4),
        }
    );
    assert_eq!(
        wsl_failure(&WslError::Start(String::new())),
        StartFailure::of(FailureCause::WslFailed)
    );
}

/// Requirements `agent-host-commands` and `start-status` (HAL-15158): a
/// distro left without a runtime refuses as `host_unavailable` with the
/// sandbox reason `runtime-missing`, and the start fails as `runtime_missing`.
#[test]
fn agent_host_commands_refuse_a_distro_without_its_runtime_as_runtime_missing() {
    let refusal =
        runtime_missing("the runtime couldn't be installed in Halonic's WSL distro".to_owned());
    assert_eq!(
        serde_json::to_value(&refusal).expect("serializes"),
        json!({
            "kind": "host_unavailable",
            "reason": "runtime-missing",
            "message": "the runtime couldn't be installed in Halonic's WSL distro",
        })
    );
    assert_eq!(
        refusal.failure,
        StartFailure::of(FailureCause::RuntimeMissing)
    );
    assert_eq!(
        serde_json::to_value(refusal.failure.cause).expect("serializes"),
        json!("runtime_missing")
    );
}

#[test]
fn agent_host_commands_sweep_the_profile_and_the_opened_folders() {
    let profile = std::env::temp_dir().join("profile");
    let acme = std::env::temp_dir().join("acme");
    assert_eq!(sweep_roots(&profile, &[]), std::slice::from_ref(&profile));
    assert_eq!(
        sweep_roots(&profile, std::slice::from_ref(&acme)),
        [profile, acme]
    );
}

#[cfg(windows)]
#[test]
fn agent_host_commands_sweep_opened_folders_without_the_long_path_prefix() {
    use std::path::PathBuf;

    let profile = PathBuf::from(r"C:\acme-profile"); // leak-guard: allow absolute-path made-up Windows path for a test
    let opened = PathBuf::from(r"\\?\D:\acme"); // leak-guard: allow absolute-path made-up Windows path for a test
    assert_eq!(
        sweep_roots(&profile, &[opened]),
        [profile, PathBuf::from(r"D:\acme")] // leak-guard: allow absolute-path made-up Windows path for a test
    );
}
