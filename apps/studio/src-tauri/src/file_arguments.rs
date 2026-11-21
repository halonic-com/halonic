//! What `fs_list` takes beyond plain values, as `fileCommands` in
//! `@halonicjs/adapter-fs-tauri` sends it.

use halonic_workspace_files::{FileError, LeaveOut};
use serde::Deserialize;

/// What `fs_list` leaves out when the page asks, as `LeaveOut` in
/// `@halonicjs/ports` names it: `{ folders?, names? }`. The crate checks
/// both before the list, so a bad one is refused as `unsafe_path`.
#[derive(Debug, Default, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LeaveOutArg {
    #[serde(default)]
    folders: Vec<String>,
    #[serde(default)]
    names: Vec<String>,
}

impl LeaveOutArg {
    /// The checked [`LeaveOut`]; nothing left out for no argument.
    pub(crate) fn checked(argument: Option<Self>) -> Result<LeaveOut, FileError> {
        match argument {
            Some(argument) => LeaveOut::new(&argument.folders, &argument.names),
            None => Ok(LeaveOut::default()),
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::LeaveOutArg;

    fn argument(value: serde_json::Value) -> Result<LeaveOutArg, serde_json::Error> {
        serde_json::from_value(value)
    }

    #[test]
    fn files_take_what_the_adapter_leaves_out() {
        let taken = argument(json!({"folders": ["repo"], "names": ["node_modules"]}))
            .map(|taken| LeaveOutArg::checked(Some(taken)).is_ok());
        assert_eq!(taken.ok(), Some(true));
        let only_names = argument(json!({"names": ["node_modules"]})).ok();
        assert!(only_names.is_some(), "folders may be left out");
        assert!(LeaveOutArg::checked(None).is_ok());
    }

    #[test]
    fn files_refuse_a_leave_out_that_could_reach_further_than_it_says() {
        let refused = argument(json!({"folders": ["a/../b"]}))
            .ok()
            .map(|taken| LeaveOutArg::checked(Some(taken)).map_err(|error| error.kind()));
        assert_eq!(refused, Some(Err("unsafe_path")));
        assert!(
            argument(json!({"paths": ["repo"]})).is_err(),
            "no other field is taken"
        );
    }
}
