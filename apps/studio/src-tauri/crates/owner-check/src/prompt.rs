/// What the person is about to answer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Decision {
    Approve,
    Deny,
}

/// The words Android's prompt shows. They are fixed here, one set per
/// [`Decision`], so neither the page nor the host can make the prompt say
/// something other than what is being answered.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PromptWords {
    pub title: &'static str,
    pub description: &'static str,
    pub cancel: &'static str,
}

impl PromptWords {
    pub fn for_decision(decision: Decision) -> Self {
        let description = match decision {
            Decision::Approve => "Approve this request on your computer from this phone.",
            Decision::Deny => "Deny this request on your computer from this phone.",
        };
        Self {
            title: "Confirm it's you",
            description,
            cancel: "Cancel",
        }
    }
}
