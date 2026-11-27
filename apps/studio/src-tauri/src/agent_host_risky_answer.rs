//! A risky approve waits for the person's yes in the shell's own dialog (6.8,
//! condition 2, HAL-20441; requirement `risky-answer-confirm`). The page
//! sends every inbox answer through `agent_host_request`, and a compromised
//! page could approve a hire or a secret without the person's click. So when
//! the agent host answers the page's `POST /v1/messaging/answer` with 409
//! `needs_confirmation`, the shell asks in a native dialog the page can't
//! draw or answer, built from the host's copy of the item only
//! (`halonic_agent_host::RiskyAnswer`). Only after a yes does it send
//! `POST /v1/messaging/answer-confirmed`, on a route no page can name. When
//! the person doesn't say yes, nothing more reaches the host and the page gets
//! the refusal `declined`. Every other call goes on to `paperclip_key`.

use halonic_agent_host::{ANSWER_CONFIRMED, ANSWER_PATH, RiskyAnswer, Route};
use serde_json::Value;
use tauri::{AppHandle, Runtime};

use super::{HostAnswer, HostRefusal, paperclip_key, read_answer, send};
use crate::native_dialogs::ask_to_approve_risky;

/// Sends the page's call to `route` with `body`: an inbox answer through
/// [`send_answer`], with the shell's own dialog, any other call through
/// `paperclip_key`.
pub(super) async fn send_for_the_page<R: Runtime>(
    app: &AppHandle<R>,
    route: Route,
    body: Option<Value>,
) -> Result<HostAnswer, HostRefusal> {
    if route.path != ANSWER_PATH {
        return paperclip_key::send_for_the_page(app, route, body).await;
    }
    let asking = app.clone();
    send_answer(app, route, body, move |question| {
        ask_to_approve_risky(&asking, &question)
    })
    .await
}

/// Sends the page's answer. When the host asks for the person's yes, `ask`
/// shows the question on a worker thread, so the page's other calls keep
/// going while the dialog is open, and the confirmed answer goes only after
/// a yes. A host answer that isn't a well-formed ask reaches the page as it
/// is, and then nothing was sent.
pub(super) async fn send_answer<R: Runtime>(
    app: &AppHandle<R>,
    route: Route,
    body: Option<Value>,
    ask: impl FnOnce(String) -> bool + Send + 'static,
) -> Result<HostAnswer, HostRefusal> {
    let answer = read_answer(send(app, route, body.clone()).await?).await?;
    let Some(risky) = RiskyAnswer::of(answer.status, &answer.body) else {
        return Ok(answer);
    };
    let Some(confirmed) = body.as_ref().and_then(|body| risky.confirmed_body(body)) else {
        return Ok(answer);
    };
    let question = risky.question().to_owned();
    let said_yes = tauri::async_runtime::spawn_blocking(move || ask(question))
        .await
        .map_err(|error| HostRefusal::new("io", error))?;
    if !said_yes {
        return Err(HostRefusal::new(
            "declined",
            "Nothing was sent because the confirmation window was cancelled.",
        ));
    }
    read_answer(send(app, ANSWER_CONFIRMED, Some(confirmed)).await?).await
}
