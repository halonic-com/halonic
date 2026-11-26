/// What the person is about to answer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Decision {
    Approve,
    Deny,
    /// An answer to an inbox item: an option or a written reply
    /// (`msg-answer`, gateway message version 4).
    Answer,
}

impl Decision {
    /// Whether the phone's PIN, pattern or password passes the prompt next
    /// to a strong biometric: for an inbox answer only (board option P3,
    /// HAL-17509). An approval asks for a strong biometric alone.
    pub fn accepts_device_credential(self) -> bool {
        self == Self::Answer
    }
}

/// The words Android's prompt shows. They are fixed here, one set per
/// [`Decision`], so neither the page nor the host can make the prompt say
/// something other than what is being answered. The verb is the one on the
/// approval card's button the person just pressed: Approve or Reject, or
/// Send for an answer to an inbox item.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PromptWords {
    pub title: &'static str,
    pub description: &'static str,
    pub cancel: &'static str,
}

impl PromptWords {
    pub fn for_decision(decision: Decision) -> Self {
        let description = match decision {
            Decision::Approve => "Approve this request for Halonic on your computer.",
            Decision::Deny => "Reject this request for Halonic on your computer.",
            Decision::Answer => "Send this answer through Halonic on your computer.",
        };
        Self {
            title: "Confirm it's you",
            description,
            cancel: "Cancel",
        }
    }
}
