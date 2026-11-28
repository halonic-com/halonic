//! `paperclip.set-secret`: creates or rotates one named secret in Paperclip
//! Secrets with the admin key (architecture note on HAL-17491, row C1; plan
//! OK on HAL-21110). Paperclip needs a lookup before the write, so this is an
//! operation in the shell's own code, and its calls are only those of
//! [`crate::paperclip_calls`].
//!
//! The connection is the one the admin key was signed in for, read from the
//! keychain, never from the page. Before it asks for the value, the
//! operation checks that the step names that connection's host and the
//! company prefix Paperclip gives for that connection's company, so the
//! secret can't land anywhere the preview didn't show, and that the key
//! still reaches the company (`/api/cli-auth/me`). The value is typed into
//! the shell's native dialog and goes into the body of the one write that
//! sets it: never to the page, the result or a log line.

use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::{Map, Value};

use crate::answer::{MORE_THAN_ONE, cleaned_text, redirect_text};
use crate::ask::{AskSheet, TypedText, checked};
use crate::call::Refusal;
use crate::paperclip_admin::{PaperclipConnection, admin_session};
use crate::paperclip_calls::{PaperclipCall, is_allowed, is_paperclip_id, json_body};
use crate::send::{Answer, ConfirmSheet, Dialogs, Outgoing, SendResult, Transport};
use crate::sign_in::{Clock, Keychain};
use crate::wipe::Wiped;

/// The operation's name, as `actionOperations` in `@halonicjs/ports` has it.
pub const SET_SECRET: &str = "paperclip.set-secret";

/// The status Paperclip answers a create with when the secret already exists.
const CONFLICT: u16 = 409;

/// What the value dialog says when the write replaces a value in use.
const REPLACES: &str = "the value this secret has now, for everyone using it";

/// What the step names, from its placeholders after their patterns passed.
#[derive(Debug, Clone, Copy)]
pub struct SetSecretStep<'a> {
    /// The secret's name, which is also its key, such as `ACME_API_KEY`.
    pub name: &'a str,
    /// The Paperclip's host the preview showed.
    pub host: &'a str,
    /// The company prefix the preview showed, such as `ACME`.
    pub company: &'a str,
}

/// The admin key's sign-in, for one run of the operation.
struct Admin {
    connection: PaperclipConnection,
    user: String,
    key: Wiped,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Owner {
    company_ids: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Company {
    issue_prefix: String,
}

#[derive(Deserialize)]
struct CatalogEntry {
    id: String,
    name: String,
    key: Option<String>,
    status: Option<String>,
}

#[derive(Deserialize)]
struct Failure {
    error: String,
}

/// Everything the operation needs from the shell.
pub struct SetSecret<'a, T, K, C, D> {
    pub transport: &'a T,
    pub keychain: &'a K,
    pub clock: &'a C,
    pub dialogs: &'a D,
    /// Takes one line for the shell's log. Never given the key or the value.
    pub log: &'a (dyn Fn(String) + Sync),
}

impl<T: Transport, K: Keychain, C: Clock, D: Dialogs> SetSecret<'_, T, K, C, D> {
    /// Creates or rotates the step's secret, or says why it didn't.
    pub async fn run(&self, step: SetSecretStep<'_>) -> SendResult {
        let Some(admin) = self.admin().await else {
            return self.refused(Refusal::SignedOut);
        };
        if !names_host(&admin.connection.origin, step.host) {
            return self.refused(Refusal::BadValue);
        }
        if let Err(result) = self.check_company(&admin, step.company).await {
            return result;
        }
        // Looked up before the dialog, so it shows the call the shell makes.
        let existing = match self.find(&admin, step.name).await {
            Ok(existing) => existing,
            Err(result) => return result,
        };
        let value = match self.ask(&admin, step, existing.as_deref()).await {
            Ok(value) => value,
            Err(result) => return result,
        };
        let hidden = [admin.key.as_str(), value.as_str()];
        match self.set(&admin, step.name, existing, &value).await {
            Ok(answer) => self.answered(&answer, &hidden),
            Err(result) => result,
        }
    }

    async fn admin(&self) -> Option<Admin> {
        let now = self.clock.now();
        match self
            .keychain
            .with_backend(move |backend| admin_session(backend, now))
            .await
        {
            Ok(session) => session.map(|(connection, user, key)| Admin {
                connection,
                user,
                key: Wiped::text(key),
            }),
            Err(error) => {
                (self.log)(error.log_message(&format!("action_send {SET_SECRET}")));
                None
            }
        }
    }

    /// The key must still reach the connection's company, and the company's
    /// prefix must be the one the preview showed.
    async fn check_company(&self, admin: &Admin, shown: &str) -> Result<(), SendResult> {
        let owner: Owner = self.read(admin, &PaperclipCall::WhoAmI).await?;
        if !owner.company_ids.contains(&admin.connection.company) {
            return Err(self.refused(Refusal::SignedOut));
        }
        let company: Company = self.read(admin, &PaperclipCall::Company).await?;
        if company.issue_prefix != shown {
            return Err(self.refused(Refusal::BadValue));
        }
        Ok(())
    }

    /// Asks for the value in the native dialog, showing the account, the
    /// call the shell will make and the secret's name: a rotate of
    /// `existing`, which replaces a value others may be using, or a create.
    /// Nothing is sent when the user closes it or leaves the value empty.
    async fn ask(
        &self,
        admin: &Admin,
        step: SetSecretStep<'_>,
        existing: Option<&str>,
    ) -> Result<TypedText, SendResult> {
        let company = &admin.connection.company;
        let call = existing.map_or(PaperclipCall::Create, |secret| PaperclipCall::Rotate {
            secret: secret.to_owned(),
        });
        let address = call
            .address(&admin.connection.origin, company)
            .map_or_else(String::new, |address| address.to_string());
        let mut fields = vec![
            ("name".to_owned(), Value::from(step.name).to_string()),
            ("company".to_owned(), Value::from(step.company).to_string()),
        ];
        if existing.is_some() {
            fields.push(("replaces".to_owned(), REPLACES.to_owned()));
        }
        let sheet = AskSheet {
            confirm: ConfirmSheet {
                account: admin.user.clone(),
                method: call.method(),
                address,
                fields,
            },
            target: None,
            secrets: vec!["value".to_owned()],
        };
        let typed = self
            .dialogs
            .ask(&sheet)
            .await
            .ok_or(SendResult::Cancelled)?;
        let Ok(mut secrets) = checked(&sheet, typed) else {
            (self.log)(format!(
                "action_send {SET_SECRET}: not sent, the value was left empty"
            ));
            return Err(SendResult::Cancelled);
        };
        secrets
            .pop()
            .map(|(_, value)| value)
            .ok_or(SendResult::Cancelled)
    }

    /// Rotates `existing`, the secret the catalog had before the dialog, and
    /// creates it when there was none. A create that finds the secret made
    /// meanwhile reads the catalog once more and rotates what it finds; it
    /// never loops.
    async fn set(
        &self,
        admin: &Admin,
        name: &str,
        existing: Option<String>,
        value: &TypedText,
    ) -> Result<Answer, SendResult> {
        if let Some(secret) = existing {
            return self.rotate(admin, &secret, value).await;
        }
        let body = json_body(&[("name", name), ("key", name), ("value", value.as_str())]);
        let created = self
            .call(admin, &PaperclipCall::Create, None, Some(body))
            .await?;
        if created.status != CONFLICT {
            return Ok(created);
        }
        match self.find(admin, name).await? {
            Some(secret) => self.rotate(admin, &secret, value).await,
            None => Ok(created),
        }
    }

    async fn rotate(
        &self,
        admin: &Admin,
        secret: &str,
        value: &TypedText,
    ) -> Result<Answer, SendResult> {
        let call = PaperclipCall::Rotate {
            secret: secret.to_owned(),
        };
        let body = json_body(&[("value", value.as_str())]);
        self.call(admin, &call, Some(secret), Some(body)).await
    }

    /// The id of the secret named `name` in the catalog, which lists ids,
    /// names, keys and states, never values. A deleted secret doesn't count.
    async fn find(&self, admin: &Admin, name: &str) -> Result<Option<String>, SendResult> {
        let entries: Vec<CatalogEntry> = self.read(admin, &PaperclipCall::Catalog).await?;
        let mut matches = entries.into_iter().filter(|entry| {
            let named = entry.key.as_deref() == Some(name) || entry.name == name;
            named && entry.status.as_deref() != Some("deleted")
        });
        let Some(found) = matches.next() else {
            return Ok(None);
        };
        if matches.next().is_some() {
            return Err(SendResult::Answered {
                status: 200,
                kept: Map::new(),
                error: Some(MORE_THAN_ONE.to_owned()),
            });
        }
        if !is_paperclip_id(&found.id) {
            return Err(self.refused(Refusal::BadValue));
        }
        Ok(Some(found.id))
    }

    /// A read the operation needs: its answer's body, or the result to give
    /// when it failed.
    async fn read<A: DeserializeOwned>(
        &self,
        admin: &Admin,
        call: &PaperclipCall,
    ) -> Result<A, SendResult> {
        let answer = self.call(admin, call, None, None).await?;
        if answer.status != 200 {
            return Err(self.answered(&answer, &[admin.key.as_str()]));
        }
        serde_json::from_slice(&answer.body).map_err(|_| SendResult::Answered {
            status: answer.status,
            kept: Map::new(),
            error: Some("Paperclip's answer couldn't be read.".to_owned()),
        })
    }

    /// Sends one of the admin key's calls, after checking it against the
    /// list once more. `rotating` is the only secret a rotate may name.
    async fn call(
        &self,
        admin: &Admin,
        call: &PaperclipCall,
        rotating: Option<&str>,
        body: Option<Vec<u8>>,
    ) -> Result<Answer, SendResult> {
        let company = &admin.connection.company;
        let Some(address) = call.address(&admin.connection.origin, company) else {
            return Err(self.refused(Refusal::BadValue));
        };
        if address.query().is_some()
            || !is_allowed(call.method(), address.path(), company, rotating)
        {
            (self.log)(format!(
                "action_send {SET_SECRET}: a call outside the admin key's list was refused"
            ));
            return Err(self.refused(Refusal::NotInCatalog));
        }
        let mut headers = vec![
            ("accept".to_owned(), "application/json".to_owned()),
            (
                "authorization".to_owned(),
                format!("Bearer {}", admin.key.as_str()),
            ),
        ];
        if body.is_some() {
            headers.push(("content-type".to_owned(), "application/json".to_owned()));
        }
        let outgoing = Outgoing {
            method: call.method(),
            address,
            headers,
            body,
        };
        let answer = self.transport.send(outgoing).await.map_err(|_| {
            (self.log)(format!("action_send {SET_SECRET}: unreachable"));
            SendResult::Unreachable
        })?;
        if (300..400).contains(&answer.status) {
            (self.log)(format!(
                "action_send {SET_SECRET}: Paperclip answered {}, a redirect",
                answer.status
            ));
            return Err(SendResult::Answered {
                status: answer.status,
                kept: Map::new(),
                error: Some(redirect_text()),
            });
        }
        Ok(answer)
    }

    /// The result for the write's answer: its status, nothing kept, and for
    /// a failure Paperclip's message without the key or the value.
    fn answered(&self, answer: &Answer, hidden: &[&str]) -> SendResult {
        (self.log)(format!(
            "action_send {SET_SECRET}: Paperclip answered {}",
            answer.status
        ));
        let error = if (200..300).contains(&answer.status) {
            None
        } else {
            let text = serde_json::from_slice::<Failure>(&answer.body).map_or_else(
                |_| format!("Paperclip answered {}.", answer.status),
                |failure| failure.error,
            );
            Some(cleaned_text(&text, hidden))
        };
        SendResult::Answered {
            status: answer.status,
            kept: Map::new(),
            error,
        }
    }

    fn refused(&self, reason: Refusal) -> SendResult {
        (self.log)(format!("action_send {SET_SECRET}: refused ({reason:?})"));
        SendResult::Refused { reason }
    }
}

/// Whether `host` is the host of `origin`, the connection's own address.
fn names_host(origin: &str, host: &str) -> bool {
    url::Url::parse(origin)
        .ok()
        .and_then(|origin| {
            origin
                .host_str()
                .map(|name| name.eq_ignore_ascii_case(host))
        })
        .unwrap_or(false)
}
