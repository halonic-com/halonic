//! The relay's limits: how much it queues for the host and each client,
//! how many connections it keeps open, and how long it waits for the token
//! and for the host to read.

use std::io::{self, Write};
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};

use super::limits::{Limits, QUEUED_FRAMES, QUEUED_FRAMES_PER_CONNECTION};
use super::tests::{
    SHORT, TOKEN, WAIT, closed, connect, read_all, read_frame, relay_with_limits, wait_until,
};
use super::{DATA, END, FRAME_LIMIT, OPEN, RESET, Relay, frame};

#[test]
fn relay_resets_a_client_that_reads_nothing_past_the_backlog_limit() {
    let (relay, mut host) = relay_with_limits(Limits {
        backlog: 4 * FRAME_LIMIT,
        ..Limits::default()
    });
    let _idle = connect(&relay);
    assert_eq!(host.next(), (1, OPEN, Vec::new()));

    let mut output = host.output.take().expect("the output is open");
    std::thread::spawn(move || {
        // Far more than the socket's own buffers hold.
        let chunk = frame(1, DATA, &vec![1_u8; FRAME_LIMIT]);
        for _ in 0..1024 {
            if output.write_all(&chunk).is_err() {
                return;
            }
        }
        // Keeps the output open, so the relay doesn't stop.
        std::thread::sleep(WAIT);
    });

    assert_eq!(host.next(), (1, RESET, Vec::new()));
}

#[test]
fn relay_limits_shut_connections_past_the_limit_until_one_closes() {
    let (relay, mut host) = relay_with_limits(Limits {
        connections: 2,
        ..Limits::default()
    });
    let _first = connect(&relay);
    assert_eq!(host.next(), (1, OPEN, Vec::new()));
    let _second = connect(&relay);
    assert_eq!(host.next(), (2, OPEN, Vec::new()));

    let mut third = connect(&relay);
    assert!(closed(&mut third));

    host.send(1, RESET, &[]);
    wait_until(|| relay.shared.connections().open.len() == 1);
    let mut fourth = connect(&relay);
    assert_eq!(
        host.next(),
        (3, OPEN, Vec::new()),
        "a refused one takes no id"
    );
    host.send(3, END, &[]);
    assert_eq!(read_all(&mut fourth), b"");
}

#[test]
fn relay_limits_leave_room_in_the_queue_while_one_client_sends_a_big_body() {
    let mut relay = Relay::bind().expect("bind the relay");
    let (mut input, relay_input) = io::pipe().expect("a pipe");
    let (relay_output, _output) = io::pipe().expect("a pipe");
    relay.serve(relay_input, relay_output, TOKEN);
    let mut big = connect(&relay);
    // Far more than the queue to the host holds, and the host reads nothing yet.
    let body = vec![7_u8; 2 * QUEUED_FRAMES * FRAME_LIMIT];
    // Ends when the relay stops and shuts the socket.
    let _writer = std::thread::spawn(move || big.write_all(&body));
    let quota = || {
        let connections = relay.shared.connections();
        connections
            .open
            .get(&1)
            .map(|connection| connection.quota.queued())
    };
    wait_until(|| quota() == Some(QUEUED_FRAMES_PER_CONNECTION));

    let _small = connect(&relay);
    // The host reads nothing until the small one's `open` is queued: reading
    // earlier lets the big one refill its share ahead of it, however slowly
    // the relay accepts the connection.
    wait_until(|| relay.shared.opens_queued.load(Ordering::SeqCst) == 2);

    assert_eq!(read_frame(&mut input), Some((1, OPEN, Vec::new())));
    // Frames can be any size up to the limit, as the socket delivered them, so
    // count the bytes ahead of the small one, not the frames. Ahead of it
    // wait at most the big one's share, the frame being written, and what the
    // pipe holds, which is one frame's worth: never the whole queue.
    let mut bytes_before = 0;
    loop {
        let (id, kind, payload) = read_frame(&mut input).expect("a frame");
        if kind == OPEN {
            break;
        }
        assert_eq!(id, 1, "only the big one sent so far");
        bytes_before += payload.len();
    }
    let most = (QUEUED_FRAMES_PER_CONNECTION + 2) * FRAME_LIMIT;
    assert!(
        bytes_before <= most,
        "{bytes_before} bytes first, at most {most}"
    );
}

#[test]
fn relay_limits_close_a_connection_without_the_token_in_its_first_request() {
    let (relay, mut host) = relay_with_limits(Limits {
        token: SHORT,
        ..Limits::default()
    });
    let mut without = connect(&relay);
    without
        .write_all(b"GET / HTTP/1.1\r\nAuthorization: Bearer guess\r\n\r\n")
        .expect("send");
    assert_eq!(host.next(), (1, OPEN, Vec::new()));
    let mut with = connect(&relay);
    let head = format!("GET / HTTP/1.1\r\nAuthorization: Bearer {TOKEN}\r\n\r\n");
    with.write_all(head.as_bytes()).expect("send");

    // The host may still answer the first one before its deadline.
    loop {
        let (id, kind, _) = host.next();
        assert_ne!((id, kind), (2, RESET), "the one with the token stays open");
        if (id, kind) == (1, RESET) {
            break;
        }
    }
    assert!(closed(&mut without));
    host.send(2, DATA, b"served");
    host.send(2, END, &[]);
    assert_eq!(read_all(&mut with), b"served");
}

#[test]
fn relay_limits_stop_the_relay_when_the_host_reads_nothing_for_too_long() {
    let mut relay = Relay::bind_with_limits(Limits {
        host_read: SHORT,
        ..Limits::default()
    })
    .expect("bind the relay");
    let (mut input, relay_input) = io::pipe().expect("a pipe");
    let (relay_output, _output) = io::pipe().expect("a pipe");
    relay.serve(relay_input, relay_output, TOKEN);
    let mut idle = connect(&relay);
    let mut big = connect(&relay);
    // Far more than the pipe and the queue hold, and the host reads nothing.
    // Keep sending until the relay closes the connection: how much the socket
    // buffers take before that differs by platform (Windows takes a lot).
    let chunk = vec![7_u8; FRAME_LIMIT];
    let writer = std::thread::spawn(move || {
        let give_up = Instant::now() + Duration::from_secs(20);
        while Instant::now() < give_up {
            big.write_all(&chunk)?;
        }
        Ok::<(), io::Error>(())
    });

    assert!(closed(&mut idle), "the relay stopped");
    assert!(writer.join().expect("the writer ends").is_err());

    // Once the host reads again, it gets what was queued, then its input closes.
    let mut frames = 0;
    while read_frame(&mut input).is_some() {
        frames += 1;
    }
    // Two opens, the big one's share and the frame being written.
    assert!(
        frames <= QUEUED_FRAMES_PER_CONNECTION + 3,
        "{frames} frames"
    );
}
