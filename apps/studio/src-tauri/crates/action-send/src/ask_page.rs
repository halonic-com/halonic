//! The page of the shell's dialog with text fields (HAL-18085), and how its
//! answer is read. The shell shows it in a window of its own, as it does the
//! server-session brief (HAL-18014): a fixed page served from its own scheme
//! to that window only, with no script, in a window no capability names.
//!
//! Send posts the form to the shell's own scheme, so what the user typed
//! reaches the shell in the request's body: never in an address, the
//! navigation guard or the Studio page. [`read_form`] decodes each value
//! into a buffer that is zeroed when dropped, then zeroes the body.

use crate::ask::{AskSheet, Typed, TypedText};
use crate::wipe::{Wiped, wipe_bytes};

/// The window's label. No file in `capabilities/` names it.
pub const WINDOW: &str = "action-dialog";

/// The scheme the page is served from, to [`WINDOW`] only.
pub const SCHEME: &str = "halonic-action";

/// The address the window opens. Windows' webview loads a custom scheme as
/// `http://<scheme>.localhost/`, so the page's own links use [`BASE`].
pub const OPEN_URL: &str = "halonic-action://localhost/";

#[cfg(windows)]
const BASE: &str = "http://halonic-action.localhost/";
#[cfg(not(windows))]
const BASE: &str = "halonic-action://localhost/";

/// Where the form may be sent: the shell's own scheme only.
#[cfg(windows)]
const FORM_ACTION: &str = "http://halonic-action.localhost";
#[cfg(not(windows))]
const FORM_ACTION: &str = "halonic-action:";

/// The paths the window may load: the page, and the form's answer.
pub const PAGE_PATH: &str = "/";
pub const SEND_PATH: &str = "/send";
const CANCEL_PATH: &str = "/cancel";

/// The largest answer read. A secret is a key or a password, far smaller.
pub const MAX_FORM_BYTES: usize = 64 * 1024;

/// What a navigation in the dialog's window does.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AskNavigation {
    /// The page loads.
    Load,
    /// The form is sent to the shell, which reads it and closes the window.
    Send,
    /// Cancel: nothing loads, and nothing is sent.
    Cancel,
    /// Anything else: nothing loads.
    Refuse,
}

/// Decides one navigation in the dialog's window.
pub fn ask_navigation(url: &str) -> AskNavigation {
    let Some(path) = url.strip_prefix(BASE.trim_end_matches('/')) else {
        return AskNavigation::Refuse;
    };
    match path {
        PAGE_PATH => AskNavigation::Load,
        SEND_PATH => AskNavigation::Send,
        CANCEL_PATH => AskNavigation::Cancel,
        _ => AskNavigation::Refuse,
    }
}

/// The page's content security policy: no script, no request out, nothing
/// framed, and the form sent only to the shell's own scheme.
pub fn page_policy() -> String {
    format!(
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; \
         form-action {FORM_ACTION}; frame-ancestors 'none'"
    )
}

/// What the window shows once the form is sent, until the shell closes it.
pub const SENT_PAGE: &str = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">\
<title>Sending</title></head><body></body></html>";

fn escape(text: &str) -> String {
    let mut escaped = String::with_capacity(text.len());
    for character in text.chars() {
        match character {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&#39;"),
            other => escaped.push(other),
        }
    }
    escaped
}

/// The page: what the `admin` confirmation shows (the account, the method,
/// the address the shell built and the body), a field for the target's
/// name, a masked field for each secret, and Cancel and Send.
pub fn ask_page(sheet: &AskSheet) -> String {
    let confirm = &sheet.confirm;
    let mut call = format!("{} {}", confirm.method, confirm.address);
    for (name, value) in &confirm.fields {
        call.push_str(&format!("\n{name}: {value}"));
    }
    let mut fields = String::new();
    if let Some(target) = &sheet.target {
        fields.push_str(&format!(
            r#"<label for="target">This can't be undone. Type <strong>{target}</strong> to send.</label>
<input id="target" name="target" type="text" required autofocus autocomplete="off" autocapitalize="off" spellcheck="false">
"#,
            target = escape(target),
        ));
    }
    for (index, name) in sheet.secrets.iter().enumerate() {
        fields.push_str(&format!(
            r#"<label for="secret-{index}">{name}</label>
<input id="secret-{index}" name="secret-{index}" type="password" required autocomplete="off">
"#,
            name = escape(name),
        ));
    }
    format!(
        r#"<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Send this request?</title>
<style>{STYLE}</style>
</head>
<body>
<form method="post" action="{BASE}send" accept-charset="utf-8" autocomplete="off">
<h1>Send this request?</h1>
<p>As {account}:</p>
<pre>{call}</pre>
{fields}<p>Send only if you just pressed Run in Halonic.</p>
<nav><a href="{BASE}cancel">Cancel</a><button type="submit">Send</button></nav>
</form>
</body>
</html>
"#,
        account = escape(&confirm.account),
        call = escape(&call),
    )
}

/// Reads the sent form: the target's name when the sheet asks for it, and
/// one value for each secret field, nothing else and nothing twice. Zeroes
/// `body` whatever it holds. `None` for anything else, which sends nothing.
pub fn read_form(sheet: &AskSheet, body: &mut [u8]) -> Option<Typed> {
    let typed = parse_form(sheet, body);
    wipe_bytes(body);
    typed
}

fn parse_form(sheet: &AskSheet, body: &[u8]) -> Option<Typed> {
    if body.len() > MAX_FORM_BYTES {
        return None;
    }
    let mut target: Option<TypedText> = None;
    let mut secrets: Vec<Option<TypedText>> = sheet.secrets.iter().map(|_| None).collect();
    for pair in body
        .split(|byte| *byte == b'&')
        .filter(|pair| !pair.is_empty())
    {
        let split = pair.iter().position(|byte| *byte == b'=')?;
        let (name, value) = (&pair[..split], &pair[split + 1..]);
        let slot = if name == b"target" && sheet.target.is_some() {
            &mut target
        } else {
            secrets.get_mut(secret_index(name)?)?
        };
        if slot.is_some() {
            return None;
        }
        *slot = Some(decode(value)?);
    }
    if sheet.target.is_some() && target.is_none() {
        return None;
    }
    let secrets = sheet
        .secrets
        .iter()
        .zip(secrets)
        .map(|(name, value)| Some((name.clone(), value?)))
        .collect::<Option<Vec<_>>>()?;
    Some(Typed { target, secrets })
}

/// `secret-<n>`: the field for the sheet's `n`th secret.
fn secret_index(name: &[u8]) -> Option<usize> {
    let digits = name.strip_prefix(b"secret-")?;
    if digits.is_empty() || digits.len() > 3 || !digits.iter().all(u8::is_ascii_digit) {
        return None;
    }
    std::str::from_utf8(digits).ok()?.parse().ok()
}

/// Decodes one form value (`+` is a space, `%XX` a byte) into a buffer
/// sized so it never grows, zeroed if the value turns out not to be UTF-8.
fn decode(raw: &[u8]) -> Option<TypedText> {
    let mut out = Wiped(Vec::with_capacity(raw.len()));
    let mut index = 0;
    while let Some(&byte) = raw.get(index) {
        let decoded = match byte {
            b'+' => b' ',
            b'%' => {
                let high = hex_digit(*raw.get(index + 1)?)?;
                let low = hex_digit(*raw.get(index + 2)?)?;
                index += 2;
                high * 16 + low
            }
            other => other,
        };
        out.0.push(decoded);
        index += 1;
    }
    match String::from_utf8(std::mem::take(&mut out.0)) {
        Ok(text) => Some(TypedText::new(text)),
        Err(error) => {
            wipe_bytes(&mut error.into_bytes());
            None
        }
    }
}

fn hex_digit(byte: u8) -> Option<u8> {
    char::from(byte)
        .to_digit(16)
        .and_then(|digit| u8::try_from(digit).ok())
}

const STYLE: &str = "
:root { color-scheme: light dark; font: 13px system-ui, -apple-system, sans-serif; }
body { margin: 0; padding: 16px; }
form { display: flex; flex-direction: column; gap: 8px; }
h1 { font-size: 15px; margin: 0; }
p { margin: 0; overflow-wrap: anywhere; }
pre { margin: 0; padding: 8px; border: 1px solid GrayText; border-radius: 6px; font: 12px ui-monospace, monospace; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 200px; overflow: auto; }
input { font: 13px ui-monospace, monospace; padding: 6px 8px; }
nav { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
a, button { padding: 6px 16px; border: 1px solid GrayText; border-radius: 6px; color: CanvasText; background: Canvas; text-decoration: none; font: inherit; }
a:focus-visible, button:focus-visible, input:focus-visible { outline: 2px solid Highlight; outline-offset: 2px; }
button { background: Highlight; color: HighlightText; border-color: Highlight; }
";
