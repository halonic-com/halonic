//! Requirement `owner-sign-in-commands`: what is sent when, and what is kept,
//! against a fake server that answers at once.

use std::future::{Future, ready};
use std::io;
use std::net::SocketAddr;
use std::pin::pin;
use std::sync::{Arc, Mutex, PoisonError};
use std::task::{Context, Poll, Waker};

use halonic_connect::Version;
use halonic_secrets::{MemoryBackend, SecretBackend};

use super::*;
use crate::stored::SESSION_COOKIE;

const ORIGIN: &str = "https://halonic.example:443";
const PASSWORD: &str = "a-test-password";
const TOKEN: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

/// Drives a future whose calls all answer at once.
fn run<F: Future>(future: F) -> F::Output {
    let mut future = pin!(future);
    match future
        .as_mut()
        .poll(&mut Context::from_waker(Waker::noop()))
    {
        Poll::Ready(output) => output,
        Poll::Pending => panic!("the fake server answers at once"),
    }
}

/// Answers with fixed replies and writes down every call. At sign-out it
/// also writes down whether the local entry was still there. A clone shares
/// the calls.
#[derive(Clone)]
struct FakeServer {
    hello: Call<HelloAnswer>,
    login: Call<LoginAnswer>,
    calls: Arc<Mutex<Vec<String>>>,
    keychain: Arc<MemoryBackend>,
}

impl FakeServer {
    fn new(keychain: &Arc<MemoryBackend>, mode: &str, login: Call<LoginAnswer>) -> Self {
        let body = format!(
            r#"{{"product":"halonic","version":"0.2.0","minAppVersion":"0.1.0","mode":"{mode}","minStudioVersion":"0.1.0"}}"#
        );
        Self {
            hello: Call::Answered(HelloAnswer {
                status: 200,
                body: Some(body),
            }),
            login,
            calls: Arc::default(),
            keychain: Arc::clone(keychain),
        }
    }

    fn note(&self, call: String) {
        self.calls
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push(call);
    }

    fn calls(&self) -> Vec<String> {
        self.calls
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }
}

impl OwnerServer for FakeServer {
    fn hello(&self) -> impl Future<Output = Call<HelloAnswer>> + Send {
        self.note("hello".to_owned());
        ready(self.hello.clone())
    }

    fn login(&self, password: &str) -> impl Future<Output = Call<LoginAnswer>> + Send {
        self.note(format!("login {password}"));
        ready(self.login.clone())
    }

    fn logout(&self, session: &str) -> impl Future<Output = ()> + Send {
        let kept = signed_in(&*self.keychain, ORIGIN) == OwnerAnswer::SignedIn;
        self.note(format!("logout {session}, entry kept: {kept}"));
        ready(())
    }
}

fn signed_in_answer() -> Call<LoginAnswer> {
    Call::Answered(LoginAnswer {
        status: 200,
        set_cookies: vec![format!(
            "{SESSION_COOKIE}={TOKEN}; Path=/; Secure; HttpOnly"
        )],
    })
}

fn versions() -> StudioVersions {
    let v = |text| Version::parse(text).expect("a test version");
    StudioVersions {
        studio: v("0.2.0"),
        oldest_server: v("0.1.0"),
    }
}

fn sign_in_to(server: &FakeServer) -> OwnerAnswer {
    let keychain = Arc::clone(&server.keychain);
    run(sign_in(
        server,
        &*keychain,
        ORIGIN,
        PASSWORD,
        &versions(),
        1_700_000_000,
    ))
}

/// A resolver that must never be asked.
struct NoLookup;

impl Resolver for NoLookup {
    fn resolve(&self, name: &str, _port: u16) -> io::Result<Vec<SocketAddr>> {
        panic!("{name} was looked up");
    }
}

#[test]
fn owner_sign_in_commands_refuse_an_http_origin_before_any_lookup() {
    for origin in ["http://halonic.example", "halonic.example:4280"] {
        assert_eq!(
            owner_address(origin, &NoLookup).map(|_| ()),
            Err(OwnerError::NotHttps)
        );
    }
    assert_eq!(
        owner_address("https://halonic.example/studio", &NoLookup).map(|_| ()),
        Err(OwnerError::NotAnAddress)
    );
    assert_eq!(
        owner_origin(" https://Halonic.Example/ "),
        Ok(ORIGIN.to_owned())
    );
}

#[test]
fn owner_sign_in_commands_send_no_password_to_a_many_user_server() {
    let keychain = Arc::new(MemoryBackend::new());
    let server = FakeServer::new(&keychain, "many", signed_in_answer());
    assert_eq!(
        sign_in_to(&server),
        OwnerAnswer::from(OwnerError::ManyUserServer)
    );
    assert_eq!(server.calls(), ["hello"]);
    assert_eq!(signed_in(&*keychain, ORIGIN), OwnerAnswer::NotSignedIn);
}

#[test]
fn owner_sign_in_commands_send_no_password_past_a_bad_certificate() {
    let keychain = Arc::new(MemoryBackend::new());
    let mut server = FakeServer::new(&keychain, "owner", signed_in_answer());
    server.hello = Call::InvalidCertificate;
    assert_eq!(
        sign_in_to(&server),
        OwnerAnswer::from(OwnerError::InvalidCertificate)
    );
    assert_eq!(server.calls(), ["hello"]);
}

#[test]
fn owner_sign_in_commands_keep_the_session_after_a_sign_in() {
    let keychain = Arc::new(MemoryBackend::new());
    let server = FakeServer::new(&keychain, "owner", signed_in_answer());
    assert_eq!(sign_in_to(&server), OwnerAnswer::SignedIn);
    assert_eq!(
        server.calls(),
        ["hello".to_owned(), format!("login {PASSWORD}")]
    );
    let name = crate::stored::session_name(ORIGIN).expect("a name");
    let value = keychain.get(&name).expect("readable").expect("stored");
    let stored: StoredSession = serde_json::from_str(&value).expect("the stored form");
    assert_eq!(stored.origin, ORIGIN);
    assert_eq!(stored.session, TOKEN);
    assert_eq!(stored.signed_in_at, 1_700_000_000);
    assert!(!value.contains(PASSWORD));
    assert_eq!(signed_in(&*keychain, ORIGIN), OwnerAnswer::SignedIn);
    let other = "https://halonic.example:8443";
    assert_eq!(signed_in(&*keychain, other), OwnerAnswer::NotSignedIn);
}

#[test]
fn owner_sign_in_commands_keep_nothing_when_the_server_refuses() {
    for (status, code) in [
        (401, OwnerError::WrongPassword),
        (429, OwnerError::TooManyAttempts),
        (500, OwnerError::SignInFailed),
    ] {
        let keychain = Arc::new(MemoryBackend::new());
        let refused = Call::Answered(LoginAnswer {
            status,
            set_cookies: Vec::new(),
        });
        let server = FakeServer::new(&keychain, "owner", refused);
        assert_eq!(sign_in_to(&server), OwnerAnswer::from(code), "{status}");
        assert_eq!(signed_in(&*keychain, ORIGIN), OwnerAnswer::NotSignedIn);
    }
}

#[test]
fn owner_sign_in_commands_remove_the_entry_before_telling_the_server() {
    let keychain = Arc::new(MemoryBackend::new());
    let server = FakeServer::new(&keychain, "owner", signed_in_answer());
    assert_eq!(sign_in_to(&server), OwnerAnswer::SignedIn);
    let answer = run(sign_out(&*keychain, ORIGIN, ready(Some(server.clone()))));
    assert_eq!(answer, OwnerAnswer::NotSignedIn);
    let logout = format!("logout {TOKEN}, entry kept: false");
    assert_eq!(server.calls().last(), Some(&logout));
}

#[test]
fn owner_sign_in_commands_sign_out_when_the_server_cant_be_reached() {
    let keychain = Arc::new(MemoryBackend::new());
    let server = FakeServer::new(&keychain, "owner", signed_in_answer());
    assert_eq!(sign_in_to(&server), OwnerAnswer::SignedIn);
    let answer = run(sign_out(&*keychain, ORIGIN, ready(None::<FakeServer>)));
    assert_eq!(answer, OwnerAnswer::NotSignedIn);
    assert_eq!(signed_in(&*keychain, ORIGIN), OwnerAnswer::NotSignedIn);
    let again = run(sign_out(&*keychain, ORIGIN, ready(None::<FakeServer>)));
    assert_eq!(again, OwnerAnswer::NotSignedIn);
}
