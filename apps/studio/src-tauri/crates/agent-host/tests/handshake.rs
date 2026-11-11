use halonic_agent_host::{AgentHostError, read_handshake};

/// A made-up token of the right form, 43 base64url characters.
const TOKEN: &str = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ-_01234";

fn line(url: &str, token: &str) -> String {
    format!("{{\"url\":\"{url}\",\"token\":\"{token}\"}}\n")
}

fn refusal(line: &str) -> String {
    match read_handshake(line) {
        Err(AgentHostError::Handshake(message)) => message,
        other => panic!("expected a refused handshake, got {other:?}"),
    }
}

#[test]
fn handshake_reads_the_hosts_line() {
    let handshake = read_handshake(&line("http://127.0.0.1:49152", TOKEN)).expect("valid");
    assert_eq!(handshake.url(), "http://127.0.0.1:49152");
    assert_eq!(handshake.token(), TOKEN);
}

#[test]
fn handshake_never_shows_the_token_in_debug() {
    let handshake = read_handshake(&line("http://127.0.0.1:49152", TOKEN)).expect("valid");
    let shown = format!("{handshake:?}");
    assert!(!shown.contains(TOKEN), "{shown}");
    assert!(shown.contains("http://127.0.0.1:49152"), "{shown}");
}

#[test]
fn handshake_refuses_any_address_but_loopback() {
    for url in [
        "http://localhost:49152",
        "http://127.0.0.2:49152",
        "https://127.0.0.1:49152",
        "http://127.0.0.1:49152/",
        "http://127.0.0.1:49152@example.com",
        "http://127.0.0.1",
        "http://127.0.0.1:",
        "http://127.0.0.1:0",
        "http://127.0.0.1:080",
        "http://127.0.0.1:65536",
        "http://127.0.0.1:+80",
    ] {
        assert_eq!(
            refusal(&line(url, TOKEN)),
            "The agent host's handshake was refused: its url isn't http://127.0.0.1:<port>.",
            "{url}"
        );
    }
}

#[test]
fn handshake_refuses_a_token_of_the_wrong_form() {
    let short = &TOKEN[1..];
    let long = format!("{TOKEN}a");
    let padded = format!("{}=", &TOKEN[1..]);
    for token in [short, long.as_str(), padded.as_str(), ""] {
        assert_eq!(
            refusal(&line("http://127.0.0.1:49152", token)),
            "The agent host's handshake was refused: its token isn't 43 base64url characters.",
            "{token}"
        );
    }
}

#[test]
fn handshake_refuses_other_lines_without_repeating_them() {
    let extra = format!("{{\"url\":\"http://127.0.0.1:1\",\"token\":\"{TOKEN}\",\"more\":1}}");
    for text in [
        "",
        "not json",
        &format!("{{\"token\":\"{TOKEN}\"}}"),
        &extra,
        &format!("[\"http://127.0.0.1:1\",\"{TOKEN}\"]"),
    ] {
        let message = refusal(text);
        assert_eq!(
            message,
            "The agent host's handshake was refused: it isn't {\"url\",\"token\"} as JSON."
        );
        assert!(!message.contains(TOKEN));
    }
}
