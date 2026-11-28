//! Routes that name one of the shell's own operations instead of a method
//! and a path: `ActionOperationRoute` in `@halonicjs/ports` (requirement
//! `ports.action-operation-route`; plan OK on HAL-21110). The list may only
//! name an operation the shell has, for that operation's one service, with
//! exactly the placeholders and body the operation takes, so the catalog
//! can't widen what an operation does or turn its secret into a page value.

use std::collections::BTreeMap;

use crate::call::{Refusal, SendRequest, check_placeholders};
use crate::kinds::Risk;
use crate::pattern::Pattern;
use crate::routes::{BodyKind, RouteFile, StepKey, body_field, placeholders};

/// Each operation the shell runs and the one service it belongs to: the
/// same list as `actionOperations` in `@halonicjs/ports`, which a test
/// checks against the shared golden file.
pub const OPERATIONS: [(&str, &str); 1] = [("paperclip.set-secret", "paperclip")];

/// An operation the shell runs itself.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Operation {
    /// Creates or rotates one named secret in Paperclip Secrets.
    PaperclipSetSecret,
}

impl Operation {
    fn named(name: &str) -> Option<Self> {
        match name {
            "paperclip.set-secret" => Some(Self::PaperclipSetSecret),
            _ => None,
        }
    }

    /// The operation's name, as the list writes it.
    pub fn name(self) -> &'static str {
        match self {
            Self::PaperclipSetSecret => "paperclip.set-secret",
        }
    }

    /// The service the operation belongs to.
    pub fn service(self) -> &'static str {
        match self {
            Self::PaperclipSetSecret => "paperclip",
        }
    }

    /// The placeholders the operation takes: for `paperclip.set-secret` the
    /// Paperclip's host and company prefix the preview shows, and the
    /// secret's name.
    fn placeholder_names(self) -> &'static [&'static str] {
        match self {
            Self::PaperclipSetSecret => &["company", "host", "name"],
        }
    }

    /// The body fields the operation takes, each a `secret-input` the user
    /// types into the shell's dialog: never a value the page sends.
    fn secret_names(self) -> &'static [&'static str] {
        match self {
            Self::PaperclipSetSecret => &["value"],
        }
    }

    /// The risk the operation's step must have: creating or rotating a
    /// secret is `admin`, so the shell always asks.
    fn risk(self) -> Risk {
        match self {
            Self::PaperclipSetSecret => Risk::Admin,
        }
    }
}

/// A step the shell runs as one of its operations.
#[derive(Debug, Clone)]
pub struct OperationRoute {
    pub operation: Operation,
    pub risk: Risk,
    pub placeholders: BTreeMap<String, Pattern>,
}

/// Reads an operation route, or says what is wrong with it.
pub(crate) fn operation_route(mut route: RouteFile) -> Result<OperationRoute, String> {
    if route.method.is_some()
        || route.path.is_some()
        || route.address.is_some()
        || route.target.is_some()
    {
        return Err("an operation has no method, path, address or target".to_owned());
    }
    let name = route
        .operation
        .as_deref()
        .ok_or("an operation route needs an operation")?;
    let operation =
        Operation::named(name).ok_or_else(|| format!("the shell has no operation `{name}`"))?;
    if route.service != operation.service() {
        return Err(format!(
            "the operation `{name}` belongs to `{}`, not `{}`",
            operation.service(),
            route.service
        ));
    }
    if route.risk != operation.risk() {
        return Err(format!("the operation `{name}` has the wrong risk"));
    }
    if route.keep.as_ref().is_some_and(|keep| !keep.is_empty()) {
        return Err("an operation keeps nothing of its answers".to_owned());
    }
    let body = route
        .body
        .take()
        .unwrap_or_default()
        .into_iter()
        .map(body_field)
        .collect::<Result<Vec<_>, _>>()?;
    let secrets_only = body.len() == operation.secret_names().len()
        && body
            .iter()
            .zip(operation.secret_names())
            .all(|(field, name)| field.name == *name && field.kind == BodyKind::SecretInput);
    if !secrets_only {
        return Err(format!(
            "the operation `{name}` takes only its secret fields, typed into the shell's dialog"
        ));
    }
    let placeholders = placeholders(&route, operation.placeholder_names())?;
    Ok(OperationRoute {
        operation,
        risk: route.risk,
        placeholders,
    })
}

/// An operation step ready to run: its route and the placeholder values the
/// page sent, after their patterns passed.
pub type OperationStep<'a> = (&'a OperationRoute, &'a BTreeMap<String, String>);

/// The operation a send request names, with its placeholder values after
/// their patterns passed. `None` when the step isn't an operation; a
/// refusal when its values don't fit or the page sent a body, which an
/// operation never takes from the page.
pub fn operation_step<'a>(
    operations: &'a BTreeMap<StepKey, OperationRoute>,
    request: &'a SendRequest,
) -> Option<Result<OperationStep<'a>, Refusal>> {
    let key = StepKey {
        definition: request.definition.clone(),
        version: request.version,
        step: request.step,
    };
    let route = operations.get(&key)?;
    if !request.body.is_empty() {
        return Some(Err(Refusal::BadValue));
    }
    Some(
        check_placeholders(&route.placeholders, &request.placeholders)
            .map(|()| (route, &request.placeholders)),
    )
}
