//! Which Connect presses need Android's local network permission
//! (`ACCESS_LOCAL_NETWORK`). From Android 17, an app that targets it can't
//! reach the Wi-Fi without it: a blocked connection just times out
//! (HAL-12253). Loopback and public addresses never need it.

use crate::address::{Address, Host};
use crate::check::CheckedAddress;
use crate::home_network::{Reach, reach};

/// Whether looking the address up already needs the permission: Android
/// looks a `.local` name up with multicast DNS on the Wi-Fi. Other names go
/// to the phone's DNS server, which needs no permission.
pub fn lookup_needs_local_network(address: &Address) -> bool {
    match &address.host {
        Host::Name(name) => name.ends_with(".local"),
        Host::Ip(_) => false,
    }
}

/// Whether the hello call needs the permission: when any address it may
/// connect to is on the home network and isn't this phone itself.
/// Tailscale's `100.x` addresses are public to the connect check, so they
/// never ask for it.
pub fn call_needs_local_network(checked: &CheckedAddress) -> bool {
    checked.socket_addrs.iter().any(|socket| {
        let ip = socket.ip();
        reach(ip) == Reach::HomeNetwork && !ip.to_canonical().is_loopback()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::address::parse_address;

    fn address(input: &str) -> Address {
        parse_address(input).expect("a test address")
    }

    fn checked(input: &str, ips: &[&str]) -> CheckedAddress {
        let address = address(input);
        let port = address.port;
        CheckedAddress {
            address,
            socket_addrs: ips
                .iter()
                .map(|ip| std::net::SocketAddr::new(ip.parse().expect("a test IP"), port))
                .collect(),
        }
    }

    #[test]
    fn local_network_is_needed_to_look_up_local_names_only() {
        assert!(lookup_needs_local_network(&address("my-laptop.local:4280")));
        assert!(lookup_needs_local_network(&address("My-Laptop.LOCAL:4280")));
        assert!(!lookup_needs_local_network(&address("halonic.example")));
        assert!(!lookup_needs_local_network(&address("localhost:4280")));
        assert!(!lookup_needs_local_network(&address("192.168.1.20:4280")));
    }

    #[test]
    fn local_network_is_needed_to_call_the_home_network() {
        for ip in [
            "192.168.1.20",
            "10.0.0.5",
            "172.16.0.1",
            "fd00::20",
            "fe80::1",
            "::ffff:192.168.1.20",
        ] {
            assert!(
                call_needs_local_network(&checked("http://x:4280", &[ip])),
                "{ip}"
            );
        }
        assert!(call_needs_local_network(&checked(
            "my-laptop.local:4280",
            &["127.0.0.1", "192.168.1.20"]
        )));
    }

    #[test]
    fn local_network_is_not_needed_for_loopback_or_public_addresses() {
        for ip in [
            "127.0.0.1",
            "::1",
            "::ffff:127.0.0.1",
            "8.8.8.8",
            "100.101.102.103",
            "2001:db8::1",
        ] {
            assert!(
                !call_needs_local_network(&checked("https://x", &[ip])),
                "{ip}"
            );
        }
    }
}
