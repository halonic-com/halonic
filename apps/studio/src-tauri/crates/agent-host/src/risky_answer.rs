//! A risky approve waits for the person's yes in the shell (6.8, condition 2,
//! HAL-20441; requirement `risky-answer-confirm`). The agent host answers the
//! page's `POST /v1/messaging/answer` for one with 409 `needs_confirmation`
//! and its own copy of the item. The shell builds its question from that
//! copy only, never from the page, and after a yes sends
//! `POST /v1/messaging/answer-confirmed` with the copy's digest, on a route
//! no page can name ([`crate::ANSWER_CONFIRMED`]).

use serde_json::{Map, Value};

/// The page's route that answers an inbox item, which the shell checks.
pub const ANSWER_PATH: &str = "/v1/messaging/answer";

/// The longest name or line the question shows, in characters.
const LINE_MAX: usize = 200;

/// The most environment variables the question names, as the port allows.
const ENV_MAX: usize = 100;

/// What the shell asks before it sends a risky approve: the question, and
/// the digest of the host's copy the person saw.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RiskyAnswer {
    question: String,
    digest: String,
}

impl RiskyAnswer {
    /// The confirmation the host asks for: a 409 `needs_confirmation` whose
    /// `confirmation` has a SHA-256 digest as 64 lowercase hex characters.
    /// `None` for any other answer, which the page gets as it is, so a
    /// malformed ask sends nothing either.
    #[must_use]
    pub fn of(status: u16, body: &Value) -> Option<Self> {
        let kind = body.pointer("/error/kind").and_then(Value::as_str);
        if status != 409 || kind != Some("needs_confirmation") {
            return None;
        }
        let confirmation = body.get("confirmation")?.as_object()?;
        let digest = confirmation.get("digest")?.as_str()?;
        let is_digest = digest.len() == 64
            && digest
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte));
        is_digest.then(|| Self {
            question: question_of(confirmation),
            digest: digest.to_owned(),
        })
    }

    /// The question the shell's dialog shows.
    #[must_use]
    pub fn question(&self) -> &str {
        &self.question
    }

    /// The page's `body` with the digest added, which is what the shell
    /// confirms; `None` when the body isn't an object, which the host
    /// refuses anyway.
    #[must_use]
    pub fn confirmed_body(&self, body: &Value) -> Option<Value> {
        let mut confirmed = body.as_object()?.clone();
        confirmed.insert("digest".to_owned(), Value::String(self.digest.clone()));
        Some(Value::Object(confirmed))
    }
}

/// The question from the host's copy: who asks and what, then what the
/// approve reaches, by name only, then the answer the person picked.
fn question_of(confirmation: &Map<String, Value>) -> String {
    let text = |name: &str| confirmation.get(name).and_then(Value::as_str).map(one_line);
    let from = text("from").unwrap_or_else(|| "An agent".to_owned());
    let title = text("title").unwrap_or_default();
    let mut lines = vec![format!("{from} asks: {title}")];
    if let Some(reach) = confirmation.get("reach").and_then(Value::as_object) {
        lines.push(String::new());
        lines.extend(reach_lines(reach));
    }
    lines.push(String::new());
    let answer = text("option").unwrap_or_else(|| "your answer".to_owned());
    lines.push(format!(
        "Halonic sends \"{answer}\" only if you approve it here."
    ));
    lines.join("\n")
}

/// The agent, the secret with its setting path, the adapter and the
/// environment variables, each saying whether it gets a secret.
fn reach_lines(reach: &Map<String, Value>) -> Vec<String> {
    let text = |value: Option<&Value>| value.and_then(Value::as_str).map(one_line);
    let mut lines = Vec::new();
    if let Some(agent) = text(reach.get("agent")) {
        lines.push(format!("Agent: {agent}"));
    }
    let secret = reach.get("secret");
    if let Some(name) = text(secret.and_then(|secret| secret.get("name"))) {
        match text(secret.and_then(|secret| secret.get("settingPath"))) {
            Some(path) => lines.push(format!("Secret: {name}, used as {path}")),
            None => lines.push(format!("Secret: {name}")),
        }
    }
    if let Some(adapter) = text(reach.get("adapter")) {
        lines.push(format!("Adapter: {adapter}"));
    }
    let env = reach.get("env").and_then(Value::as_array);
    let named: Vec<String> = env
        .into_iter()
        .flatten()
        .take(ENV_MAX)
        .filter_map(|variable| {
            let name = text(variable.get("name"))?;
            let binds = variable.get("bindsSecret").and_then(Value::as_bool) == Some(true);
            Some(if binds {
                format!("- {name} (gets a secret)")
            } else {
                format!("- {name}")
            })
        })
        .collect();
    let shown = named.len();
    let listed = env.map_or(0, Vec::len);
    let left_out = reach
        .get("envLeftOut")
        .and_then(Value::as_u64)
        .unwrap_or(0)
        .saturating_add(u64::try_from(listed.saturating_sub(shown)).unwrap_or(u64::MAX));
    if shown > 0 || left_out > 0 {
        lines.push("Environment variables:".to_owned());
        lines.extend(named);
    }
    if left_out > 0 {
        lines.push(format!("- and {left_out} more"));
    }
    lines
}

/// `value` on one line: control characters and runs of white space become
/// one space, and it is cut to [`LINE_MAX`] characters, ending in "…".
fn one_line(value: &str) -> String {
    let words: Vec<&str> = value
        .split(|character: char| character.is_whitespace() || character.is_control())
        .filter(|word| !word.is_empty())
        .collect();
    let line = words.join(" ");
    if line.chars().count() <= LINE_MAX {
        return line;
    }
    let mut cut: String = line.chars().take(LINE_MAX - 1).collect();
    cut.push('…');
    cut
}

#[cfg(test)]
#[path = "risky_answer_tests.rs"]
mod tests;
