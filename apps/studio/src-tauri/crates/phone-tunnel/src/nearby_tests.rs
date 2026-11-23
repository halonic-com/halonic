//! The computers found on this Wi-Fi (HAL-16824): what the page sees, and
//! the hits from the network that are dropped.

use serde_json::json;

use crate::answers::Problem;
use crate::nearby::{Hit, MAX_NEARBY, NearbyComputers, NearbyView};
use crate::start::PairingStart;
use crate::status::Reason;

fn hit(key: &str, name: &str, address: &str, port: u16) -> Hit {
    Hit {
        key: key.to_owned(),
        name: Some(name.to_owned()),
        address: address.to_owned(),
        port,
    }
}

fn names(list: &NearbyComputers) -> Vec<String> {
    list.view().into_iter().map(|view| view.name).collect()
}

#[test]
fn phone_nearby_lists_names_and_ids_only_and_keeps_the_endpoint() {
    let mut list = NearbyComputers::new();
    assert!(list.found(hit("halonic-aa", "Tim's laptop", "192.168.1.20", 4100)));
    assert!(list.found(hit("halonic-bb", "Desk", "10.0.0.5", 4200)));
    assert_eq!(
        list.view(),
        vec![
            NearbyView {
                id: "nearby-2".to_owned(),
                name: "Desk".to_owned()
            },
            NearbyView {
                id: "nearby-1".to_owned(),
                name: "Tim's laptop".to_owned()
            },
        ]
    );
    assert_eq!(
        serde_json::to_value(list.view()).unwrap(),
        json!([{ "id": "nearby-2", "name": "Desk" }, { "id": "nearby-1", "name": "Tim's laptop" }])
    );
    assert_eq!(
        list.endpoint("nearby-1").as_deref(),
        Some("tcp://192.168.1.20:4100")
    );
    assert_eq!(list.endpoint("nearby-9"), None);
}

#[test]
fn phone_nearby_updates_a_hit_in_place_and_drops_a_lost_one() {
    let mut list = NearbyComputers::new();
    assert!(list.found(hit("halonic-aa", "Desk", "192.168.1.20", 4100)));
    // The same computer on a new port: the page sees no change.
    assert!(!list.found(hit("halonic-aa", "Desk", "192.168.1.21", 4101)));
    assert_eq!(
        list.endpoint("nearby-1").as_deref(),
        Some("tcp://192.168.1.21:4101")
    );
    assert!(list.found(hit("halonic-aa", "Desk upstairs", "192.168.1.21", 4101)));
    assert_eq!(names(&list), ["Desk upstairs"]);

    assert!(list.lost("halonic-aa"));
    assert!(!list.lost("halonic-aa"));
    assert!(list.view().is_empty());
    assert_eq!(list.endpoint("nearby-1"), None);
}

#[test]
fn phone_nearby_never_hands_out_an_id_again() {
    let mut list = NearbyComputers::new();
    list.found(hit("halonic-aa", "Desk", "192.168.1.20", 4100));
    assert!(list.clear());
    assert!(!list.clear());
    list.found(hit("halonic-aa", "Desk", "192.168.1.20", 4100));
    assert_eq!(list.endpoint("nearby-1"), None);
    assert_eq!(list.view()[0].id, "nearby-2");
}

#[test]
fn phone_nearby_drops_hits_whose_address_is_not_on_the_home_network() {
    let mut list = NearbyComputers::new();
    for address in [
        "127.0.0.1",
        "::ffff:127.0.0.1",
        "0.0.0.0",
        "255.255.255.255",
        "224.0.0.251",
        "8.8.8.8",
        "100.101.102.103",
        "fe80::1",
        "fd00::20",
        "::1",
        "my-laptop.local",
        "",
    ] {
        assert!(
            !list.found(hit("halonic-aa", "Desk", address, 4100)),
            "{address}"
        );
    }
    // An IPv4 address written in IPv6 form is judged as the IPv4 one.
    assert!(list.found(hit("halonic-aa", "Desk", "::ffff:192.168.1.20", 4100)));
    assert_eq!(
        list.endpoint("nearby-1").as_deref(),
        Some("tcp://192.168.1.20:4100")
    );
}

#[test]
fn phone_nearby_drops_hits_whose_name_the_phone_would_not_show() {
    let mut list = NearbyComputers::new();
    let long = "a".repeat(65);
    let bidi = format!("Desk{}kseD", '\u{202E}');
    for name in [
        "",
        "   ",
        long.as_str(),
        bidi.as_str(),
        "Desk\nTwo",
        "Desk\u{200B}",
    ] {
        assert!(
            !list.found(hit("halonic-aa", name, "192.168.1.20", 4100)),
            "{name:?}"
        );
    }
    let no_name = Hit {
        name: None,
        ..hit("halonic-aa", "", "192.168.1.20", 4100)
    };
    assert!(!list.found(no_name));

    // 64 bytes is the most a pairing name may hold; spaces at the ends go.
    let longest = "é".repeat(32);
    assert!(list.found(hit(
        "halonic-aa",
        &format!(" {longest} "),
        "192.168.1.20",
        4100
    )));
    assert_eq!(names(&list), [longest]);
}

#[test]
fn phone_nearby_drops_hits_with_no_port_or_an_odd_key() {
    let mut list = NearbyComputers::new();
    assert!(!list.found(hit("halonic-aa", "Desk", "192.168.1.20", 0)));
    assert!(!list.found(hit("", "Desk", "192.168.1.20", 4100)));
    assert!(!list.found(hit(&"k".repeat(129), "Desk", "192.168.1.20", 4100)));
    assert!(list.view().is_empty());
}

#[test]
fn phone_nearby_forgets_a_hit_that_turns_bad() {
    let mut list = NearbyComputers::new();
    list.found(hit("halonic-aa", "Desk", "192.168.1.20", 4100));
    // The same key now points at the phone itself: the earlier address no
    // longer says where the computer is.
    assert!(list.found(hit("halonic-aa", "Desk", "127.0.0.1", 4100)));
    assert!(list.view().is_empty());
    assert_eq!(list.endpoint("nearby-1"), None);
}

#[test]
fn phone_nearby_keeps_at_most_sixteen_computers() {
    let mut list = NearbyComputers::new();
    for number in 0..MAX_NEARBY + 4 {
        list.found(hit(
            &format!("halonic-{number}"),
            &format!("Computer {number:02}"),
            "192.168.1.20",
            4100,
        ));
    }
    assert_eq!(list.view().len(), MAX_NEARBY);
    // A lost one makes room again.
    assert!(list.lost("halonic-0"));
    assert!(list.found(hit("halonic-99", "Late", "192.168.1.20", 4100)));
}

#[test]
fn phone_nearby_start_pairs_at_the_endpoint_of_its_id() {
    let start = |nearby: &str| -> PairingStart {
        serde_json::from_value(json!({
            "route": "nearby",
            "code": "XX7A9Q36KFB3",
            "nearby": nearby,
            "again": "desk",
        }))
        .expect("a nearby start")
    };
    let mut list = NearbyComputers::new();
    list.found(hit("halonic-aa", "Desk", "192.168.1.20", 4100));

    let checked = start("nearby-1")
        .find_nearby(|id| list.endpoint(id))
        .check()
        .expect("a typed start at the computer's endpoint");
    assert_eq!(
        checked.endpoints,
        vec![halonic_tunnel::Endpoint::parse("tcp://192.168.1.20:4100").unwrap()]
    );
    assert_eq!(checked.route, halonic_tunnel::PairingRoute::Typed);
    assert!(checked.again.is_some());

    // An id the list doesn't hold, or a start the shell never looked up,
    // has nowhere to go.
    let cant_reach = Some(Problem::CantReach {
        reason: Reason::Unreachable,
    });
    let unknown = start("nearby-7").find_nearby(|id| list.endpoint(id));
    assert_eq!(unknown.check().err(), cant_reach);
    assert_eq!(start("nearby-1").check().err(), cant_reach);
}
