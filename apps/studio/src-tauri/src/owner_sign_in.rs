//! The `owner_login`, `owner_logout` and `owner_status` commands: the
//! desktop shell signs in to an owner's own server with its password and
//! keeps the session in the keychain, where only Rust reads it (HAL-18944).
//! What is sent when, and what is kept, lives in the `halonic-owner-sign-in`
//! crate; this file adds the calls, on exactly the addresses the connect
//! check pinned.

use std::error::Error;
use std::io;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use halonic_connect::{
    CheckedAddress, HELLO_TIMEOUT, Host, MAX_HELLO_BYTES, SystemResolver, TimedResolver, Version,
};
use halonic_owner_sign_in::{
    Call, HelloAnswer, LoginAnswer, OwnerAnswer, OwnerError, OwnerServer, SESSION_COOKIE,
    StudioVersions, owner_address, owner_origin, sign_in, sign_out, signed_in,
};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_http::reqwest;
use tauri_plugin_http::reqwest::header::{CONTENT_TYPE, COOKIE, SET_COOKIE};

use crate::secrets::SecretsState;

/// The oldest owner server this Studio signs in to. A server too old to say
/// its `mode` is refused whatever its version. Raise it when the shell
/// starts to need something newer.
const OLDEST_SERVER: &str = "0.1.0";

/// How long the sign-in call waits: the server hashes the password first.
const LOGIN_TIMEOUT: Duration = Duration::from_secs(15);

/// How long any call may take to connect, before its own time limit.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

/// An owner server at the checked addresses: `https` only, no proxy, no
/// redirects, and no second name lookup that could land somewhere else.
/// The run reads of `deployment_calls` go through it too.
pub(crate) struct PinnedServer {
    client: reqwest::Client,
    /// The origin with its port, such as `https://halonic.example:443`.
    origin: String,
}

impl PinnedServer {
    pub(crate) fn new(checked: &CheckedAddress) -> Option<Self> {
        let mut client = reqwest::Client::builder()
            .connect_timeout(CONNECT_TIMEOUT)
            .no_proxy()
            .https_only(true)
            .redirect(reqwest::redirect::Policy::none());
        if let Host::Name(name) = &checked.address.host {
            client = client.resolve_to_addrs(name, &checked.socket_addrs);
        }
        Some(Self {
            client: client.build().ok()?,
            origin: checked.address.to_string(),
        })
    }

    fn url(&self, path: &str) -> String {
        format!("{}{path}", self.origin)
    }

    /// A `GET` of `path` on the pinned addresses, with no time limit yet.
    pub(crate) fn get(&self, path: &str) -> reqwest::RequestBuilder {
        self.client.get(self.url(path))
    }
}

impl OwnerServer for PinnedServer {
    async fn hello(&self) -> Call<HelloAnswer> {
        let sent = self
            .client
            .get(self.url("/api/hello"))
            .timeout(HELLO_TIMEOUT);
        let mut response = match sent.send().await {
            Ok(response) => response,
            Err(error) => return failed(&error),
        };
        let status = response.status().as_u16();
        let mut bytes = Vec::new();
        // A body cut short is read as far as it came, and then isn't Halonic.
        while let Ok(Some(chunk)) = response.chunk().await {
            if bytes.len() + chunk.len() > MAX_HELLO_BYTES {
                return Call::Answered(HelloAnswer { status, body: None });
            }
            bytes.extend_from_slice(&chunk);
        }
        let body = String::from_utf8(bytes).ok();
        Call::Answered(HelloAnswer { status, body })
    }

    async fn login(&self, password: &str) -> Call<LoginAnswer> {
        let body = serde_json::json!({ "password": password }).to_string();
        let sent = self
            .client
            .post(self.url("/api/login"))
            .timeout(LOGIN_TIMEOUT)
            .header(CONTENT_TYPE, "application/json")
            .body(body);
        let response = match sent.send().await {
            Ok(response) => response,
            Err(error) => return failed(&error),
        };
        let set_cookies = response
            .headers()
            .get_all(SET_COOKIE)
            .iter()
            .filter_map(|value| value.to_str().ok())
            .map(str::to_owned)
            .collect();
        Call::Answered(LoginAnswer {
            status: response.status().as_u16(),
            set_cookies,
        })
    }

    async fn logout(&self, session: &str) {
        let sent = self
            .client
            .post(self.url("/api/logout"))
            .timeout(HELLO_TIMEOUT)
            .header(COOKIE, format!("{SESSION_COOKIE}={session}"))
            .send()
            .await;
        // The local copy is already gone, so the user is signed out either
        // way; the server ends the session itself when it expires.
        match sent {
            Ok(response) if response.status().is_success() => {}
            Ok(response) => halonic_shell_log::record(
                "owner-sign-in",
                format!(
                    "the server answered the sign-out with {}",
                    response.status()
                ),
            ),
            Err(_) => {
                halonic_shell_log::record("owner-sign-in", "the server didn't answer the sign-out")
            }
        }
    }
}

/// A call that got no HTTP answer: a certificate the secure connection
/// refused, or no answer at all.
pub(crate) fn failed<T>(error: &reqwest::Error) -> Call<T> {
    if is_certificate_error(error) {
        Call::InvalidCertificate
    } else {
        Call::NoAnswer
    }
}

/// Whether rustls refused the server's certificate somewhere in the chain.
/// An `io::Error` hides the error it wraps from `source`, so it is opened.
fn is_certificate_error(error: &(dyn Error + 'static)) -> bool {
    let mut next = Some(error);
    while let Some(current) = next {
        if let Some(rustls::Error::InvalidCertificate(_)) = current.downcast_ref::<rustls::Error>()
        {
            return true;
        }
        if let Some(inner) = current
            .downcast_ref::<io::Error>()
            .and_then(io::Error::get_ref)
            && is_certificate_error(inner)
        {
            return true;
        }
        next = current.source();
    }
    false
}

/// Checks the origin (`https` only, before any lookup) and pins its
/// addresses. The lookup blocks, so it runs on a worker thread.
pub(crate) async fn checked(origin: &str) -> Result<CheckedAddress, OwnerError> {
    owner_origin(origin)?;
    let input = origin.to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        owner_address(&input, &TimedResolver::new(SystemResolver, HELLO_TIMEOUT))
    })
    .await
    .unwrap_or(Err(OwnerError::NotAnswering))
}

/// Signs in to the owner server at `origin` with its password. The hello
/// check runs first; the password goes only to `POST /api/login` on the
/// checked addresses, and is never stored or logged.
#[tauri::command]
pub async fn owner_login<R: Runtime>(
    app: AppHandle<R>,
    origin: String,
    password: String,
) -> OwnerAnswer {
    let address = match checked(&origin).await {
        Ok(address) => address,
        Err(code) => return code.into(),
    };
    let Some(server) = PinnedServer::new(&address) else {
        return OwnerError::NotAnswering.into();
    };
    let keychain = app.state::<SecretsState>().owner_keychain();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_secs());
    let versions = studio_versions(&app);
    sign_in(
        &server,
        keychain.as_ref(),
        &server.origin,
        &password,
        &versions,
        now,
    )
    .await
}

/// Signs out of the owner server at `origin`: removes the local session
/// first, then tells the server. Succeeds when the server can't be reached.
#[tauri::command]
pub async fn owner_logout<R: Runtime>(app: AppHandle<R>, origin: String) -> OwnerAnswer {
    let canonical = match owner_origin(&origin) {
        Ok(canonical) => canonical,
        Err(code) => return code.into(),
    };
    // A stream that stayed open would go on reading the server's runs after
    // the session is forgotten.
    crate::deployment_calls::end_origin(&app, &canonical);
    let keychain = app.state::<SecretsState>().owner_keychain();
    let server = async {
        let address = checked(&origin).await.ok()?;
        PinnedServer::new(&address)
    };
    sign_out(keychain.as_ref(), &canonical, server).await
}

/// Whether the shell keeps a session for `origin`. Makes no call.
#[tauri::command]
pub async fn owner_status<R: Runtime>(app: AppHandle<R>, origin: String) -> OwnerAnswer {
    match owner_origin(&origin) {
        Ok(canonical) => signed_in(
            app.state::<SecretsState>().owner_keychain().as_ref(),
            &canonical,
        ),
        Err(code) => code.into(),
    }
}

/// This Studio's version, from the shell's package, and [`OLDEST_SERVER`].
fn studio_versions<R: Runtime>(app: &AppHandle<R>) -> StudioVersions {
    let version = |text: &str| Version::parse(text).expect("the shell's versions are valid");
    StudioVersions {
        studio: version(&app.package_info().version.to_string()),
        oldest_server: version(OLDEST_SERVER),
    }
}

#[cfg(test)]
mod tests {
    use rustls::CertificateError;

    use super::*;

    #[test]
    fn owner_sign_in_commands_tell_a_bad_certificate_apart() {
        let certificate = rustls::Error::InvalidCertificate(CertificateError::UnknownIssuer);
        let wrapped = io::Error::new(io::ErrorKind::InvalidData, certificate);
        assert!(is_certificate_error(&wrapped));
        let other = io::Error::new(io::ErrorKind::InvalidData, rustls::Error::DecryptError);
        assert!(!is_certificate_error(&other));
        assert!(!is_certificate_error(&io::Error::from(
            io::ErrorKind::ConnectionRefused
        )));
    }

    #[test]
    fn owner_sign_in_commands_know_this_studios_versions() {
        let app = crate::shell(tauri::test::mock_builder())
            .build(tauri::generate_context!())
            .expect("the shell builds on the mock runtime");
        let versions = studio_versions(app.handle());
        assert!(versions.oldest_server <= versions.studio, "{versions:?}");
    }
}
