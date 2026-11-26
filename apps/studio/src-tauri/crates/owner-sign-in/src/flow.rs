//! The order of a sign-in and a sign-out. The shell's [`OwnerServer`] makes
//! the calls; this file decides what is sent when, and what is kept.

use std::future::Future;

use halonic_connect::{CheckedAddress, Resolver, Scheme, check_address, parse_address};
use halonic_secrets::SecretBackend;

use crate::answer::{OwnerAnswer, OwnerError};
use crate::hello::{StudioVersions, check_owner_hello};
use crate::stored::{StoredSession, session_from_set_cookie, session_name};

/// What one call to the server brought back.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Call<T> {
    Answered(T),
    /// Nothing answered in time, or the connection failed.
    NoAnswer,
    /// The secure connection failed on the server's certificate.
    InvalidCertificate,
}

/// The answer to `GET /api/hello`. `body` is `None` when it was too long or
/// isn't UTF-8.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HelloAnswer {
    pub status: u16,
    pub body: Option<String>,
}

/// The answer to `POST /api/login`: its status and its `Set-Cookie` values.
/// The body isn't read.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LoginAnswer {
    pub status: u16,
    pub set_cookies: Vec<String>,
}

/// One owner server at addresses [`owner_address`] checked. Every call goes
/// to those addresses only, without a proxy, and follows no redirect.
pub trait OwnerServer {
    /// `GET /api/hello`.
    fn hello(&self) -> impl Future<Output = Call<HelloAnswer>> + Send;
    /// `POST /api/login` with `{"password": …}`. The password goes nowhere else.
    fn login(&self, password: &str) -> impl Future<Output = Call<LoginAnswer>> + Send;
    /// `POST /api/logout` with the session. Whatever happens, the caller
    /// has already removed its copy.
    fn logout(&self, session: &str) -> impl Future<Output = ()> + Send;
}

/// The origin as the shell keys its session by, such as
/// `https://halonic.example:443`. Only `https://` is accepted, before any
/// name lookup.
pub fn owner_origin(origin: &str) -> Result<String, OwnerError> {
    let address = parse_address(origin).map_err(|_| OwnerError::NotAnAddress)?;
    if address.scheme != Scheme::Https {
        return Err(OwnerError::NotHttps);
    }
    Ok(address.to_string())
}

/// Checks the origin as [`owner_origin`] does, then looks its name up and
/// pins the addresses every call goes to, with the connect page's check.
pub fn owner_address(origin: &str, resolver: &dyn Resolver) -> Result<CheckedAddress, OwnerError> {
    owner_origin(origin)?;
    check_address(origin, resolver).map_err(|_| OwnerError::NotAnswering)
}

/// Signs in: the hello check first, the password only to a server that
/// passed it, and the session into the keychain under `origin`'s entry.
/// `origin` is [`owner_origin`]'s form; `now` is seconds since 1970.
pub async fn sign_in<S: OwnerServer>(
    server: &S,
    keychain: &dyn SecretBackend,
    origin: &str,
    password: &str,
    versions: &StudioVersions,
    now: u64,
) -> OwnerAnswer {
    match sign_in_steps(server, keychain, origin, password, versions, now).await {
        Ok(()) => OwnerAnswer::SignedIn,
        Err(code) => code.into(),
    }
}

async fn sign_in_steps<S: OwnerServer>(
    server: &S,
    keychain: &dyn SecretBackend,
    origin: &str,
    password: &str,
    versions: &StudioVersions,
    now: u64,
) -> Result<(), OwnerError> {
    let hello = reached(server.hello().await)?;
    check_owner_hello(hello.status, hello.body.as_deref().unwrap_or(""), versions)?;
    let login = reached(server.login(password).await)?;
    let session = match login.status {
        200 => session_from_set_cookie(login.set_cookies.iter().map(String::as_str))
            .ok_or(OwnerError::SignInFailed)?,
        401 => return Err(OwnerError::WrongPassword),
        429 => return Err(OwnerError::TooManyAttempts),
        _ => return Err(OwnerError::SignInFailed),
    };
    let stored = StoredSession {
        origin: origin.to_owned(),
        session,
        signed_in_at: now,
    };
    let value = serde_json::to_string(&stored).map_err(|_| OwnerError::Keychain)?;
    let name = session_name(origin).map_err(|_| OwnerError::Keychain)?;
    keychain
        .set(&name, &value)
        .map_err(|_| OwnerError::Keychain)
}

fn reached<T>(call: Call<T>) -> Result<T, OwnerError> {
    match call {
        Call::Answered(answer) => Ok(answer),
        Call::NoAnswer => Err(OwnerError::NotAnswering),
        Call::InvalidCertificate => Err(OwnerError::InvalidCertificate),
    }
}

/// Signs out: removes the local entry first, then asks the server to end
/// the session. `server` checks the address and connects; it runs only after
/// the removal, and is `None` when the address can't be checked. The
/// sign-out succeeds then too, and when the server doesn't answer.
pub async fn sign_out<S, F>(keychain: &dyn SecretBackend, origin: &str, server: F) -> OwnerAnswer
where
    S: OwnerServer,
    F: Future<Output = Option<S>>,
{
    let Ok(name) = session_name(origin) else {
        return OwnerError::Keychain.into();
    };
    // Read before the removal, so the server can still be told. A read that
    // fails never stops the removal.
    let stored = keychain
        .get(&name)
        .ok()
        .flatten()
        .and_then(|value| read_stored(&value, origin));
    if keychain.delete(&name).is_err() {
        return OwnerError::Keychain.into();
    }
    if let Some(stored) = stored
        && let Some(server) = server.await
    {
        server.logout(&stored.session).await;
    }
    OwnerAnswer::NotSignedIn
}

/// Whether the shell keeps a session for `origin`. The session itself stays
/// in Rust.
pub fn signed_in(keychain: &dyn SecretBackend, origin: &str) -> OwnerAnswer {
    let Ok(name) = session_name(origin) else {
        return OwnerError::Keychain.into();
    };
    match keychain.get(&name) {
        Ok(Some(value)) if read_stored(&value, origin).is_some() => OwnerAnswer::SignedIn,
        Ok(_) => OwnerAnswer::NotSignedIn,
        Err(_) => OwnerError::Keychain.into(),
    }
}

/// The stored session, only when it was made for `origin`.
pub(crate) fn read_stored(value: &str, origin: &str) -> Option<StoredSession> {
    let stored: StoredSession = serde_json::from_str(value).ok()?;
    (stored.origin == origin).then_some(stored)
}

#[cfg(test)]
#[path = "flow_tests.rs"]
mod tests;
