//! One connection to the gateway: TCP, TLS for a `wss:` or `https:`
//! endpoint, then the WebSocket upgrade. `tokio-tungstenite` does only the
//! upgrade and the frames; the TLS is ours, from the caller's rustls config
//! (HAL-12354), so there is one TLS stack and one root store in the app.

use std::io;
use std::sync::Arc;
use std::time::Duration;

use rustls::ClientConfig;
use rustls::pki_types::ServerName;
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::net::TcpStream;
use tokio_rustls::TlsConnector;
use tokio_tungstenite::tungstenite::protocol::WebSocketConfig;
use tokio_tungstenite::{WebSocketStream, client_async_with_config};

use crate::endpoint::Endpoint;
use crate::frames::MAX_FRAME_BYTES;

/// How long one try may take, from the TCP connect to the upgrade.
pub const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

/// Why a try to connect failed, told apart only as far as the phone can see
/// it. None of these is ever Removed or "Can't confirm".
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConnectError {
    /// The phone's own network is down or has no route.
    NetworkDown,
    /// Nothing answered within [`CONNECT_TIMEOUT`].
    Timeout,
    /// The computer refused the connection: nothing listens there.
    Refused,
    /// Anything else: the name didn't resolve, TLS failed, or the answer
    /// wasn't a gateway's WebSocket.
    Unreachable,
}

/// A byte stream the WebSocket runs over, plain or TLS.
pub(crate) trait Io: AsyncRead + AsyncWrite + Send + Unpin {}

impl<T: AsyncRead + AsyncWrite + Send + Unpin> Io for T {}

/// An open WebSocket to the gateway.
pub(crate) type Socket = WebSocketStream<Box<dyn Io>>;

/// How the transport dials. TLS endpoints need a rustls config from the
/// shell, which checks certificates with the platform's verifier.
#[derive(Clone)]
pub struct Dialer {
    tls: Option<Arc<ClientConfig>>,
}

impl Dialer {
    /// Dials TLS endpoints with `tls`, and `tcp:` endpoints in plain. The
    /// WebSocket upgrade is HTTP/1.1, so it offers only that in ALPN, even
    /// when the shell's config also offers `h2` for its other requests.
    pub fn new(tls: Arc<ClientConfig>) -> Self {
        let mut tls = ClientConfig::clone(&tls);
        tls.alpn_protocols = vec![b"http/1.1".to_vec()];
        Self {
            tls: Some(Arc::new(tls)),
        }
    }

    /// Dials `tcp:` endpoints only; a TLS endpoint is unreachable. For
    /// tests on loopback.
    pub fn without_tls() -> Self {
        Self { tls: None }
    }

    /// Opens one connection, within [`CONNECT_TIMEOUT`].
    pub(crate) async fn open(&self, endpoint: &Endpoint) -> Result<Socket, ConnectError> {
        tokio::time::timeout(CONNECT_TIMEOUT, self.open_untimed(endpoint))
            .await
            .unwrap_or(Err(ConnectError::Timeout))
    }

    async fn open_untimed(&self, endpoint: &Endpoint) -> Result<Socket, ConnectError> {
        let tcp = TcpStream::connect((endpoint.host(), endpoint.port()))
            .await
            .map_err(|error| connect_error(&error))?;
        // Frames are small and interactive; don't hold them back.
        let _ = tcp.set_nodelay(true);
        let stream: Box<dyn Io> = if endpoint.is_secure() {
            let tls = self.tls.clone().ok_or(ConnectError::Unreachable)?;
            let name = ServerName::try_from(endpoint.host().to_owned())
                .map_err(|_| ConnectError::Unreachable)?;
            let stream = TlsConnector::from(tls)
                .connect(name, tcp)
                .await
                .map_err(|_| ConnectError::Unreachable)?;
            Box::new(stream)
        } else {
            Box::new(tcp)
        };
        let (socket, _) =
            client_async_with_config(endpoint.websocket_url(), stream, Some(websocket_config()))
                .await
                .map_err(|_| ConnectError::Unreachable)?;
        Ok(socket)
    }
}

/// The WebSocket limits: one frame of the session is at most
/// [`MAX_FRAME_BYTES`], so a message or a frame past that closes the
/// connection instead of filling memory (tungstenite's defaults are 64 MiB
/// and 16 MiB).
pub(crate) fn websocket_config() -> WebSocketConfig {
    WebSocketConfig::default()
        .max_message_size(Some(MAX_FRAME_BYTES))
        .max_frame_size(Some(MAX_FRAME_BYTES))
}

fn connect_error(error: &io::Error) -> ConnectError {
    match error.kind() {
        io::ErrorKind::NetworkDown | io::ErrorKind::NetworkUnreachable => ConnectError::NetworkDown,
        io::ErrorKind::ConnectionRefused => ConnectError::Refused,
        io::ErrorKind::TimedOut => ConnectError::Timeout,
        _ => ConnectError::Unreachable,
    }
}
