//! The connect check: read the address, look the name up, and decide whether
//! the app may call it (flow-install-update 5.3).

use std::io;
use std::net::{SocketAddr, ToSocketAddrs};
use std::time::Duration;

use crate::address::{Address, Host, NotAnAddress, Scheme, parse_address};
use crate::home_network::{Reach, reach};

/// How long the hello call waits for an answer before "Can't reach Halonic".
pub const HELLO_TIMEOUT: Duration = Duration::from_secs(5);

/// A field error under Address, in the order the spec checks them. The page
/// owns the wording; these are only the cases.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConnectError {
    /// "Enter an address like 192.168.1.20:4280."
    NotAnAddress,
    /// "Use an address on your home network, like 192.168.1.20:4280."
    NotHomeNetwork,
    /// "Can't reach Halonic at …". Also when the name resolves to nothing.
    NotAnswering,
    /// "Something answered at …, but it isn't Halonic."
    NotHalonic,
}

impl From<NotAnAddress> for ConnectError {
    fn from(_: NotAnAddress) -> Self {
        ConnectError::NotAnAddress
    }
}

/// Looks a host name up. The system resolver in the app; a fixed table in
/// tests, so they need no network.
pub trait Resolver {
    fn resolve(&self, name: &str, port: u16) -> io::Result<Vec<SocketAddr>>;
}

/// The operating system's resolver.
pub struct SystemResolver;

impl Resolver for SystemResolver {
    fn resolve(&self, name: &str, port: u16) -> io::Result<Vec<SocketAddr>> {
        Ok((name, port).to_socket_addrs()?.collect())
    }
}

/// An address that passed the check, with the IP addresses it was checked
/// against. The hello call must connect only to `socket_addrs` (reqwest's
/// `resolve_to_addrs`), must not follow redirects and gives up after
/// [`HELLO_TIMEOUT`], so it reaches exactly the address that was checked.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CheckedAddress {
    pub address: Address,
    pub socket_addrs: Vec<SocketAddr>,
}

impl CheckedAddress {
    /// The hello call's URL, for example `http://192.168.1.20:4280/api/hello`.
    pub fn hello_url(&self) -> String {
        format!("{}/api/hello", self.address)
    }
}

/// Checks what the user typed, before the hello call.
///
/// The name is looked up first, so a name is judged by where it really
/// points. Every IP address it resolves to must be usable, and for plain
/// `http://` every one must be on the home network: a name that also
/// resolves to a public address is refused. This is a usability check that
/// keeps passwords off plain `http://` across the internet, not a security
/// boundary: the served pages get no native access either way.
pub fn check_address(input: &str, resolver: &dyn Resolver) -> Result<CheckedAddress, ConnectError> {
    let address = parse_address(input)?;
    let socket_addrs = match &address.host {
        Host::Ip(ip) => vec![SocketAddr::new(*ip, address.port)],
        Host::Name(name) => resolver
            .resolve(name, address.port)
            .map_err(|_| ConnectError::NotAnswering)?,
    };
    if socket_addrs.is_empty() {
        return Err(ConnectError::NotAnswering);
    }
    let allowed = |reach: Reach| match (address.scheme, reach) {
        (_, Reach::Unusable) => false,
        (Scheme::Https, _) => true,
        (Scheme::Http, reach) => reach == Reach::HomeNetwork,
    };
    if !socket_addrs
        .iter()
        .all(|socket| allowed(reach(socket.ip())))
    {
        return Err(ConnectError::NotHomeNetwork);
    }
    Ok(CheckedAddress {
        address,
        socket_addrs,
    })
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;

    /// Answers from a fixed table; a name not in it fails like a DNS error.
    struct FixedResolver(HashMap<&'static str, Vec<&'static str>>);

    impl Resolver for FixedResolver {
        fn resolve(&self, name: &str, port: u16) -> io::Result<Vec<SocketAddr>> {
            let ips = self.0.get(name).ok_or(io::ErrorKind::NotFound)?;
            Ok(ips
                .iter()
                .map(|ip| SocketAddr::new(ip.parse().expect("a test IP"), port))
                .collect())
        }
    }

    fn resolver() -> FixedResolver {
        FixedResolver(HashMap::from([
            ("localhost", vec!["127.0.0.1", "::1"]),
            ("my-laptop.local", vec!["192.168.1.20", "fd00::20"]),
            ("mixed.example", vec!["192.168.1.20", "8.8.8.8"]),
            ("halonic.example", vec!["8.8.8.8"]),
            ("nowhere.example", vec![]),
            ("zero.example", vec!["0.0.0.0"]),
        ]))
    }

    fn check(input: &str) -> Result<CheckedAddress, ConnectError> {
        check_address(input, &resolver())
    }

    #[test]
    fn connect_check_allows_the_home_network_over_http() {
        let checked = check("192.168.1.20:4280").expect("allowed");
        assert_eq!(checked.hello_url(), "http://192.168.1.20:4280/api/hello");
        assert_eq!(
            checked.socket_addrs,
            vec!["192.168.1.20:4280".parse().expect("a test socket")]
        );
        assert!(check("localhost:4280").is_ok());
        assert!(check("[fd00::20]:4280").is_ok());
        assert!(check("[::ffff:10.0.0.5]:4280").is_ok());
    }

    #[test]
    fn connect_check_judges_names_after_dns() {
        let checked = check("my-laptop.local:4280").expect("a name with only private addresses");
        assert_eq!(checked.socket_addrs.len(), 2);
        assert_eq!(
            check("http://halonic.example"),
            Err(ConnectError::NotHomeNetwork)
        );
        assert_eq!(
            check("http://mixed.example"),
            Err(ConnectError::NotHomeNetwork)
        );
    }

    #[test]
    fn connect_check_needs_https_for_public_addresses() {
        assert_eq!(check("8.8.8.8:4280"), Err(ConnectError::NotHomeNetwork));
        assert_eq!(
            check("http://[::ffff:8.8.8.8]:4280"),
            Err(ConnectError::NotHomeNetwork)
        );
        assert!(check("https://8.8.8.8").is_ok());
        assert!(check("https://halonic.example").is_ok());
        assert!(check("https://mixed.example").is_ok());
    }

    #[test]
    fn connect_check_refuses_unusable_addresses_even_over_https() {
        for input in [
            "0.0.0.0:4280",
            "https://0.0.0.0",
            "https://[::]",
            "https://224.0.0.1",
            "https://zero.example",
        ] {
            assert_eq!(check(input), Err(ConnectError::NotHomeNetwork), "{input}");
        }
    }

    #[test]
    fn connect_check_reports_names_that_resolve_to_nothing_as_not_answering() {
        assert_eq!(check("nowhere.example"), Err(ConnectError::NotAnswering));
        assert_eq!(check("unknown.example"), Err(ConnectError::NotAnswering));
    }

    #[test]
    fn connect_check_reports_bad_input_first() {
        assert_eq!(
            check("halonic.example/studio"),
            Err(ConnectError::NotAnAddress)
        );
    }
}
