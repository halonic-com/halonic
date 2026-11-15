use halonic_trust_store::{FileInstructionTrustStore, InstructionRecord, TrustError};
use serde_json::Value;

use crate::grants::TrustState;
use crate::instruction_question::{TrustedBefore, instruction_question_text};
use crate::refusal::TrustRefusal;

impl TrustState {
    /// Saves the instructions a person trusted for an agent, after the
    /// shell asked them itself: the page can't answer for them. `ask` gets
    /// the question's text and answers whether they said yes.
    ///
    /// The question compares the record with the pin saved for the same
    /// agent. A saved record that can't be read doesn't stop the save, so a
    /// damaged file can be replaced; the question says what changed can't be
    /// listed. Refuses as `invalid_record` for a record that isn't exactly
    /// trusted instructions, as `busy` while another dialog shows, and as
    /// `declined` when they say no; nothing is saved then.
    pub fn grant_instructions(
        &self,
        store: &FileInstructionTrustStore,
        record: &Value,
        ask: impl FnOnce(&str) -> bool,
    ) -> Result<(), TrustRefusal> {
        let record = InstructionRecord::from_value(record)?;
        let before = match store.get(&record.key()) {
            Ok(None) => TrustedBefore::Never,
            Ok(Some(saved)) => TrustedBefore::Pin(saved.pin),
            Err(TrustError::Unreadable { .. }) => TrustedBefore::Unreadable,
            Err(error) => return Err(error.into()),
        };
        let question =
            instruction_question_text(&record.agent, &record.location, &before, &record.pin);
        let _asking = self.start_asking()?;
        if !ask(&question) {
            return Err(TrustRefusal::new(
                "declined",
                format!(
                    "the person didn't trust the instructions of the agent {:?} in {:?}",
                    record.agent, record.location
                ),
            ));
        }
        store.save(&record)?;
        Ok(())
    }
}
