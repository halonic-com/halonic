//! A stand-in host in the test's own threads takes the frames the relay
//! writes and answers with frames of its own, over pipes.

use std::io::{self, PipeWriter, Read, Write};
use std::net::{Ipv4Addr, Shutdown, TcpStream};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::time::Duration;

use super::{DATA, END, FRAME_LIMIT, OPEN, RESET, Relay, frame};

/// Long enough for a thread to run on a busy CI machine.
const WAIT: Duration = Duration::from_secs(20);

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
    relay_with_backlog_limit(super::BACKLOG_LIMIT)
}

fn relay_with_backlog_limit(limit: usize) -> (Relay, StandIn) {
    let mut relay = Relay::bind_with_backlog_limit(limit).expect("bind the relay");
    let (mut input, relay_input) = io::pipe().expect("a pipe");
    let (relay_output, output) = io::pipe().expect("a pipe");
    relay.serve(relay_input, relay_output);
    let (sender, frames) = mpsc::channel();
    std::thread::spawn(move || {
        let mut header = [0_u8; 9];
        while input.read_exact(&mut header).is_ok() {
            let id = u32::from_be_bytes([header[0], header[1], header[2], header[3]]);
            let length = u32::from_be_bytes([header[5], header[6], header[7], header[8]]);
            let mut bytes = vec![0_u8; length as usize];
            input.read_exact(&mut bytes).expect("a whole frame");
            if sender.send((id, header[4], bytes)).is_err() {
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
    let (relay, mut host) = relay_with_backlog_limit(4 * FRAME_LIMIT);
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
