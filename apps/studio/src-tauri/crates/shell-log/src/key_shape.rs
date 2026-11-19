//! Text shaped like an API key: the same formats as `findSecretShape` in
//! `@halonicjs/std`, which Studio's chats and the engine's run records ask,
//! so a line the agent host prints is held back where they would hold it.

/// The kinds of key [`find_key_shape`] spots, with the prefix each starts
/// with. `sk-` covers OpenAI and Anthropic keys (`sk-proj-…`, `sk-ant-…`);
/// `GOCSPX-` is a Google OAuth client secret.
const KEY_PREFIXES: [(&str, &str); 6] = [
    ("ai-provider-key", "sk-"),
    ("google-client-secret", "GOCSPX-"),
    ("google-api-key", "AIza"),
    ("github-token", "ghp_"),
    ("github-token", "github_pat_"),
    ("slack-token", "xoxb-"),
];

/// How many key characters must follow the prefix, so that words such as
/// `sk-learn` or a prefix named in a sentence don't count.
const MIN_KEY_BODY: usize = 16;

/// The kind of the first key-shaped text in `text`, or `None`. Only the kind
/// leaves the check, never the text that matched.
///
/// A key is one of the prefixes at the start of a run of key characters
/// (letters, digits, `-` and `_`), so `task-…` or `xGOCSPX-…` never match,
/// followed by at least 16 more key characters that hold a digit or a
/// capital letter: real keys are random mixed-case text, and lowercase slugs
/// such as `sk-learn-tutorial-for-beginners` are not.
pub fn find_key_shape(text: &str) -> Option<&'static str> {
    let bytes = text.as_bytes();
    (0..bytes.len())
        .filter(|&start| start == 0 || !is_key_byte(bytes[start - 1]))
        .find_map(|start| {
            KEY_PREFIXES.iter().find_map(|&(kind, prefix)| {
                let body = bytes[start..].strip_prefix(prefix.as_bytes())?;
                is_key_body(body).then_some(kind)
            })
        })
}

/// Whether the run of key characters at the start of `rest` is long enough
/// and holds a digit or a capital letter.
fn is_key_body(rest: &[u8]) -> bool {
    let run: Vec<u8> = rest
        .iter()
        .copied()
        .take_while(|&byte| is_key_byte(byte))
        .collect();
    run.len() >= MIN_KEY_BODY
        && run
            .iter()
            .any(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit())
}

fn is_key_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_'
}
