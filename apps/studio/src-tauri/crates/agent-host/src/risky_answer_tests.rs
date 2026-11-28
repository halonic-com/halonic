//! Requirement `risky-answer-confirm`: what the shell reads from the host's
//! ask, the question it builds and the body it confirms.

use serde_json::{Value, json};

use super::RiskyAnswer;

const DIGEST: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

/// The host's 409 for Ada's ask to hire Iris, with `confirmation` changed by `change`.
fn ask(change: impl FnOnce(&mut Value)) -> Value {
    let mut confirmation = json!({
        "title": "Hire an agent",
        "from": "Ada",
        "option": "Approve",
        "reach": {
            "agent": "Iris",
            "adapter": "process",
            "env": [
                { "name": "ACME_DEPLOY_TOKEN", "bindsSecret": true },
                { "name": "ACME_REGION", "bindsSecret": false },
            ],
        },
        "digest": DIGEST,
    });
    change(&mut confirmation);
    json!({
        "error": { "kind": "needs_confirmation", "message": "Approving this needs your yes." },
        "confirmation": confirmation,
    })
}

#[test]
fn the_question_names_who_asks_what_it_reaches_and_the_answer() {
    let risky = RiskyAnswer::of(409, &ask(|_| ())).expect("an ask");
    assert_eq!(
        risky.question(),
        "Ada asks: Hire an agent\n\n\
         Agent: Iris\n\
         Adapter: process\n\
         Environment variables:\n\
         - ACME_DEPLOY_TOKEN (gets a secret)\n\
         - ACME_REGION\n\n\
         Halonic sends \"Approve\" only if you approve it here."
    );
}

#[test]
fn the_question_names_a_secret_with_its_setting_path_and_counts_variables_left_out() {
    let risky = RiskyAnswer::of(
        409,
        &ask(|confirmation| {
            confirmation["reach"] = json!({
                "agent": "Bo",
                "secret": { "name": "Acme deploy token", "settingPath": "env.ACME_DEPLOY_TOKEN" },
                "env": [{ "name": "ACME_A", "bindsSecret": false }, { "bindsSecret": true }],
                "envLeftOut": 3,
            });
        }),
    )
    .expect("an ask");
    let question = risky.question();
    assert!(question.contains("Agent: Bo\n"), "{question}");
    assert!(question.contains("Secret: Acme deploy token, used as env.ACME_DEPLOY_TOKEN\n"));
    // The entry without a name counts as one more, with the three the host left out.
    assert!(question.contains("- ACME_A\n- and 4 more\n"), "{question}");
}

#[test]
fn the_question_puts_each_name_on_one_line_and_cuts_a_long_one() {
    let risky = RiskyAnswer::of(
        409,
        &ask(|confirmation| {
            confirmation["title"] = json!("Hire\n\nAgent: Root\u{7}");
            confirmation["reach"] = json!({ "agent": "I".repeat(300) });
        }),
    )
    .expect("an ask");
    let question = risky.question();
    assert!(
        question.starts_with("Ada asks: Hire Agent: Root\n"),
        "{question}"
    );
    assert!(question.contains(&format!("Agent: {}…\n", "I".repeat(199))));
    assert!(!question.contains(&"I".repeat(200)));
}

#[test]
fn any_other_answer_is_no_ask_and_reaches_the_page_as_it_is() {
    assert_eq!(
        RiskyAnswer::of(200, &json!({ "result": { "outcome": "answered" } })),
        None
    );
    assert_eq!(RiskyAnswer::of(200, &ask(|_| ())), None);
    let changed =
        json!({ "error": { "kind": "item_changed" }, "confirmation": { "digest": DIGEST } });
    assert_eq!(RiskyAnswer::of(409, &changed), None);
    for digest in [
        json!("abc"),
        json!(DIGEST.to_uppercase()),
        json!(null),
        json!(7),
    ] {
        let body = ask(|confirmation| confirmation["digest"] = digest.clone());
        assert_eq!(RiskyAnswer::of(409, &body), None, "{digest}");
    }
    let no_copy = json!({ "error": { "kind": "needs_confirmation" } });
    assert_eq!(RiskyAnswer::of(409, &no_copy), None);
}

#[test]
fn the_confirmed_body_is_the_pages_body_with_the_digest() {
    let risky = RiskyAnswer::of(409, &ask(|_| ())).expect("an ask");
    let page = json!({ "workspace": "/work/acme", "item": "hire", "answer": { "kind": "option", "option": "approve" } });
    assert_eq!(
        risky.confirmed_body(&page),
        Some(json!({
            "workspace": "/work/acme",
            "item": "hire",
            "answer": { "kind": "option", "option": "approve" },
            "digest": DIGEST,
        }))
    );
    assert_eq!(risky.confirmed_body(&json!("not an object")), None);
}

#[test]
fn the_question_shows_the_note_sent_with_the_option_under_its_label() {
    let risky = RiskyAnswer::of(
        409,
        &ask(|confirmation| {
            confirmation["title"] = json!("Raise a budget");
            confirmation["note"] =
                json!({ "label": "New limit, in dollars", "text": "21474836.47" });
            confirmation
                .as_object_mut()
                .expect("an object")
                .remove("reach");
        }),
    )
    .expect("an ask");
    assert_eq!(
        risky.question(),
        "Ada asks: Raise a budget\n\n\
         New limit, in dollars: 21474836.47\n\n\
         Halonic sends \"Approve\" only if you approve it here."
    );
}

#[test]
fn the_question_drops_format_characters() {
    let risky = RiskyAnswer::of(
        409,
        &ask(|confirmation| {
            confirmation["from"] = json!("Ada\u{202E}\u{2066}\u{200B}");
            confirmation["reach"] = json!({ "agent": "Iris\u{FEFF}\u{E0041}" });
        }),
    )
    .expect("an ask");
    assert!(
        risky
            .question()
            .starts_with("Ada asks: Hire an agent\n\nAgent: Iris\n"),
        "{}",
        risky.question()
    );
}

#[test]
fn the_question_says_you_asked_for_the_persons_own_item() {
    let risky = RiskyAnswer::of(
        409,
        &ask(|confirmation| {
            confirmation["from"] = json!("you");
            confirmation["fromYou"] = json!(true);
        }),
    )
    .expect("an ask");
    assert!(
        risky.question().starts_with("You asked: Hire an agent\n"),
        "{}",
        risky.question()
    );
}

#[test]
fn only_the_hosts_flag_makes_it_your_item() {
    let risky = RiskyAnswer::of(
        409,
        &ask(|confirmation| confirmation["from"] = json!("You")),
    )
    .expect("an ask");
    assert!(
        risky.question().starts_with("You asks: Hire an agent\n"),
        "{}",
        risky.question()
    );
}
