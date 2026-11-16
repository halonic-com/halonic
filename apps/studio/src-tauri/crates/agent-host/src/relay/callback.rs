//! Whether a first request is the one Google's browser redirect sends: the
//! only request the relay passes without the host's token (HAL-10028). The
//! relay judges the whole head before it forwards a byte of it; the host
//! still checks `Host`, `Origin` and `state` itself.

/// The most of a head the relay keeps while it waits for its end.
pub(super) const HEAD_LIMIT: usize = 16 * 1024;

/// The longest query a callback may carry. A real callback with a dozen
/// Google scopes is about 0.9 KiB (`relay-callback.md`).
pub(super) const QUERY_LIMIT: usize = 2 * 1024;

const HEAD_END: &[u8] = b"\r\n\r\n";
const REQUEST_START: &[u8] = b"GET /v1/google/callback";
const REQUEST_END: &[u8] = b" HTTP/1.1";

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
    /// Too little to tell: what came so far is the start of
    /// `GET /v1/google/callback`, or all of it.
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
    if !starts_like_callback(sent) {
        return Judgement::Another;
    }
    if sent.len() <= REQUEST_START.len() {
        return Judgement::Undecided;
    }
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
    if length <= HEAD_LIMIT && is_callback_head(&sent[..at]) {
        Judgement::Callback(length)
    } else {
        Judgement::Refused
    }
}

/// True while `sent` could still become `GET /v1/google/callback` followed by
/// a space or `?`: any other first bytes are not a callback's.
fn starts_like_callback(sent: &[u8]) -> bool {
    if sent.len() <= REQUEST_START.len() {
        return REQUEST_START.starts_with(sent);
    }
    sent.starts_with(REQUEST_START) && matches!(sent[REQUEST_START.len()], b' ' | b'?')
}

/// Checks a head without its closing blank line.
fn is_callback_head(head: &[u8]) -> bool {
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
    is_request_line(request_line) && lines.all(is_allowed_header)
}

/// `GET /v1/google/callback`, then `?query` of at most [`QUERY_LIMIT`]
/// plain bytes, then ` HTTP/1.1`, byte for byte.
fn is_request_line(line: &[u8]) -> bool {
    let Some(target_and_version) = line.strip_prefix(REQUEST_START) else {
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
}
