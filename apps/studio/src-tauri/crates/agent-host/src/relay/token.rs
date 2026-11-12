//! Whether a connection's first request carries the host's token. The host
//! checks every request itself; the relay only looks, so it can close a
//! connection that holds a place without the token (HAL-7659).

/// The most of a first request's head the relay keeps to look for the token.
/// Studio's heads are far smaller.
const HEAD_LIMIT: usize = 16 * 1024;

/// Looks for `Authorization: Bearer <token>` in the head of a connection's
/// first request, as the client sends it.
pub(super) struct TokenCheck {
    expected: Vec<u8>,
    head: Vec<u8>,
    done: bool,
}

impl TokenCheck {
    pub(super) fn new(token: &str) -> Self {
        Self {
            expected: format!("Bearer {token}").into_bytes(),
            head: Vec::new(),
            done: false,
        }
    }

    /// Takes the client's next bytes. True once the head had the token;
    /// after a head without it, or past the limit, it stays false.
    pub(super) fn found(&mut self, bytes: &[u8]) -> bool {
        if self.done {
            return false;
        }
        let room = HEAD_LIMIT - self.head.len();
        self.head.extend_from_slice(&bytes[..bytes.len().min(room)]);
        let Some(end) = find(&self.head, b"\r\n\r\n") else {
            self.done = self.head.len() == HEAD_LIMIT;
            return false;
        };
        self.done = true;
        let head = std::mem::take(&mut self.head);
        head[..end]
            .split(|&byte| byte == b'\n')
            .any(|line| self.is_token(line))
    }

    /// True for the header line `Authorization: Bearer <token>`, its name in
    /// any case and its value trimmed, as the host reads it.
    fn is_token(&self, line: &[u8]) -> bool {
        let Some(colon) = line.iter().position(|&byte| byte == b':') else {
            return false;
        };
        let (name, value) = (&line[..colon], &line[colon + 1..]);
        name.eq_ignore_ascii_case(b"authorization")
            && constant_time_equal(value.trim_ascii(), &self.expected)
    }
}

fn find(bytes: &[u8], needle: &[u8]) -> Option<usize> {
    bytes
        .windows(needle.len())
        .position(|window| window == needle)
}

/// Compares without stopping at the first difference, so the time taken
/// doesn't tell how much of the token a guess got right.
fn constant_time_equal(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.iter()
        .zip(right)
        .fold(0_u8, |difference, (a, b)| difference | (a ^ b))
        == 0
}

#[cfg(test)]
mod tests {
    use super::{HEAD_LIMIT, TokenCheck};

    const TOKEN: &str = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";

    #[test]
    fn relay_limits_token_check_finds_the_token_in_a_head_sent_in_pieces() {
        let mut check = TokenCheck::new(TOKEN);
        assert!(!check.found(b"GET /v1/health HTTP/1.1\r\nauthorization:  Bearer "));
        let rest = format!("{TOKEN} \r\nhost: 127.0.0.1\r\n\r\n");
        assert!(check.found(rest.as_bytes()));
    }

    #[test]
    fn relay_limits_token_check_refuses_a_head_without_the_token_for_good() {
        for head in [
            "GET / HTTP/1.1\r\nhost: x\r\n\r\n".to_owned(),
            "GET / HTTP/1.1\r\nAuthorization: Bearer wrong\r\n\r\n".to_owned(),
            format!("GET / HTTP/1.1\r\nX-Authorization: Bearer {TOKEN}\r\n\r\n"),
            format!("GET / HTTP/1.1\r\n\r\nAuthorization: Bearer {TOKEN}\r\n\r\n"),
        ] {
            let mut check = TokenCheck::new(TOKEN);
            assert!(!check.found(head.as_bytes()), "{head:?}");
            let later = format!("GET / HTTP/1.1\r\nAuthorization: Bearer {TOKEN}\r\n\r\n");
            assert!(!check.found(later.as_bytes()), "only the first head counts");
        }
    }

    #[test]
    fn relay_limits_token_check_gives_up_on_a_head_past_the_limit() {
        let mut check = TokenCheck::new(TOKEN);
        assert!(!check.found(&vec![b'a'; HEAD_LIMIT + 1]));
        let late = format!("\r\nAuthorization: Bearer {TOKEN}\r\n\r\n");
        assert!(!check.found(late.as_bytes()));
    }
}
