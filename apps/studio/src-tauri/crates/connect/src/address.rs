//! Reads what the user typed in the Address field.

use std::fmt;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

/// `http://` or `https://`. Nothing else is accepted.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Scheme {
    Http,
    Https,
}

impl Scheme {
    fn default_port(self) -> u16 {
        match self {
            Scheme::Http => 80,
            Scheme::Https => 443,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Scheme::Http => "http",
            Scheme::Https => "https",
        }
    }
}

/// The host part of an address: a name to look up, or an IP address.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Host {
    /// A DNS name, lowercased, such as `my-laptop.local`.
    Name(String),
    Ip(IpAddr),
}

impl fmt::Display for Host {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Host::Name(name) => f.write_str(name),
            Host::Ip(IpAddr::V4(ip)) => write!(f, "{ip}"),
            Host::Ip(IpAddr::V6(ip)) => write!(f, "[{ip}]"),
        }
    }
}

/// An address the user typed, read into its parts.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Address {
    pub scheme: Scheme,
    pub host: Host,
    pub port: u16,
}

impl fmt::Display for Address {
    /// The origin, for example `http://192.168.1.20:4280`.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}://{}:{}", self.scheme.as_str(), self.host, self.port)
    }
}

impl Address {
    /// The address as the connect page shows it in "Can't reach Halonic at
    /// …", for example `192.168.1.20:4280`, `my-laptop.local` or
    /// `https://halonic.example`: `http://` and the scheme's own port are
    /// left out, as the user would type them.
    pub fn display_form(&self) -> String {
        let scheme = match self.scheme {
            Scheme::Http => "",
            Scheme::Https => "https://",
        };
        if self.port == self.scheme.default_port() {
            format!("{scheme}{}", self.host)
        } else {
            format!("{scheme}{}:{}", self.host, self.port)
        }
    }
}

/// The input isn't an address: "Enter an address like 192.168.1.20:4280."
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NotAnAddress;

/// Reads an address such as `192.168.1.20:4280`, `my-laptop.local`,
/// `https://halonic.example` or `[fd00::20]:4280`.
///
/// Spaces around it are ignored and `http://` is added when there is no
/// scheme. A path, a query, a user name or any other scheme is refused; a
/// single trailing `/` is allowed, because copied addresses often end in one.
pub fn parse_address(input: &str) -> Result<Address, NotAnAddress> {
    let input = input.trim();
    let (scheme, rest) = split_scheme(input)?;
    let authority = rest.strip_suffix('/').unwrap_or(rest);
    if authority.is_empty() || authority.contains(['/', '?', '#', '@', ' ']) {
        return Err(NotAnAddress);
    }
    let (host, port) = split_host_and_port(authority)?;
    Ok(Address {
        scheme,
        host: parse_host(host)?,
        port: match port {
            Some(port) => parse_port(port)?,
            None => scheme.default_port(),
        },
    })
}

fn split_scheme(input: &str) -> Result<(Scheme, &str), NotAnAddress> {
    let Some((scheme, rest)) = input.split_once("://") else {
        return Ok((Scheme::Http, input));
    };
    match scheme.to_ascii_lowercase().as_str() {
        "http" => Ok((Scheme::Http, rest)),
        "https" => Ok((Scheme::Https, rest)),
        _ => Err(NotAnAddress),
    }
}

/// Splits `host:port`. An IPv6 address must be in brackets, because its own
/// colons would otherwise be read as the port.
fn split_host_and_port(authority: &str) -> Result<(&str, Option<&str>), NotAnAddress> {
    if let Some(bracketed) = authority.strip_prefix('[') {
        let (ip, after) = bracketed.split_once(']').ok_or(NotAnAddress)?;
        return match after {
            "" => Ok((ip, None)),
            _ => Ok((ip, Some(after.strip_prefix(':').ok_or(NotAnAddress)?))),
        };
    }
    match authority.split_once(':') {
        None => Ok((authority, None)),
        Some((_, port)) if port.contains(':') => Err(NotAnAddress),
        Some((host, port)) => Ok((host, Some(port))),
    }
}

fn parse_host(host: &str) -> Result<Host, NotAnAddress> {
    if let Ok(ip) = host.parse::<Ipv6Addr>() {
        return Ok(Host::Ip(IpAddr::V6(ip)));
    }
    if let Ok(ip) = host.parse::<Ipv4Addr>() {
        return Ok(Host::Ip(IpAddr::V4(ip)));
    }
    if is_dns_name(host) {
        return Ok(Host::Name(host.to_ascii_lowercase()));
    }
    Err(NotAnAddress)
}

/// Letters, digits and hyphens in dot-separated labels of up to 63
/// characters, no label starting or ending with a hyphen, at most 253 in all.
/// A name made only of digits and dots is a mistyped IPv4 address, not a name.
fn is_dns_name(host: &str) -> bool {
    let is_label = |label: &str| {
        (1..=63).contains(&label.len())
            && !label.starts_with('-')
            && !label.ends_with('-')
            && label.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
    };
    let all_numeric = host.chars().all(|c| c.is_ascii_digit() || c == '.');
    host.len() <= 253 && !all_numeric && host.split('.').all(is_label)
}

fn parse_port(port: &str) -> Result<u16, NotAnAddress> {
    if port.is_empty() || !port.chars().all(|c| c.is_ascii_digit()) {
        return Err(NotAnAddress);
    }
    match port.parse::<u16>() {
        Ok(0) | Err(_) => Err(NotAnAddress),
        Ok(port) => Ok(port),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn origin(input: &str) -> String {
        parse_address(input)
            .map(|a| a.to_string())
            .unwrap_or_default()
    }

    #[test]
    fn address_format_adds_http_and_keeps_the_port() {
        assert_eq!(origin("192.168.1.20:4280"), "http://192.168.1.20:4280");
        assert_eq!(origin("  192.168.1.20:4280  "), "http://192.168.1.20:4280");
        assert_eq!(
            origin("HTTP://My-Laptop.local:4280/"),
            "http://my-laptop.local:4280"
        );
        assert_eq!(
            origin("https://halonic.example"),
            "https://halonic.example:443"
        );
        assert_eq!(origin("localhost"), "http://localhost:80");
    }

    #[test]
    fn address_format_shows_the_address_as_typed() {
        let shown = |input: &str| parse_address(input).expect("an address").display_form();
        assert_eq!(shown(" http://192.168.1.20:4280/ "), "192.168.1.20:4280");
        assert_eq!(shown("My-Laptop.local"), "my-laptop.local");
        assert_eq!(shown("my-laptop.local:80"), "my-laptop.local");
        assert_eq!(shown("[fd00::20]:4280"), "[fd00::20]:4280");
        assert_eq!(shown("https://halonic.example"), "https://halonic.example");
        assert_eq!(
            shown("https://halonic.example:8443"),
            "https://halonic.example:8443"
        );
    }

    #[test]
    fn address_format_reads_ipv6_in_brackets() {
        assert_eq!(origin("[fd00::20]:4280"), "http://[fd00::20]:4280");
        assert_eq!(origin("http://[::1]"), "http://[::1]:80");
    }

    #[test]
    fn address_format_refuses_anything_else() {
        for input in [
            "",
            "   ",
            "ftp://192.168.1.20",
            "192.168.1.20:4280/studio",
            "192.168.1.20:4280?x=1",
            "192.168.1.20:4280#top",
            "user@192.168.1.20:4280",
            "fd00::20",
            "[fd00::20",
            "[fd00::20]4280",
            "192.168.1.20:",
            "192.168.1.20:0",
            "192.168.1.20:65536",
            "192.168.1.20:+80",
            "192.168.1",
            "999.168.1.20",
            "my laptop",
            "-laptop.local",
            "laptop..local",
        ] {
            assert_eq!(parse_address(input), Err(NotAnAddress), "{input:?}");
        }
    }
}
