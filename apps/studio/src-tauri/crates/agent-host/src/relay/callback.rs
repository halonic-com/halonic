//! Whether a first request is one a browser redirect sends back from a
//! sign-in: the only requests the relay passes without the host's token.
//! Google's callback (HAL-10028) has one fixed path; an integration's sign-in
//! (HAL-13427) has a new random one for each start. The relay judges the whole
//! head before it forwards a byte of it; the host still checks `Host`,
//! `Origin`, the path and `state` itself.

/// The most of a head the relay keeps while it waits for its end.
pub(super) const HEAD_LIMIT: usize = 16 * 1024;

/// The longest query a callback may carry. A real callback with a dozen
/// Google scopes is about 0.9 KiB (`relay-callback.md`).
pub(super) const QUERY_LIMIT: usize = 2 * 1024;

const HEAD_END: &[u8] = b"\r\n\r\n";
const REQUEST_END: &[u8] = b" HTTP/1.1";

/// The method and path of a callback: a fixed start, then a random part of
/// exactly `random` base64url characters (none for Google's).
struct CallbackPath {
    start: &'static [u8],
    random: usize,
}

/// The callbacks the relay passes without the token, and only these.
const CALLBACK_PATHS: [CallbackPath; 2] = [
    // Google's sign-in (`relayCallbackPath` of the agent host).
    CallbackPath {
        start: b"GET /v1/google/callback",
        random: 0,
    },
    // An integration's sign-in: `/sign-in/` and a `createState` value, 32
    // random bytes in base64url (`signInCallbackPrefix` of the agent host).
    CallbackPath {
        start: b"GET /sign-in/",
        random: 43,
    },
];

impl CallbackPath {
    /// How many bytes the method and path take, random part included.
    fn length(&self) -> usize {
        self.start.len() + self.random
    }

    /// True when `sent`, at most [`Self::length`] bytes, could be the start of
    /// this method and path.
    fn could_start(&self, sent: &[u8]) -> bool {
        sent.len() <= self.length()
            && sent
                .iter()
                .enumerate()
                .all(|(at, &byte)| match self.start.get(at) {
                    Some(&expected) => byte == expected,
                    None => is_base64url(byte),
                })
    }

    /// True when `sent` holds this whole method and path, then a space or `?`.
    fn is_started_by(&self, sent: &[u8]) -> bool {
        sent.len() > self.length()
            && self.could_start(&sent[..self.length()])
            && matches!(sent[self.length()], b' ' | b'?')
    }
}

/// Headers that make a request carry a body or leave HTTP/1.1, so a head is
/// refused whatever their value.
const REFUSED_HEADERS: [&[u8]; 4] = [
    b"content-length",
    b"transfer-encoding",
    b"upgrade",
    b"expect",
];

/// What the bytes a connection sent so far say.
#[derive(Debug, PartialEq, Eq)]
pub(super) enum Judgement {
    /// Too little to tell: what came so far is the start of a callback's
    /// method and path, or all of it.
    Undecided,
    /// The head is not complete, and what came so far could still be a callback.
    Waiting,
    /// Not a callback request: the connection goes on as any other, and the
    /// token deadline and the host decide.
    Another,
    /// A complete head that is a callback request, this many bytes long.
    Callback(usize),
    /// A head that starts like a callback but breaks a rule: close the connection.
    Refused,
}

/// Judges the bytes a connection sent so far, all of them from its first.
pub(super) fn judge(sent: &[u8]) -> Judgement {
    let path = match callback_path_of(sent) {
        PathSoFar::Unfinished => return Judgement::Undecided,
        PathSoFar::Another => return Judgement::Another,
        PathSoFar::Callback(path) => path,
    };
    let Some(at) = sent
        .windows(HEAD_END.len())
        .position(|part| part == HEAD_END)
    else {
        return if sent.len() >= HEAD_LIMIT {
            Judgement::Refused
        } else {
            Judgement::Waiting
        };
    };
    let length = at + HEAD_END.len();
    if length <= HEAD_LIMIT && is_callback_head(&sent[..at], path) {
        Judgement::Callback(length)
    } else {
        Judgement::Refused
    }
}

/// What the first bytes of a request say about its method and path.
enum PathSoFar {
    /// They could still become a callback's.
    Unfinished,
    /// They are a callback's whole method and path, then a space or `?`.
    Callback(&'static CallbackPath),
    /// They are not a callback's, whatever comes after.
    Another,
}

fn callback_path_of(sent: &[u8]) -> PathSoFar {
    if let Some(path) = CALLBACK_PATHS.iter().find(|path| path.is_started_by(sent)) {
        return PathSoFar::Callback(path);
    }
    if CALLBACK_PATHS.iter().any(|path| path.could_start(sent)) {
        return PathSoFar::Unfinished;
    }
    PathSoFar::Another
}

/// Checks a head without its closing blank line.
fn is_callback_head(head: &[u8], path: &CallbackPath) -> bool {
    // A bare CR or LF, or any control byte, could be read as a line end by
    // one parser and not by another.
    let lines_are_crlf = head.iter().enumerate().all(|(at, &byte)| match byte {
        b'\r' => head.get(at + 1) == Some(&b'\n'),
        b'\n' => at > 0 && head[at - 1] == b'\r',
        _ => !byte.is_ascii_control(),
    });
    if !lines_are_crlf {
        return false;
    }
    let mut lines = head
        .split(|&byte| byte == b'\n')
        .map(|line| line.strip_suffix(b"\r").unwrap_or(line));
    let Some(request_line) = lines.next() else {
        return false;
    };
    is_request_line(request_line, path) && lines.all(is_allowed_header)
}

/// The callback's method and path, which [`judge`] has checked already, then
/// `?query` of at most [`QUERY_LIMIT`] plain bytes, then ` HTTP/1.1`, byte for
/// byte.
fn is_request_line(line: &[u8], path: &CallbackPath) -> bool {
    let Some(target_and_version) = line.get(path.length()..) else {
        return false;
    };
    let Some(rest) = target_and_version.strip_prefix(b"?") else {
        return target_and_version == REQUEST_END;
    };
    let Some(version_at) = rest.iter().position(|&byte| byte == b' ') else {
        return false;
    };
    let (query, version) = rest.split_at(version_at);
    version == REQUEST_END
        && query.len() <= QUERY_LIMIT
        && query
            .iter()
            .all(|&byte| byte.is_ascii_graphic() && byte != b'#')
}

/// A header line that does not give the request a body or leave HTTP/1.1.
/// A line that starts with a space, or has no colon, is refused too: it
/// could fold into the line before it.
fn is_allowed_header(line: &[u8]) -> bool {
    if line.first().is_some_and(u8::is_ascii_whitespace) {
        return false;
    }
    let Some(colon) = line.iter().position(|&byte| byte == b':') else {
        return false;
    };
    let name = line[..colon].trim_ascii_end();
    // A name with a space or other non-token byte is not a header the host's
    // parser has to read the way the relay does, so the relay refuses it.
    if !is_token(name) {
        return false;
    }
    let value = line[colon + 1..].trim_ascii();
    let refused = REFUSED_HEADERS
        .iter()
        .any(|refused| name.eq_ignore_ascii_case(refused));
    let upgrades = name.eq_ignore_ascii_case(b"connection")
        && value
            .split(|&byte| byte == b',')
            .any(|option| option.trim_ascii().eq_ignore_ascii_case(b"upgrade"));
    !refused && !upgrades
}

/// A character of base64url without padding: `A-Z`, `a-z`, `0-9`, `-`, `_`.
fn is_base64url(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_'
}

/// A non-empty header name of HTTP token characters (RFC 9110, 5.6.2).
fn is_token(name: &[u8]) -> bool {
    !name.is_empty()
        && name
            .iter()
            .all(|&byte| byte.is_ascii_alphanumeric() || b"!#$%&'*+-.^_`|~".contains(&byte))
}

#[cfg(test)]
mod tests {
    use super::{Judgement, QUERY_LIMIT, judge};

    fn callback(head: &str) -> Judgement {
        judge(head.as_bytes())
    }

    #[test]
    fn relay_callback_judges_the_exact_request_line_with_or_without_a_query() {
        let plain = "GET /v1/google/callback HTTP/1.1\r\nHost: 127.0.0.1:1\r\n\r\n";
        assert_eq!(callback(plain), Judgement::Callback(plain.len()));
        let query = "GET /v1/google/callback?state=a&code=4%2F0A HTTP/1.1\r\n\r\n";
        assert_eq!(callback(query), Judgement::Callback(query.len()));
    }

    #[test]
    fn relay_callback_ends_the_judgement_at_the_first_blank_line() {
        let head = "GET /v1/google/callback HTTP/1.1\r\n\r\n";
        let sent = format!("{head}GET /v1/health HTTP/1.1\r\n\r\n");
        assert_eq!(callback(&sent), Judgement::Callback(head.len()));
    }

    #[test]
    fn relay_callback_waits_for_the_head_to_end_and_for_a_bare_lf_head_for_good() {
        assert_eq!(callback("GET /v1/google/call"), Judgement::Undecided);
        assert_eq!(callback("GET /v1/google/callback ?"), Judgement::Waiting);
        assert_eq!(
            callback("GET /v1/google/callback HTTP/1.1\r\nHost: x\r\n"),
            Judgement::Waiting
        );
        assert_eq!(
            callback("GET /v1/google/callback HTTP/1.1\nHost: x\n\n"),
            Judgement::Waiting,
            "never complete, so the head deadline closes it"
        );
    }

    #[test]
    fn relay_callback_leaves_another_request_to_the_token_rules() {
        for sent in [
            "POST /v1/google/callback HTTP/1.1\r\n\r\n",
            "GET /v1/health HTTP/1.1\r\n\r\n",
            "GET /v1/google/callbackx HTTP/1.1\r\n\r\n",
            "GET /v1/google/callback/ HTTP/1.1\r\n\r\n",
            "GET /v1/google/callback\r\n\r\n",
            "get /v1/google/callback HTTP/1.1\r\n\r\n",
            "GET /v1/Google/callback HTTP/1.1\r\n\r\n",
            "hello",
        ] {
            assert_eq!(callback(sent), Judgement::Another, "{sent:?}");
        }
    }

    #[test]
    fn relay_callback_refuses_a_request_line_that_is_not_exact() {
        for line in [
            "GET /v1/google/callback?a=b",
            "GET /v1/google/callback HTTP/1.0",
            "GET /v1/google/callback  HTTP/1.1",
            "GET /v1/google/callback?a=b#frag HTTP/1.1",
            "GET /v1/google/callback?a=b c HTTP/1.1",
            "GET /v1/google/callback?a=%C3%A9\u{e9} HTTP/1.1",
        ] {
            let sent = format!("{line}\r\n\r\n");
            assert_eq!(callback(&sent), Judgement::Refused, "{line:?}");
        }
    }

    #[test]
    fn relay_callback_refuses_a_query_over_the_limit_and_takes_one_at_it() {
        let at = format!(
            "GET /v1/google/callback?{} HTTP/1.1\r\n\r\n",
            "a".repeat(QUERY_LIMIT)
        );
        assert!(matches!(callback(&at), Judgement::Callback(_)));
        let over = format!(
            "GET /v1/google/callback?{} HTTP/1.1\r\n\r\n",
            "a".repeat(QUERY_LIMIT + 1)
        );
        assert_eq!(callback(&over), Judgement::Refused);
    }

    #[test]
    fn relay_callback_refuses_a_head_with_a_bare_cr_a_bare_lf_or_a_control_byte() {
        for head in [
            "GET /v1/google/callback HTTP/1.1\r\nA: b\rc\r\n\r\n",
            "GET /v1/google/callback HTTP/1.1\r\nA: b\nc\r\n\r\n",
            "GET /v1/google/callback HTTP/1.1\r\nA: b\0c\r\n\r\n",
            "GET /v1/google/callback?a=\x01 HTTP/1.1\r\n\r\n",
            "GET /v1/google/callback HTTP/1.1\r\nA: b\x7f\r\n\r\n",
        ] {
            assert_eq!(callback(head), Judgement::Refused, "{head:?}");
        }
    }

    #[test]
    fn relay_callback_refuses_a_head_that_gives_a_body_or_leaves_http_1_1() {
        for header in [
            "content-length: 0",
            "Content-Length: 5",
            "Content-Length : 5",
            "TRANSFER-ENCODING: chunked",
            "Upgrade: websocket",
            "Connection: keep-alive, Upgrade",
            "connection: UPGRADE",
            "Expect: 100-continue",
            " folded: line",
            "no colon here",
        ] {
            let head = format!("GET /v1/google/callback HTTP/1.1\r\nHost: x\r\n{header}\r\n\r\n");
            assert_eq!(callback(&head), Judgement::Refused, "{header:?}");
        }
        let fine = "GET /v1/google/callback HTTP/1.1\r\nConnection: close\r\nCookie: a=b\r\n\r\n";
        assert!(matches!(callback(fine), Judgement::Callback(_)));
    }

    #[test]
    fn relay_callback_refuses_a_head_past_the_limit() {
        let sent = format!(
            "GET /v1/google/callback HTTP/1.1\r\nCookie: {}",
            "a".repeat(20_000)
        );
        assert_eq!(callback(&sent), Judgement::Refused);
        let ended = format!("{sent}\r\n\r\n");
        assert_eq!(callback(&ended), Judgement::Refused);
    }

    #[test]
    fn relay_callback_refuses_a_header_name_that_is_not_a_token() {
        for header in [
            "Content Length: 0",
            ": x",
            "Ho(st: x",
            "Host\u{e9}: x",
            "A B:x",
        ] {
            let head = format!("GET /v1/google/callback HTTP/1.1\r\n{header}\r\n\r\n");
            assert_eq!(callback(&head), Judgement::Refused, "{header:?}");
        }
        let spaced = "GET /v1/google/callback HTTP/1.1\r\nHost : x\r\n\r\n";
        assert_eq!(callback(spaced), Judgement::Callback(spaced.len()));
    }

    /// A sign-in's random part as `createState` makes it: 43 base64url characters.
    const RANDOM: &str = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123-_Q";

    #[test]
    fn relay_callback_judges_a_sign_in_path_with_its_random_part() {
        assert_eq!(RANDOM.len(), 43);
        let plain = format!("GET /sign-in/{RANDOM} HTTP/1.1\r\nHost: 127.0.0.1:1\r\n\r\n");
        assert_eq!(callback(&plain), Judgement::Callback(plain.len()));
        let query = format!("GET /sign-in/{RANDOM}?state=a&code=b HTTP/1.1\r\n\r\n");
        assert_eq!(callback(&query), Judgement::Callback(query.len()));
    }

    #[test]
    fn relay_callback_waits_while_a_sign_in_path_is_still_coming() {
        assert_eq!(callback("GET /sign-"), Judgement::Undecided);
        assert_eq!(callback("GET /sign-in/abc"), Judgement::Undecided);
        let whole = format!("GET /sign-in/{RANDOM}");
        assert_eq!(callback(&whole), Judgement::Undecided);
        assert_eq!(callback(&format!("{whole} HTTP")), Judgement::Waiting);
    }

    #[test]
    fn relay_callback_leaves_a_sign_in_path_of_another_shape_to_the_token_rules() {
        let short = &RANDOM[1..];
        for path in [
            format!("/sign-in/{short}"),
            format!("/sign-in/{RANDOM}a"),
            format!("/sign-in/{RANDOM}/"),
            format!("/sign-in/{RANDOM}/x"),
            format!("/sign-in/{short}="),
            format!("/sign-in/{short}."),
            format!("/sign-in/{short}%"),
            format!("/sign-in//{short}"),
            format!("/Sign-in/{RANDOM}"),
            "/sign-in/".to_owned(),
            "/sign-in".to_owned(),
        ] {
            let sent = format!("GET {path} HTTP/1.1\r\n\r\n");
            assert_eq!(callback(&sent), Judgement::Another, "{path:?}");
        }
        let post = format!("POST /sign-in/{RANDOM} HTTP/1.1\r\n\r\n");
        assert_eq!(callback(&post), Judgement::Another);
    }

    #[test]
    fn relay_callback_holds_a_sign_in_head_to_the_same_rules() {
        let line = format!("GET /sign-in/{RANDOM}");
        for head in [
            format!("{line} HTTP/1.0\r\n\r\n"),
            format!("{line}?a=b#frag HTTP/1.1\r\n\r\n"),
            format!("{line}?{} HTTP/1.1\r\n\r\n", "a".repeat(QUERY_LIMIT + 1)),
            format!("{line} HTTP/1.1\r\nContent-Length: 0\r\n\r\n"),
            format!("{line} HTTP/1.1\r\nConnection: Upgrade\r\n\r\n"),
            format!("{line} HTTP/1.1\r\nA: b\nc\r\n\r\n"),
            format!("{line} HTTP/1.1\r\nCookie: {}\r\n\r\n", "a".repeat(20_000)),
        ] {
            assert_eq!(callback(&head), Judgement::Refused, "{head:.80?}");
        }
        let at = format!("{line}?{} HTTP/1.1\r\n\r\n", "a".repeat(QUERY_LIMIT));
        assert!(matches!(callback(&at), Judgement::Callback(_)));
    }
}
