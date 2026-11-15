//! The relay and the Google callback (HAL-10028): a stand-in host sees what
//! the relay forwards of a connection without the token.

use std::io::Write;
use std::net::Shutdown;
use std::sync::mpsc::RecvTimeoutError;

use super::limits::Limits;
use super::tests::{
    SHORT, StandIn, TOKEN, closed, connect, read_all, relay, relay_with_limits, wait_until,
};
use super::{DATA, OPEN, RESET, Relay};

const HEAD: &str = "GET /v1/google/callback?state=a&code=b HTTP/1.1\r\nHost: 127.0.0.1:1\r\n\r\n";

/// True when the host got no frame in a short while.
fn host_is_quiet(host: &StandIn) -> bool {
    matches!(
        host.frames.recv_timeout(SHORT),
        Err(RecvTimeoutError::Timeout)
    )
}

/// The host's next frames up to a reset, and whether any carried data.
fn data_until_reset(host: &StandIn, id: u32) -> Vec<u8> {
    let mut data = Vec::new();
    loop {
        let (got, kind, bytes) = host.next();
        assert_eq!(got, id);
        match kind {
            DATA => data.extend(bytes),
            RESET => return data,
            other => panic!("a frame of kind {other} before the reset"),
        }
    }
}

fn open_connections(relay: &Relay) -> usize {
    relay.shared.connections().open.len()
}

#[test]
fn relay_callback_passes_the_head_without_the_token_and_closes_with_the_answer() {
    let (relay, mut host) = relay();
    let mut client = connect(&relay);
    client.write_all(HEAD.as_bytes()).expect("send");

    assert_eq!(host.next(), (1, OPEN, Vec::new()));
    assert_eq!(host.next(), (1, DATA, HEAD.as_bytes().to_vec()));
    host.send(1, DATA, b"HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n");
    host.send(1, super::END, &[]);

    // The client never ends: the relay closes it when the host's answer ends.
    assert_eq!(
        read_all(&mut client),
        b"HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n"
    );
    wait_until(|| open_connections(&relay) == 0);
}

#[test]
fn relay_callback_forwards_exactly_the_head_when_a_second_request_follows_in_one_write() {
    let (relay, host) = relay();
    let mut client = connect(&relay);
    let both = format!("{HEAD}GET /v1/health HTTP/1.1\r\n\r\n");
    client.write_all(both.as_bytes()).expect("send");

    assert_eq!(host.next(), (1, OPEN, Vec::new()));
    assert_eq!(host.next(), (1, DATA, HEAD.as_bytes().to_vec()));
    client
        .write_all(b"GET /v1/health HTTP/1.1\r\n\r\n")
        .expect("send");
    client.shutdown(Shutdown::Write).expect("half-close");
    assert!(host_is_quiet(&host), "later bytes are dropped");
    assert_eq!(open_connections(&relay), 1);
}

#[test]
fn relay_callback_forwards_nothing_until_the_head_is_whole() {
    let (relay, host) = relay();
    let mut client = connect(&relay);
    assert_eq!(host.next(), (1, OPEN, Vec::new()));
    let (first, rest) = HEAD.split_at(30);

    for part in [&first[..10], &first[10..]] {
        client.write_all(part.as_bytes()).expect("send");
        assert!(host_is_quiet(&host), "no data while the head is open");
    }
    client.write_all(rest.as_bytes()).expect("send");
    assert_eq!(host.next(), (1, DATA, HEAD.as_bytes().to_vec()));
    assert_eq!(open_connections(&relay), 1);
}

#[test]
fn relay_callback_passes_bytes_a_client_sent_before_ending_without_a_request() {
    let (relay, host) = relay();
    let mut client = connect(&relay);
    client.write_all(b"GET /v1").expect("send");
    client.shutdown(Shutdown::Write).expect("half-close");

    assert_eq!(host.next(), (1, OPEN, Vec::new()));
    assert_eq!(host.next(), (1, DATA, b"GET /v1".to_vec()));
    assert_eq!(host.next(), (1, super::END, Vec::new()));
}

#[test]
fn relay_callback_closes_a_head_that_breaks_a_rule_and_forwards_none_of_it() {
    let long_query = "a".repeat(2049);
    for head in [
        "GET /v1/google/callback HTTP/1.1\r\ncontent-length: 0\r\n\r\n".to_owned(),
        "GET /v1/google/callback HTTP/1.1\r\nTRANSFER-ENCODING: chunked\r\n\r\n".to_owned(),
        "GET /v1/google/callback HTTP/1.1\r\nConnection: Upgrade\r\n\r\n".to_owned(),
        "GET /v1/google/callback HTTP/1.1\r\nA: b\nc\r\n\r\n".to_owned(),
        "GET /v1/google/callback HTTP/1.0\r\n\r\n".to_owned(),
        format!("GET /v1/google/callback?{long_query} HTTP/1.1\r\n\r\n"),
    ] {
        let (relay, host) = relay();
        let mut client = connect(&relay);
        client.write_all(head.as_bytes()).expect("send");

        assert_eq!(host.next(), (1, OPEN, Vec::new()), "{head:?}");
        assert_eq!(data_until_reset(&host, 1), b"", "{head:?}");
        assert!(closed(&mut client), "{head:?}");
    }
}

#[test]
fn relay_callback_lets_a_request_with_the_token_through_whatever_its_head_says() {
    let (relay, host) = relay();
    let mut client = connect(&relay);
    assert_eq!(host.next(), (1, OPEN, Vec::new()));
    let mut second = connect(&relay);
    assert_eq!(host.next(), (2, OPEN, Vec::new()));
    let head = format!(
        "POST /v1/google/callback HTTP/1.1\r\nAuthorization: Bearer {TOKEN}\r\nContent-Length: 2\r\n\r\nhi"
    );
    let call = format!(
        "GET /v1/google/callback HTTP/1.1\r\nauthorization: Bearer {TOKEN}\r\nContent-Length: 0\r\n\r\n"
    );
    client.write_all(head.as_bytes()).expect("send");
    second.write_all(call.as_bytes()).expect("send");

    let mut got = std::collections::HashMap::new();
    while got.len() < 2 {
        let (id, kind, bytes) = host.next();
        assert_eq!(kind, DATA);
        got.insert(id, bytes);
    }
    assert_eq!(got[&1], head.as_bytes());
    assert_eq!(got[&2], call.as_bytes());
    assert!(host_is_quiet(&host), "neither is reset");
}

#[test]
fn relay_callback_leaves_another_request_to_the_token_deadline() {
    let (relay, host) = relay_with_limits(Limits {
        token: SHORT,
        ..Limits::default()
    });
    let mut client = connect(&relay);
    client
        .write_all(b"POST /v1/google/callback HTTP/1.1\r\n\r\n")
        .expect("send");

    assert_eq!(host.next(), (1, OPEN, Vec::new()));
    assert_eq!(
        data_until_reset(&host, 1),
        b"POST /v1/google/callback HTTP/1.1\r\n\r\n"
    );
    assert!(closed(&mut client));
}

#[test]
fn relay_callback_closes_a_head_that_never_ends_at_the_head_deadline() {
    let (relay, host) = relay_with_limits(Limits {
        callback_head: SHORT,
        ..Limits::default()
    });
    let mut client = connect(&relay);
    // Ends in a bare LF pair, which is not the end of a head.
    client
        .write_all(b"GET /v1/google/callback HTTP/1.1\nHost: x\n\n")
        .expect("send");

    assert_eq!(host.next(), (1, OPEN, Vec::new()));
    assert_eq!(data_until_reset(&host, 1), b"");
    assert!(closed(&mut client));
    wait_until(|| open_connections(&relay) == 0);
}

#[test]
fn relay_callback_closes_an_answerless_connection_at_its_lifetime() {
    let (relay, host) = relay_with_limits(Limits {
        callback_lifetime: SHORT,
        ..Limits::default()
    });
    let mut client = connect(&relay);
    client.write_all(HEAD.as_bytes()).expect("send");

    assert_eq!(host.next(), (1, OPEN, Vec::new()));
    assert_eq!(host.next(), (1, DATA, HEAD.as_bytes().to_vec()));
    assert_eq!(host.next(), (1, RESET, Vec::new()));
    assert!(closed(&mut client));
}

#[test]
fn relay_callback_keeps_a_place_for_the_token_when_its_own_places_are_taken() {
    let (relay, host) = relay_with_limits(Limits {
        callback_connections: 2,
        ..Limits::default()
    });
    let mut held = Vec::new();
    for id in 1..=2 {
        let mut client = connect(&relay);
        client
            .write_all(b"GET /v1/google/callback HTTP/1.1\r\nHost: x\r\n")
            .expect("send");
        assert_eq!(host.next(), (id, OPEN, Vec::new()));
        held.push(client);
    }
    wait_until(|| {
        let connections = relay.shared.connections();
        connections.open.values().all(|c| c.holds_callback_place())
    });

    let mut third = connect(&relay);
    third.write_all(HEAD.as_bytes()).expect("send");
    assert_eq!(host.next(), (3, OPEN, Vec::new()));
    assert_eq!(data_until_reset(&host, 3), b"", "no place for a third");
    assert!(closed(&mut third));

    let mut with_token = connect(&relay);
    let head = format!("GET /v1/health HTTP/1.1\r\nAuthorization: Bearer {TOKEN}\r\n\r\n");
    with_token.write_all(head.as_bytes()).expect("send");
    assert_eq!(host.next(), (4, OPEN, Vec::new()));
    assert_eq!(host.next(), (4, DATA, head.into_bytes()));

    // A place frees when its holder closes.
    drop(held.pop());
    assert_eq!(host.next(), (2, RESET, Vec::new()));
    let mut again = connect(&relay);
    again.write_all(HEAD.as_bytes()).expect("send");
    assert_eq!(host.next(), (5, OPEN, Vec::new()));
    assert_eq!(host.next(), (5, DATA, HEAD.as_bytes().to_vec()));
}
