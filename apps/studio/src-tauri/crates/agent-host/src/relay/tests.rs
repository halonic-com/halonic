//! A stand-in host in the test's own threads takes the frames the relay
//! writes and answers with frames of its own, over pipes.

use std::io::{self, PipeReader, PipeWriter, Read, Write};
use std::net::{Ipv4Addr, Shutdown, TcpListener, TcpStream};
use std::sync::atomic::Ordering;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::time::{Duration, Instant};

use super::limits::{Limits, QUEUED_FRAMES, QUEUED_FRAMES_PER_CONNECTION};
use super::{DATA, END, FRAME_LIMIT, OPEN, RESET, Relay, frame};

/// Long enough for a thread to run on a busy CI machine.
const WAIT: Duration = Duration::from_secs(20);

/// Short, so a test waits little for a deadline to pass.
const SHORT: Duration = Duration::from_millis(300);

const TOKEN: &str = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";

type Frame = (u32, u8, Vec<u8>);

/// The host's side of a relay: the frames it got, and its output.
struct StandIn {
    frames: Receiver<Frame>,
    output: Option<PipeWriter>,
}

impl StandIn {
    fn next(&self) -> Frame {
        self.frames
            .recv_timeout(WAIT)
            .expect("the relay sends a frame")
    }

    /// True once the relay closed the host's input.
    fn input_closed(&self) -> bool {
        loop {
            match self.frames.recv_timeout(WAIT) {
                Ok(_) => {}
                Err(RecvTimeoutError::Disconnected) => return true,
                Err(RecvTimeoutError::Timeout) => return false,
            }
        }
    }

    /// The connection's bytes up to its end, skipping no other frame.
    fn bytes_until_end(&self, id: u32) -> Vec<u8> {
        let mut bytes = Vec::new();
        loop {
            let (got, kind, data) = self.next();
            assert_eq!(got, id);
            match kind {
                DATA => bytes.extend(data),
                END => return bytes,
                other => panic!("a frame of kind {other} before the end"),
            }
        }
    }

    fn send(&mut self, id: u32, kind: u8, bytes: &[u8]) {
        let output = self.output.as_mut().expect("the output is open");
        output
            .write_all(&frame(id, kind, bytes))
            .expect("write a frame");
    }
}

fn relay() -> (Relay, StandIn) {
    relay_with_limits(Limits::default())
}

fn relay_with_limits(limits: Limits) -> (Relay, StandIn) {
    let mut relay = Relay::bind_with_limits(limits).expect("bind the relay");
    let (mut input, relay_input) = io::pipe().expect("a pipe");
    let (relay_output, output) = io::pipe().expect("a pipe");
    relay.serve(relay_input, relay_output, TOKEN);
    let (sender, frames) = mpsc::channel();
    std::thread::spawn(move || {
        while let Some(frame) = read_frame(&mut input) {
            if sender.send(frame).is_err() {
                return;
            }
        }
    });
    let stand_in = StandIn {
        frames,
        output: Some(output),
    };
    (relay, stand_in)
}

/// The next frame the relay wrote to the host's input, until it closes it.
fn read_frame(input: &mut PipeReader) -> Option<Frame> {
    let mut header = [0_u8; 9];
    input.read_exact(&mut header).ok()?;
    let id = u32::from_be_bytes([header[0], header[1], header[2], header[3]]);
    let length = u32::from_be_bytes([header[5], header[6], header[7], header[8]]);
    let mut bytes = vec![0_u8; length as usize];
    input.read_exact(&mut bytes).expect("a whole frame");
    Some((id, header[4], bytes))
}

/// Waits until `done` holds, for state the test can't wait on otherwise.
fn wait_until(mut done: impl FnMut() -> bool) {
    let deadline = Instant::now() + WAIT;
    while !done() {
        assert!(Instant::now() < deadline, "waited too long");
        std::thread::sleep(Duration::from_millis(5));
    }
}

fn connect(relay: &Relay) -> TcpStream {
    let client = TcpStream::connect((Ipv4Addr::LOCALHOST, relay.port())).expect("connect");
    client.set_read_timeout(Some(WAIT)).expect("a read timeout");
    client
}

fn read_all(client: &mut TcpStream) -> Vec<u8> {
    let mut bytes = Vec::new();
    client.read_to_end(&mut bytes).expect("the relay closes it");
    bytes
}

/// True when the relay closed the client's connection, by end or reset.
fn closed(client: &mut TcpStream) -> bool {
    let mut byte = [0_u8; 1];
    match client.read(&mut byte) {
        Ok(read) => read == 0,
        Err(error) => !matches!(
            error.kind(),
            io::ErrorKind::WouldBlock | io::ErrorKind::TimedOut
        ),
    }
}

#[test]
fn relay_passes_a_connection_both_ways_and_ends_it() {
    let (relay, mut host) = relay();
    let mut client = connect(&relay);
    client.write_all(b"GET / HTTP/1.1\r\n\r\n").expect("send");
    client.shutdown(Shutdown::Write).expect("half-close");

    assert_eq!(host.next(), (1, OPEN, Vec::new()));
    assert_eq!(host.bytes_until_end(1), b"GET / HTTP/1.1\r\n\r\n");
    host.send(1, DATA, b"HTTP/1.1 200 OK\r\n");
    host.send(1, DATA, b"\r\n");
    host.send(1, END, &[]);

    assert_eq!(read_all(&mut client), b"HTTP/1.1 200 OK\r\n\r\n");
}

#[test]
fn relay_numbers_connections_and_keeps_them_apart() {
    let (relay, mut host) = relay();
    let mut first = connect(&relay);
    assert_eq!(host.next(), (1, OPEN, Vec::new()));
    let mut second = connect(&relay);
    assert_eq!(host.next(), (2, OPEN, Vec::new()));

    host.send(2, DATA, b"second");
    host.send(1, DATA, b"first");
    host.send(2, END, &[]);
    host.send(1, END, &[]);

    assert_eq!(read_all(&mut second), b"second");
    assert_eq!(read_all(&mut first), b"first");
}

#[test]
fn relay_splits_what_a_client_sends_into_frames_of_at_most_64_kib() {
    let (relay, host) = relay();
    let mut client = connect(&relay);
    let body = vec![7_u8; 3 * FRAME_LIMIT + 5];
    client.write_all(&body).expect("send");
    client.shutdown(Shutdown::Write).expect("half-close");

    assert_eq!(host.next(), (1, OPEN, Vec::new()));
    let mut got = Vec::new();
    loop {
        let (_, kind, bytes) = host.next();
        if kind == END {
            break;
        }
        assert!(bytes.len() <= FRAME_LIMIT);
        got.extend(bytes);
    }
    assert_eq!(got, body);
}

#[test]
fn relay_closes_a_client_the_host_reset_and_drops_its_later_frames() {
    let (relay, mut host) = relay();
    let mut client = connect(&relay);
    assert_eq!(host.next(), (1, OPEN, Vec::new()));

    host.send(1, RESET, &[]);
    assert!(closed(&mut client));

    // Sent before the host saw the connection close: dropped, not a break.
    host.send(1, DATA, b"late");
    let mut next = connect(&relay);
    assert_eq!(host.next(), (2, OPEN, Vec::new()));
    host.send(2, DATA, b"still served");
    host.send(2, END, &[]);
    assert_eq!(read_all(&mut next), b"still served");
}

#[test]
fn relay_resets_a_connection_when_its_client_drops_it() {
    let (relay, mut host) = relay();
    let client = connect(&relay);
    assert_eq!(host.next(), (1, OPEN, Vec::new()));
    drop(client);
    assert_eq!(host.next(), (1, END, Vec::new()));

    // Writing to a socket the client dropped fails sooner or later.
    let mut answer = None;
    for _ in 0..1000 {
        host.send(1, DATA, &[0_u8; 1024]);
        if let Ok(frame) = host.frames.try_recv() {
            answer = Some(frame);
            break;
        }
        std::thread::sleep(Duration::from_millis(5));
    }
    let answer = answer.or_else(|| host.frames.recv_timeout(WAIT).ok());
    assert_eq!(answer, Some((1, RESET, Vec::new())));
}

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
fn relay_stops_on_a_frame_for_a_connection_it_never_opened() {
    let (relay, mut host) = relay();
    let mut client = connect(&relay);
    assert_eq!(host.next(), (1, OPEN, Vec::new()));

    host.send(9, DATA, b"stray");

    assert!(host.input_closed());
    assert!(closed(&mut client));
}

#[test]
fn relay_stops_on_an_unknown_kind_or_an_open_from_the_host() {
    for kind in [OPEN, 9] {
        let (relay, mut host) = relay();
        let _client = connect(&relay);
        assert_eq!(host.next(), (1, OPEN, Vec::new()));
        host.send(1, kind, &[]);
        assert!(host.input_closed(), "kind {kind}");
    }
}

#[test]
fn relay_stops_on_a_frame_over_64_kib() {
    let (relay, mut host) = relay();
    let mut client = connect(&relay);
    assert_eq!(host.next(), (1, OPEN, Vec::new()));

    let mut header = frame(1, DATA, &[]);
    header[5..9].copy_from_slice(&u32::try_from(FRAME_LIMIT + 1).unwrap().to_be_bytes());
    host.output.as_mut().unwrap().write_all(&header).unwrap();

    assert!(host.input_closed());
    assert!(closed(&mut client));
}

#[test]
fn relay_closes_every_client_when_the_host_output_ends() {
    let (relay, mut host) = relay();
    let mut client = connect(&relay);
    assert_eq!(host.next(), (1, OPEN, Vec::new()));

    drop(host.output.take());

    assert!(closed(&mut client));
    assert!(host.input_closed());
}

#[test]
fn relay_stop_closes_the_host_input_and_every_client() {
    let (relay, host) = relay();
    let mut client = connect(&relay);
    assert_eq!(host.next(), (1, OPEN, Vec::new()));

    relay.stop();

    assert!(host.input_closed());
    assert!(closed(&mut client));
}

#[test]
fn relay_closes_a_connection_accepted_while_it_stops() {
    let relay = Relay::bind().expect("bind the relay");
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).expect("bind");
    let mut client =
        TcpStream::connect(listener.local_addr().expect("an address")).expect("connect");
    client.set_read_timeout(Some(WAIT)).expect("a read timeout");
    let (socket, _) = listener.accept().expect("accept");

    relay.stop();
    assert!(relay.shared.open(socket, TOKEN).is_ok());

    assert!(relay.shared.connections().open.is_empty());
    assert!(closed(&mut client));
}

#[test]
fn relay_stop_wakes_no_one_when_nothing_accepts() {
    let mut relay = Relay::bind().expect("bind the relay");

    relay.stop();

    let (listener, _, _) = relay.waiting.take().expect("never served");
    listener.set_nonblocking(true).expect("non-blocking");
    let waiting = listener.accept().map(|_| ()).map_err(|error| error.kind());
    assert_eq!(waiting, Err(io::ErrorKind::WouldBlock));
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
    let body = vec![7_u8; 2 * QUEUED_FRAMES * FRAME_LIMIT];
    let writer = std::thread::spawn(move || big.write_all(&body));

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
