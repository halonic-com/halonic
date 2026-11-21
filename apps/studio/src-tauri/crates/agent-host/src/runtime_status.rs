//! Whether a runtime is installed in Halonic's distro, read from the runtime
//! updater's `status` (`{"current","previous","securityUpdated"}`), for the
//! shell's lite check (HAL-13408).

use serde_json::Value;

/// True when `status`, what `halonic-runtime status` printed, names a
/// current runtime. Anything it can't read says no.
#[must_use]
pub fn runtime_installed(status: &str) -> bool {
    serde_json::from_str::<Value>(status)
        .ok()
        .and_then(|value| value.get("current")?.as_str().map(str::to_owned))
        .is_some_and(|current| !current.trim().is_empty())
}

#[cfg(test)]
mod tests {
    use super::runtime_installed;

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
        }
    }
}
