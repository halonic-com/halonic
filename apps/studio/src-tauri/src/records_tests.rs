//! Requirements `workspace-data-commands` and `plugin-records-scope`: what the
//! record commands answer, and where the plugins' scope is kept.

use std::path::PathBuf;

use halonic_profile::{Platform, ProfileFolder};
use halonic_record_store::{RecordStoreError, ReplaceOutcome};
use serde_json::json;

use super::{RecordPlace, RecordScope, ReplaceAnswer, scope_folder};
use crate::workspace_data::DataRefusal;

#[test]
fn workspace_data_commands_answer_a_replace_as_the_page_reads_it() {
    let replaced = serde_json::to_value(ReplaceAnswer::from(ReplaceOutcome::Replaced)).unwrap();
    assert_eq!(replaced, json!({"status": "replaced"}));
    let changed = serde_json::to_value(ReplaceAnswer::from(ReplaceOutcome::Changed)).unwrap();
    assert_eq!(changed, json!({"status": "changed"}));
}

#[test]
fn workspace_data_commands_refuse_with_the_record_store_s_kind_and_words() {
    let refusal = DataRefusal::from(RecordStoreError::InvalidLines {
        collection: "leads".to_owned(),
    });
    let refusal = serde_json::to_value(refusal).unwrap();
    assert_eq!(refusal["kind"], "invalid_lines");
    assert!(
        refusal["message"].as_str().unwrap().contains("\"leads\""),
        "{refusal}"
    );
}

#[test]
fn plugin_records_scope_names_the_plugin_records_folder_of_the_profile() {
    let profile = ProfileFolder {
        platform: Platform::Linux,
        root: "/srv/acme/.local/share/halonic".to_owned(),
    };
    assert_eq!(
        scope_folder(&profile, RecordScope::Plugins),
        "/srv/acme/.local/share/halonic/plugin-records"
    );
}

#[test]
fn plugin_records_scope_is_the_page_s_word_and_no_other_is_taken() {
    let plugins: RecordScope = serde_json::from_value(json!("plugins")).unwrap();
    assert_eq!(plugins, RecordScope::Plugins);
    for word in ["workspaces", "trust", "../plugins", ""] {
        assert!(serde_json::from_value::<RecordScope>(json!(word)).is_err());
    }
}

#[test]
fn plugin_records_scope_is_named_instead_of_a_workspace_and_never_with_one() {
    let workspace = PathBuf::from("acme");
    assert_eq!(
        RecordPlace::named(Some(workspace.clone()), None),
        Ok(RecordPlace::Workspace(workspace.clone()))
    );
    assert_eq!(
        RecordPlace::named(None, Some(RecordScope::Plugins)),
        Ok(RecordPlace::Scope(RecordScope::Plugins))
    );
    let both = RecordPlace::named(Some(workspace), Some(RecordScope::Plugins));
    assert_eq!(both.unwrap_err().kind, "io");
    let neither = RecordPlace::named(None, None);
    assert_eq!(neither.unwrap_err().kind, "io");
}
