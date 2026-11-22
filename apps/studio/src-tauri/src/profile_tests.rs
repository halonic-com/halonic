//! A relative `HALONIC_HOME` reaches the page as a `profile_setting`
//! refusal from every command that needs the profile, not as `io`
//! (HAL-15963).

use halonic_profile::ProfileError;
use halonic_trust_grant::TrustRefusal;
use serde::Serialize;
use serde_json::Value;

use super::ProfileProblem;
use crate::agent_host::HostRefusal;
use crate::engine_lock::EngineLockRefusal;
use crate::files::FileRefusal;
use crate::host_settings::HostSettingsRefusal;
use crate::plugin_source::InstallRefusal;
use crate::resource_report::ResourceReportRefusal;
use crate::runs::RunRefusal;
use crate::workspace_data::DataRefusal;

fn relative_home() -> ProfileProblem {
    ProfileProblem::from(ProfileError::HalonicHomeNotAbsolute {
        value: "~/.halonic".to_owned(),
        fix: "Use $HOME instead.".to_owned(),
    })
}

/// Each command's refusal, as the page gets it: its `kind` and `message`.
fn refusals(problem: &ProfileProblem) -> Vec<(&'static str, Value)> {
    fn sent(refusal: impl Serialize) -> Value {
        serde_json::to_value(refusal).expect("a refusal serializes")
    }
    vec![
        ("trust", sent(TrustRefusal::from(problem.clone()))),
        ("data", sent(DataRefusal::from(problem.clone()))),
        ("file", sent(FileRefusal::from(problem.clone()))),
        ("run", sent(RunRefusal::from(problem.clone()))),
        ("install", sent(InstallRefusal::from(problem.clone()))),
        (
            "host settings",
            sent(HostSettingsRefusal::from(problem.clone())),
        ),
        (
            "engine lock",
            sent(EngineLockRefusal::from(problem.clone())),
        ),
        (
            "resource report",
            sent(ResourceReportRefusal::from(problem.clone())),
        ),
        ("host", sent(HostRefusal::from(problem.clone()))),
    ]
}

#[test]
fn a_relative_halonic_home_is_a_profile_setting_in_every_refusal() {
    let problem = relative_home();
    assert_eq!(problem.kind(), "profile_setting");
    let message = problem.to_string();
    assert!(message.starts_with("HALONIC_HOME must be a full path, not \"~/.halonic\"."));
    for (command, refusal) in refusals(&problem) {
        assert_eq!(refusal["kind"], "profile_setting", "{command}");
        assert_eq!(refusal["message"], message.as_str(), "{command}");
    }
}

#[test]
fn a_home_folder_that_isnt_absolute_stays_io() {
    let problem = ProfileProblem::from(ProfileError::HomeNotAbsolute {
        value: "acme".to_owned(),
    });
    for (command, refusal) in refusals(&problem) {
        assert_eq!(refusal["kind"], "io", "{command}");
    }
}

#[test]
fn a_variable_that_cant_be_read_stays_io() {
    let problem = ProfileProblem::from("HALONIC_HOME isn't valid Unicode".to_owned());
    for (command, refusal) in refusals(&problem) {
        assert_eq!(refusal["kind"], "io", "{command}");
        assert_eq!(
            refusal["message"], "HALONIC_HOME isn't valid Unicode",
            "{command}"
        );
    }
}
