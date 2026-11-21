//! Whether a runtime is installed in Halonic's distro, and which, read from
//! the runtime updater's `status` (`{"current","previous","securityUpdated"}`),
//! for the shell's lite check (HAL-13408) and its runtime install (HAL-14644).

use serde_json::Value;

/// True when `status`, what `halonic-runtime status` printed, names a
/// current runtime. Anything it can't read says no.
#[must_use]
pub fn runtime_installed(status: &str) -> bool {
    current_runtime(status).is_some()
}

/// The current runtime's version that `status` names, or `None` when it
/// names none or can't be read.
#[must_use]
pub fn current_runtime(status: &str) -> Option<String> {
    serde_json::from_str::<Value>(status)
        .ok()
        .and_then(|value| value.get("current")?.as_str().map(str::to_owned))
        .filter(|current| !current.trim().is_empty())
}

#[cfg(test)]
mod tests {
    use super::{current_runtime, runtime_installed};

    #[test]
    fn runtime_update_reads_whether_a_current_runtime_is_installed() {
        assert!(runtime_installed(
            r#"{"current":"0.1.0","previous":null,"securityUpdated":""}"#
        ));
        assert!(runtime_installed("{\"current\":\"0.1.0\"}\n"));
        for status in [
            r#"{"current":null,"previous":null}"#,
            r#"{"current":""}"#,
            r#"{"previous":"0.1.0"}"#,
            "[]",
            "not JSON",
            "",
        ] {
            assert!(!runtime_installed(status), "{status}");
            assert_eq!(current_runtime(status), None, "{status}");
        }
    }

    #[test]
    fn runtime_update_reads_the_current_runtimes_version() {
        assert_eq!(
            current_runtime(r#"{"current":"0.1.1+0123456789ab","previous":"0.1.0"}"#),
            Some("0.1.1+0123456789ab".to_owned())
        );
    }
}
