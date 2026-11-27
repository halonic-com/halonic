//! Fakes for the send tests: the network, the keychain and the native
//! dialogs, with the invented `acme` route list. Nothing here touches a real
//! keychain or the network.

#![allow(dead_code)]

use std::future::Future;
use std::pin::pin;
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll, Wake, Waker};
use std::thread::{self, Thread};

use halonic_action_send::account::{self, Account};
use halonic_action_send::{
    Answer, AskSheet, ConfirmSheet, Dialogs, Outgoing, RouteList, Sender, Tokens, Transport, Typed,
    TypedText,
};
use halonic_secrets::{MemoryBackend, SecretError};

/// The invented route list.
pub const ACME_ROUTES: &str = include_str!("../fixtures/acme-routes.json");

/// An invented token. It isn't key-shaped, so only the shell's own check
/// for the token's value can keep it out of a result or a log line.
pub const TOKEN: &str = "acme-user-token-0001";

/// Seconds since 1970 that the tests treat as now.
pub const NOW: u64 = 1_790_000_000;

pub fn routes() -> RouteList {
    RouteList::parse(ACME_ROUTES).expect("the acme route list loads")
}

/// Runs a future on this thread. The fakes never wait, so it needs no runtime.
pub fn block_on<F: Future>(future: F) -> F::Output {
    struct Unpark(Thread);
    impl Wake for Unpark {
        fn wake(self: Arc<Self>) {
            self.0.unpark();
        }
    }
    let waker = Waker::from(Arc::new(Unpark(thread::current())));
    let mut context = Context::from_waker(&waker);
    let mut future = pin!(future);
    loop {
        if let Poll::Ready(output) = future.as_mut().poll(&mut context) {
            return output;
        }
        thread::park();
    }
}

/// The network: records every call and answers with what the test set.
#[derive(Default)]
pub struct FakeNetwork {
    pub calls: Mutex<Vec<Outgoing>>,
    pub answer: Mutex<Option<Result<Answer, String>>>,
}

impl FakeNetwork {
    pub fn answering(answer: Result<Answer, String>) -> Self {
        Self {
            calls: Mutex::default(),
            answer: Mutex::new(Some(answer)),
        }
    }

    pub fn calls(&self) -> std::sync::MutexGuard<'_, Vec<Outgoing>> {
        self.calls.lock().expect("not poisoned")
    }
}

impl Transport for FakeNetwork {
    fn send(&self, call: Outgoing) -> impl Future<Output = Result<Answer, String>> + Send {
        self.calls.lock().expect("not poisoned").push(call);
        let answer = self
            .answer
            .lock()
            .expect("not poisoned")
            .take()
            .unwrap_or_else(|| {
                Ok(Answer {
                    status: 204,
                    ..Answer::default()
                })
            });
        async move { answer }
    }
}

/// The keychain, in memory.
pub struct FakeKeychain {
    pub backend: MemoryBackend,
    pub now: u64,
}

impl FakeKeychain {
    pub fn signed_in() -> Self {
        let keychain = Self::signed_out();
        account::store(
            &keychain.backend,
            "github",
            "acme-admin",
            TOKEN,
            NOW + 3_600,
        )
        .expect("stores");
        keychain
    }

    pub fn signed_out() -> Self {
        Self {
            backend: MemoryBackend::new(),
            now: NOW,
        }
    }
}

impl Tokens for FakeKeychain {
    fn token(
        &self,
        service: &str,
    ) -> impl Future<Output = Result<Option<(Account, String)>, SecretError>> + Send {
        let token = account::token(&self.backend, service, self.now);
        async move { token }
    }
}

/// What the stand-in user types into the dialog with text fields: the
/// target's name and each secret, or `None` to close it.
pub type TypedAnswer = Option<(Option<&'static str>, Vec<(&'static str, &'static str)>)>;

/// The native dialogs: answers with what the test set and records each sheet.
pub struct FakeDialogs {
    pub answer: bool,
    pub sheets: Mutex<Vec<ConfirmSheet>>,
    pub typed: TypedAnswer,
    pub asked: Mutex<Vec<AskSheet>>,
}

impl FakeDialogs {
    pub fn answering(answer: bool) -> Self {
        Self {
            answer,
            sheets: Mutex::default(),
            typed: None,
            asked: Mutex::default(),
        }
    }

    /// A user who types `typed` into the dialog with text fields.
    pub fn typing(typed: TypedAnswer) -> Self {
        Self {
            typed,
            ..Self::answering(true)
        }
    }

    pub fn asked(&self) -> Vec<AskSheet> {
        self.asked.lock().expect("not poisoned").clone()
    }
}

impl Dialogs for FakeDialogs {
    fn confirm(&self, sheet: &ConfirmSheet) -> impl Future<Output = bool> + Send {
        self.sheets
            .lock()
            .expect("not poisoned")
            .push(sheet.clone());
        let answer = self.answer;
        async move { answer }
    }

    fn ask(&self, sheet: &AskSheet) -> impl Future<Output = Option<Typed>> + Send {
        self.asked.lock().expect("not poisoned").push(sheet.clone());
        let typed = self.typed.as_ref().map(|(target, secrets)| Typed {
            target: target.map(|name| TypedText::new(name.to_owned())),
            secrets: secrets
                .iter()
                .map(|(name, value)| ((*name).to_owned(), TypedText::new((*value).to_owned())))
                .collect(),
        });
        async move { typed }
    }
}

/// The shell's log, kept in memory.
#[derive(Default)]
pub struct FakeLog(pub Mutex<Vec<String>>);

impl FakeLog {
    pub fn record(&self) -> impl Fn(String) + Sync + '_ {
        |line| self.0.lock().expect("not poisoned").push(line)
    }

    pub fn lines(&self) -> Vec<String> {
        self.0.lock().expect("not poisoned").clone()
    }
}

/// Builds a sender from the fakes and runs one send.
pub fn send_with(
    routes: &RouteList,
    network: &FakeNetwork,
    keychain: &FakeKeychain,
    dialogs: &FakeDialogs,
    log: &FakeLog,
    request: serde_json::Value,
) -> halonic_action_send::SendResult {
    let request = serde_json::from_value(request).expect("a well-formed request");
    let record = log.record();
    let sender = Sender {
        routes,
        transport: network,
        tokens: keychain,
        dialogs,
        log: &record,
    };
    block_on(sender.send(&request))
}
