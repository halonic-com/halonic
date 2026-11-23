//! The Halonic computers found on this Wi-Fi, for the typed route's
//! computer picker (HAL-16824). Android's `NsdManager` browses
//! `_halonic-pair._tcp` and resolves each hit; this list keeps the ones
//! that check out and hands the page a name and an opaque id for each. The
//! address and port stay here: the page pairs by id, and
//! [`NearbyComputers::endpoint`] turns the id back into the endpoint.
//!
//! Every hit comes from the network, so any device on the Wi-Fi can make
//! one up. A hit is dropped unless its name is one the phone would show
//! after pairing ([`is_plain_name`], at most [`MAX_NAME_BYTES`]), its
//! address is an IPv4 address on the home network that isn't this phone,
//! and its port isn't 0. At most [`MAX_NEARBY`] computers are kept.

use std::net::{IpAddr, Ipv4Addr};

use halonic_connect::{Reach, reach};
use halonic_tunnel::{MAX_NAME_BYTES, is_plain_name};
use serde::{Deserialize, Serialize};

/// The most computers the picker lists; later hits are dropped.
pub const MAX_NEARBY: usize = 16;

/// The longest service name kept as a hit's key. A DNS-SD instance name is
/// one label, at most 63 bytes; Android may add a suffix such as ` (2)`.
const MAX_KEY_BYTES: usize = 128;

/// One resolved hit, as the Kotlin side passes it on. Untrusted.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct Hit {
    /// The service's instance name, which says which hit a later loss is.
    pub key: String,
    /// The `name` entry of the TXT record, when it has one in UTF-8.
    #[serde(default)]
    pub name: Option<String>,
    /// The resolved address, as text.
    pub address: String,
    pub port: u16,
}

/// A computer as the page sees it: no address and no port.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct NearbyView {
    pub id: String,
    pub name: String,
}

/// A computer the list keeps.
#[derive(Debug)]
struct Entry {
    key: String,
    id: String,
    name: String,
    address: Ipv4Addr,
    port: u16,
}

/// The computers found since the picker last started browsing.
#[derive(Debug, Default)]
pub struct NearbyComputers {
    entries: Vec<Entry>,
    /// Numbers the ids, and never goes back, so an id from an earlier
    /// browse never names a computer of a later one.
    handed_out: u64,
}

impl NearbyComputers {
    pub fn new() -> Self {
        Self::default()
    }

    /// Adds a hit, or updates the one with the same key, keeping its id.
    /// Answers whether the list the page sees changed. A hit that doesn't
    /// check out is dropped, and also drops an earlier hit with its key,
    /// since that one no longer says where the computer is.
    pub fn found(&mut self, hit: Hit) -> bool {
        let Some((name, address)) = checked(&hit) else {
            return self.lost(&hit.key);
        };
        if let Some(entry) = self.entries.iter_mut().find(|entry| entry.key == hit.key) {
            let changed = entry.name != name;
            entry.name = name;
            entry.address = address;
            entry.port = hit.port;
            return changed;
        }
        if self.entries.len() >= MAX_NEARBY {
            return false;
        }
        self.handed_out += 1;
        self.entries.push(Entry {
            key: hit.key,
            id: format!("nearby-{}", self.handed_out),
            name,
            address,
            port: hit.port,
        });
        true
    }

    /// Drops the hit with `key`: the computer stopped advertising. Answers
    /// whether the list changed.
    pub fn lost(&mut self, key: &str) -> bool {
        let before = self.entries.len();
        self.entries.retain(|entry| entry.key != key);
        self.entries.len() != before
    }

    /// Drops every hit: a new browse starts, or the app went to the
    /// background. Their ids name nothing from now on. Answers whether the
    /// list changed.
    pub fn clear(&mut self) -> bool {
        let changed = !self.entries.is_empty();
        self.entries.clear();
        changed
    }

    /// The list as the page sees it, by name, and in the order found for
    /// equal names.
    pub fn view(&self) -> Vec<NearbyView> {
        let mut view: Vec<NearbyView> = self
            .entries
            .iter()
            .map(|entry| NearbyView {
                id: entry.id.clone(),
                name: entry.name.clone(),
            })
            .collect();
        view.sort_by(|first, second| first.name.cmp(&second.name));
        view
    }

    /// The endpoint of the computer the page picked by `id`, as a `tcp:`
    /// URL, or `None` for an id the list doesn't hold.
    pub fn endpoint(&self, id: &str) -> Option<String> {
        let entry = self.entries.iter().find(|entry| entry.id == id)?;
        Some(format!("tcp://{}:{}", entry.address, entry.port))
    }
}

/// The hit's name and address, when the hit checks out.
fn checked(hit: &Hit) -> Option<(String, Ipv4Addr)> {
    if hit.key.is_empty() || hit.key.len() > MAX_KEY_BYTES || hit.port == 0 {
        return None;
    }
    let name = hit.name.as_deref()?.trim();
    if name.is_empty() || name.len() > MAX_NAME_BYTES || !is_plain_name(name) {
        return None;
    }
    Some((name.to_owned(), home_address(&hit.address)?))
}

/// An IPv4 address on the home network that isn't this phone. The advert
/// gives only IPv4 addresses; an IPv6 one would need its interface.
fn home_address(text: &str) -> Option<Ipv4Addr> {
    let ip = match text.parse::<IpAddr>().ok()?.to_canonical() {
        IpAddr::V4(ip) => ip,
        IpAddr::V6(_) => return None,
    };
    let home = reach(IpAddr::V4(ip)) == Reach::HomeNetwork;
    (home && !ip.is_loopback()).then_some(ip)
}
