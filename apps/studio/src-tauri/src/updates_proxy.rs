//! The updater's calls follow Halonic's proxy rules (HAL-12966), the ones
//! `http_fetch` and the CLI use, from the setting `http_fetch` read at
//! start: a local host or one on `NO_PROXY` goes direct, any other `https`
//! host through a CONNECT tunnel to the proxy `HTTPS_PROXY` names, and every
//! redirect hop is decided again. reqwest's own reading of the environment
//! (`HTTP_PROXY`, `ALL_PROXY`, upper case first) is switched off.
//!
//! An unusable setting stops the check and the download before anything is
//! sent, and nothing goes direct instead. Installing makes no call, so it
//! keeps the plain builder. When the proxy stopped a call, the status says
//! so rather than "offline" ([`proxy_fault`]). The bucket check for an
//! install Scoop updates doesn't go through the updater; it gets a client
//! on the same rules from [`client_for`].

use std::sync::Arc;

use halonic_http_guard::{ProxyEndpoint, ProxySetting, Refusal, Route, route_for};
use reqwest::redirect::Policy;
use reqwest::{Client, ClientBuilder, Proxy, Url};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_updater::{Error as UpdaterError, UpdaterBuilder, UpdaterExt};

use crate::http_fetch::HttpFetchState;

/// As many redirects as reqwest follows by default. More than the guard's
/// `MAX_REDIRECTS` for `http_fetch` (5): update servers and their download
/// mirrors redirect more, and every hop here is still decided by `route_for`.
const UPDATER_MAX_REDIRECTS: usize = 10;

/// Where a request `route_for` refuses is sent instead: port 0 on this
/// computer, which nothing can listen on, so the connection fails before
/// anything is sent. reqwest's custom proxy can only name a proxy or none,
/// and none would mean direct.
const REFUSED_PROXY: &str = "http://127.0.0.1:0";

/// The app's updater, its client on Halonic's proxy rules. `configure` adds
/// the caller's own client settings, as the updater keeps only one.
///
/// # Errors
///
/// `UpdaterError::Network` with the reason when the proxy setting is
/// unusable; the message never holds the proxy's user name or password.
pub(super) fn updater_on_proxy_rules<R: Runtime>(
    app: &AppHandle<R>,
    configure: impl Fn(ClientBuilder) -> ClientBuilder + Send + Sync + 'static,
) -> Result<UpdaterBuilder, UpdaterError> {
    let setting = app.state::<HttpFetchState>().proxy();
    usable(&setting)?;
    Ok(app
        .updater_builder()
        .configure_client(move |client| configure(on_proxy_rules(client, &setting))))
}

/// How the proxy, rather than the network or the update server, stopped a
/// call.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum ProxyFault {
    /// The setting is set but unusable, so nothing was sent.
    Setting,
    /// The call went through the proxy, and the proxy couldn't be reached
    /// or refused the tunnel.
    Unreachable,
}

/// Whether the proxy stopped a call that failed with `error`.
pub(super) fn proxy_fault<R: Runtime>(
    app: &AppHandle<R>,
    error: &UpdaterError,
) -> Option<ProxyFault> {
    fault_of(&app.state::<HttpFetchState>().proxy(), error)
}

/// Decided by the setting and by the route of the request that failed,
/// never by the error's message. A connection error on a request that went
/// direct (a local host, or one on `NO_PROXY`) isn't the proxy's.
fn fault_of(setting: &ProxySetting, error: &UpdaterError) -> Option<ProxyFault> {
    match error {
        UpdaterError::Reqwest(error) => request_fault(setting, error),
        _ => setting_fault(setting),
    }
}

/// The same for a call the updater doesn't make, such as the bucket check
/// for an install Scoop updates.
pub(super) fn request_fault(setting: &ProxySetting, error: &reqwest::Error) -> Option<ProxyFault> {
    match setting {
        ProxySetting::Proxy { .. } if error.is_connect() => {
            let tunnelled = error
                .url()
                .is_some_and(|url| matches!(route_for(url, setting), Ok(Route::Tunnel(_))));
            tunnelled.then_some(ProxyFault::Unreachable)
        }
        _ => setting_fault(setting),
    }
}

/// `Setting` when the setting is set but unusable, whatever the call did.
pub(super) fn setting_fault(setting: &ProxySetting) -> Option<ProxyFault> {
    matches!(setting, ProxySetting::Refused(_)).then_some(ProxyFault::Setting)
}

/// Fails for a setting that is set but unusable, as `route_for` does for
/// every public host; the updater talks only to public hosts.
fn usable(setting: &ProxySetting) -> Result<(), UpdaterError> {
    match setting {
        ProxySetting::Refused(message) => Err(UpdaterError::Network(format!(
            "{message} Nothing was sent."
        ))),
        ProxySetting::None | ProxySetting::Proxy { .. } => Ok(()),
    }
}

/// A client on Halonic's proxy rules for `url`, a call the updater doesn't
/// make. The updater insists on `https` for its first request; nothing does
/// here, so `url` is asked of `route_for` before the client is built, and a
/// URL it refuses is never sent direct instead.
///
/// # Errors
///
/// The refusal when `route_for` refuses `url`; its message never holds the
/// proxy's user name or password.
pub(super) fn client_for(url: &Url, setting: &Arc<ProxySetting>) -> Result<ClientBuilder, Refusal> {
    route_for(url, setting)?;
    Ok(on_proxy_rules(Client::builder(), setting))
}

/// No proxy from the environment; the proxy `route_for` picks for each
/// request instead, and a redirect policy that asks it again for every hop.
fn on_proxy_rules(client: ClientBuilder, setting: &Arc<ProxySetting>) -> ClientBuilder {
    let client = client
        .no_proxy()
        .redirect(redirect_policy(Arc::clone(setting)));
    match setting.as_ref() {
        ProxySetting::Proxy { endpoint, .. } => {
            client.proxy(tunnel_proxy(endpoint, Arc::clone(setting)))
        }
        ProxySetting::None | ProxySetting::Refused(_) => client,
    }
}

/// The proxy for the requests `route_for` tunnels, with the proxy's user
/// name and password on the CONNECT line only. A request `route_for`
/// refuses (plain `http` to a public host) fails at [`REFUSED_PROXY`] and
/// never goes direct, whatever the updater allows for its endpoints and
/// download; the redirect policy refuses such a hop before that.
fn tunnel_proxy(endpoint: &ProxyEndpoint, setting: Arc<ProxySetting>) -> Proxy {
    let proxy = Proxy::custom(move |url| match route_for(url, &setting) {
        Ok(Route::Tunnel(endpoint)) => Some(endpoint.url()),
        Ok(Route::Direct) => None,
        Err(_) => Some(REFUSED_PROXY.to_owned()),
    });
    match endpoint.credentials() {
        Some((username, password)) => proxy.basic_auth(username, password),
        None => proxy,
    }
}

/// Follows up to [`UPDATER_MAX_REDIRECTS`] hops, each only where `route_for` allows
/// it: a plain `http` hop to a public host while a proxy is set is refused.
fn redirect_policy(setting: Arc<ProxySetting>) -> Policy {
    Policy::custom(move |attempt| {
        // The first URL in `previous` is the request's own, not a redirect.
        if attempt.previous().len() > UPDATER_MAX_REDIRECTS {
            return attempt.error("too many redirects");
        }
        match route_for(attempt.url(), &setting) {
            Ok(_) => attempt.follow(),
            Err(refusal) => attempt.error(refusal),
        }
    })
}

#[cfg(test)]
#[path = "updates_proxy_tests.rs"]
mod tests;
