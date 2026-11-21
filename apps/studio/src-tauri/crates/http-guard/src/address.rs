//! Which addresses a request may reach.

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

use crate::request::Refusal;

/// Checks one address a host name resolved to, or that the page named.
///
/// `plain` is whether the request goes over `http`: that is only allowed to
/// this computer or a private network, so a key never crosses the internet in
/// the clear. Link-local addresses are refused for both, because they hold
/// cloud metadata services, and so are [`SERVICE_ADDRESSES_V4`]; so are the
/// unspecified, multicast and broadcast ones.
///
/// # Errors
///
/// A [`Refusal`] with code `address_refused` or `plain_http_public`.
pub fn check_address(ip: IpAddr, plain: bool) -> Result<(), Refusal> {
    let ip = unmapped(ip);
    if refused(ip) {
        return Err(Refusal::new(
            "address_refused",
            "that address is not one the app calls",
        ));
    }
    if plain && !is_local(ip) {
        return Err(Refusal::new(
            "plain_http_public",
            "a public address needs https",
        ));
    }
    Ok(())
}

/// An IPv4 address written as IPv6 (`::ffff:a.b.c.d`) is checked as the IPv4 one.
fn unmapped(ip: IpAddr) -> IpAddr {
    match ip {
        IpAddr::V6(v6) => v6.to_ipv4_mapped().map_or(IpAddr::V6(v6), IpAddr::V4),
        v4 => v4,
    }
}

/// Service addresses inside `100.64.0.0/10` that no request may reach, over
/// `http` or `https`: Alibaba Cloud's metadata service (`100.100.100.200`) and
/// Tailscale's own DNS and client address (`100.100.100.100`). The same
/// two that `http-kit` takes out of the range.
const SERVICE_ADDRESSES_V4: [Ipv4Addr; 2] = [
    Ipv4Addr::new(100, 100, 100, 200),
    Ipv4Addr::new(100, 100, 100, 100),
];

fn refused(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_unspecified()
                || v4.is_multicast()
                || v4.is_broadcast()
                || v4.is_link_local()
                || SERVICE_ADDRESSES_V4.contains(&v4)
        }
        IpAddr::V6(v6) => v6.is_unspecified() || v6.is_multicast() || is_unicast_link_local_v6(v6),
    }
}

/// `fe80::/10`.
fn is_unicast_link_local_v6(ip: Ipv6Addr) -> bool {
    ip.segments()[0] & 0xffc0 == 0xfe80
}

/// Loopback and private-network addresses, an IPv4 one written as IPv6 too.
pub(crate) fn is_local(ip: IpAddr) -> bool {
    match unmapped(ip) {
        IpAddr::V4(v4) => v4.is_loopback() || v4.is_private() || is_shared_v4(v4),
        IpAddr::V6(v6) => v6.is_loopback() || v6.segments()[0] & 0xfe00 == 0xfc00,
    }
}

/// `100.64.0.0/10`, the carrier-grade range tailnets and VPNs use, without
/// the [`SERVICE_ADDRESSES_V4`] in it.
fn is_shared_v4(ip: Ipv4Addr) -> bool {
    let [a, b, ..] = ip.octets();
    a == 100 && b & 0xc0 == 0x40 && !SERVICE_ADDRESSES_V4.contains(&ip)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn code(ip: &str, plain: bool) -> Option<&'static str> {
        check_address(ip.parse().unwrap(), plain)
            .err()
            .map(|refusal| refusal.code())
    }

    #[test]
    fn address_loopback_and_private_may_use_plain_http() {
        for ip in [
            "127.0.0.1",
            "::1",
            "10.0.0.5",
            "192.168.1.20",
            "172.16.0.1",
            "fd12::1",
            "100.64.0.0",
            "100.64.1.1",
            "100.100.100.99",
            "100.100.100.101",
            "100.100.100.199",
            "100.100.100.201",
            "100.127.255.255",
        ] {
            assert_eq!(code(ip, true), None, "{ip}");
        }
    }

    #[test]
    fn address_public_needs_https() {
        for ip in [
            "93.184.216.34",
            "2606:4700::1111",
            "100.63.255.255",
            "100.128.0.0",
            "100.128.0.1",
        ] {
            assert_eq!(code(ip, true), Some("plain_http_public"), "{ip}");
            assert_eq!(code(ip, false), None, "{ip}");
        }
    }

    #[test]
    fn address_link_local_unspecified_and_multicast_are_refused_either_way() {
        for ip in [
            "169.254.169.254",
            "fe80::1",
            "0.0.0.0",
            "::",
            "224.0.0.1",
            "ff02::1",
            "255.255.255.255",
        ] {
            assert_eq!(code(ip, false), Some("address_refused"), "{ip}");
            assert_eq!(code(ip, true), Some("address_refused"), "{ip}");
        }
    }

    #[test]
    fn address_service_addresses_in_the_shared_range_are_refused_either_way() {
        for ip in [
            "100.100.100.200",
            "100.100.100.100",
            "::ffff:100.100.100.200",
            "::ffff:100.100.100.100",
        ] {
            assert_eq!(code(ip, false), Some("address_refused"), "{ip}");
            assert_eq!(code(ip, true), Some("address_refused"), "{ip}");
            assert!(!is_local(ip.parse().unwrap()), "{ip}");
        }
    }

    #[test]
    fn address_ipv4_written_as_ipv6_is_checked_as_ipv4() {
        assert_eq!(
            code("::ffff:169.254.169.254", false),
            Some("address_refused")
        );
        assert_eq!(
            code("::ffff:93.184.216.34", true),
            Some("plain_http_public")
        );
        assert_eq!(code("::ffff:127.0.0.1", true), None);
    }
}
