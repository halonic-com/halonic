//! The `NO_PROXY` list: which hosts go straight to the network instead of
//! through the proxy. Read as `NoProxy` in `packages/adapters/http-node`
//! reads it, so the CLI and Studio skip the proxy for the same hosts.

use std::net::IpAddr;

use url::{Host, Url};

/// The hosts that skip the proxy.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct NoProxy {
    rules: Vec<Rule>,
}

/// One entry of the list.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Rule {
    /// `*`.
    Everything,
    Host {
        host: RuleHost,
        port: Option<u16>,
    },
}

/// A name matches itself and its subdomains; an address matches itself only.
#[derive(Debug, Clone, PartialEq, Eq)]
enum RuleHost {
    /// Lower case, no leading `*.` or `.`, no trailing dot.
    Name(String),
    Address(IpAddr),
}

impl NoProxy {
    /// Reads a `NO_PROXY` value: comma-separated, case-insensitive. `*` means
    /// everything; a name matches itself and its subdomains (`example.com`
    /// and `.example.com` alike); `:port` narrows an entry; an IP literal
    /// matches exactly. There are no address ranges. An entry that can't be
    /// understood is dropped, so its host goes through the proxy.
    pub fn parse(value: &str) -> Self {
        let rules = value
            .split(',')
            .filter_map(|entry| parse_rule(&entry.trim().to_ascii_lowercase()))
            .collect();
        Self { rules }
    }

    /// Whether the address's host is on the list.
    pub fn matches(&self, url: &Url) -> bool {
        let host = match url.host() {
            Some(Host::Domain(name)) => RuleHost::Name(name.trim_end_matches('.').to_owned()),
            Some(Host::Ipv4(ip)) => RuleHost::Address(ip.into()),
            Some(Host::Ipv6(ip)) => RuleHost::Address(ip.into()),
            None => return false,
        };
        let port = url.port_or_known_default().unwrap_or(443);
        self.rules
            .iter()
            .any(|rule| rule_matches(rule, &host, port))
    }
}

fn parse_rule(entry: &str) -> Option<Rule> {
    if entry.is_empty() {
        return None;
    }
    if entry == "*" {
        return Some(Rule::Everything);
    }
    let (host_part, port_part) = split_port(entry);
    let port = match port_part {
        Some(text) => Some(text.parse::<u16>().ok().filter(|port| *port > 0)?),
        None => None,
    };
    let host = without_brackets(host_part);
    let host = host
        .strip_prefix("*.")
        .or_else(|| host.strip_prefix('.'))
        .unwrap_or(host);
    let host = host.strip_suffix('.').unwrap_or(host);
    if host.is_empty() {
        return None;
    }
    let host = if let Ok(address) = host.parse::<IpAddr>() {
        RuleHost::Address(address)
    } else if host.contains(':') {
        // Not an IPv6 address after all.
        return None;
    } else {
        RuleHost::Name(host.to_owned())
    };
    Some(Rule::Host { host, port })
}

/// Splits `host:port`, `[v6]:port`, a bare `v6` and a bare `host`.
fn split_port(entry: &str) -> (&str, Option<&str>) {
    if let Some((host, port)) = bracketed(entry) {
        return (host, port);
    }
    match entry.split_once(':') {
        Some((host, port)) if !port.contains(':') => (host, Some(port)),
        _ => (entry, None),
    }
}

/// `[v6]` or `[v6]:port`, with the port all digits.
fn bracketed(entry: &str) -> Option<(&str, Option<&str>)> {
    let close = entry.find(']')?;
    if !entry.starts_with('[') {
        return None;
    }
    let (host, after) = entry.split_at(close + 1);
    if after.is_empty() {
        return Some((host, None));
    }
    let port = after.strip_prefix(':')?;
    (!port.is_empty() && port.bytes().all(|b| b.is_ascii_digit())).then_some((host, Some(port)))
}

fn without_brackets(host: &str) -> &str {
    let host = host.strip_prefix('[').unwrap_or(host);
    host.strip_suffix(']').unwrap_or(host)
}

fn rule_matches(rule: &Rule, host: &RuleHost, port: u16) -> bool {
    let Rule::Host {
        host: rule_host,
        port: rule_port,
    } = rule
    else {
        return true;
    };
    if rule_port.is_some_and(|rule_port| rule_port != port) {
        return false;
    }
    match (rule_host, host) {
        (RuleHost::Name(rule), RuleHost::Name(name)) => {
            name == rule || name.ends_with(&format!(".{rule}"))
        }
        (RuleHost::Address(rule), RuleHost::Address(address)) => rule == address,
        _ => false,
    }
}
