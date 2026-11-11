//! Requirement `workspace-data-commands`: what the blob commands answer.

use halonic_blob_store::BlobStoreError;
use serde_json::json;

use super::{PutAnswer, decode_data};
use crate::workspace_data::DataRefusal;

#[test]
fn workspace_data_commands_take_only_strict_base64url_bytes() {
    assert_eq!(decode_data("aGVsbG8"), Ok(b"hello".to_vec()));
    let refusal = decode_data("aGVsbG8=").expect_err("padding isn't base64url");
    assert_eq!(refusal.kind, "invalid_data");
}

#[test]
fn workspace_data_commands_answer_a_put_and_a_blob_refusal_as_the_page_reads_them() {
    let answer = PutAnswer {
        hash: "2c".repeat(32),
    };
    assert_eq!(
        serde_json::to_value(answer).unwrap(),
        json!({"hash": "2c".repeat(32)})
    );
    let refusal = serde_json::to_value(DataRefusal::from(BlobStoreError::InvalidHash)).unwrap();
    assert_eq!(refusal["kind"], "invalid_hash");
}
