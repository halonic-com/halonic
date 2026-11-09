//! Which IP addresses the app may reach, and which count as the home network.

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

/// What an IP address is, for the connect check.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reach {
    /// Never a computer to connect to: `0.0.0.0`, `::`, multicast and
    /// broadcast. Refused whatever the scheme.
    Unusable,
    /// Loopback or a private range. Plain `http://` is allowed.
    HomeNetwork,
    /// Anything else. Needs `https://`.
    Public,
}

/// Sorts an IP address for the connect check (flow-install-update 5.3).
///
/// An IPv4 address written in IPv6 form (`::ffff:192.168.1.20`) is judged as
/// the IPv4 address it contains.
pub fn reach(ip: IpAddr) -> Reach {
    match ip {
        IpAddr::V4(ip) => reach_v4(ip),
        IpAddr::V6(ip) => match ip.to_ipv4_mapped() {
            Some(mapped) => reach_v4(mapped),
            None => reach_v6(ip),
        },
    }
}

/// The spec lists loopback, 10/8, 172.16/12 and 192.168/16. It leaves out
/// link-local 169.254/16 while it allows IPv6 link-local; Maya decides
/// whether that changes. Shared address space 100.64/10 (Tailscale and
/// similar) stays out of 0.1 (HAL-1150).
fn reach_v4(ip: Ipv4Addr) -> Reach {
    if ip.is_unspecified() || ip.is_multicast() || ip.is_broadcast() {
        Reach::Unusable
    } else if ip.is_loopback() || ip.is_private() {
        Reach::HomeNetwork
    } else {
        Reach::Public
    }
}

/// Loopback `::1`, unique local `fc00::/7` and link-local `fe80::/10`.
fn reach_v6(ip: Ipv6Addr) -> Reach {
    if ip.is_unspecified() || ip.is_multicast() {
        Reach::Unusable
    } else if ip.is_loopback() || ip.is_unique_local() || ip.is_unicast_link_local() {
        Reach::HomeNetwork
    } else {
        Reach::Public
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reach_of(ip: &str) -> Reach {
        reach(ip.parse().expect("a test IP address"))
    }

    #[test]
    fn home_network_includes_loopback_and_private_ranges() {
        for ip in [
            "127.0.0.1",
            "127.8.9.10",
            "10.0.0.1",
            "172.16.0.1",
            "172.31.255.254",
            "192.168.1.20",
            "::1",
            "fd00::20",
            "fc00::1",
            "fe80::1",
        ] {
            assert_eq!(reach_of(ip), Reach::HomeNetwork, "{ip}");
        }
    }

    #[test]
    fn home_network_leaves_out_public_and_unlisted_ranges() {
        for ip in [
            "8.8.8.8",
            "172.15.255.255",
            "172.32.0.1",
            "192.169.0.1",
            "100.64.0.1",
            "169.254.1.1",
            "2001:db8::1",
            "fec0::1",
        ] {
            assert_eq!(reach_of(ip), Reach::Public, "{ip}");
        }
    }

    #[test]
    fn home_network_judges_ipv4_in_ipv6_form_as_ipv4() {
        assert_eq!(reach_of("::ffff:192.168.1.20"), Reach::HomeNetwork);
        assert_eq!(reach_of("::ffff:127.0.0.1"), Reach::HomeNetwork);
        assert_eq!(reach_of("::ffff:8.8.8.8"), Reach::Public);
        assert_eq!(reach_of("::ffff:0.0.0.0"), Reach::Unusable);
    }

    #[test]
    fn home_network_refuses_unusable_addresses() {
        for ip in [
            "0.0.0.0",
            "::",
            "224.0.0.1",
            "239.255.255.250",
            "255.255.255.255",
            "ff02::1",
        ] {
            assert_eq!(reach_of(ip), Reach::Unusable, "{ip}");
        }
    }
}
