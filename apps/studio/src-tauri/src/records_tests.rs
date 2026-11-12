//! Requirement `workspace-data-commands`: what the record commands answer.

use halonic_record_store::{RecordStoreError, ReplaceOutcome};
use serde_json::json;

use super::ReplaceAnswer;
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
