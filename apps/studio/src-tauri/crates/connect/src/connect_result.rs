//! What the shell's `connect` command returns to the connect page: one value
//! per screen or field error, shaped like the page's `ConnectResult`
//! (`apps/studio/src/connect/bridge.ts`). The page owns the words.

use serde::Serialize;

use crate::address::parse_address;
use crate::check::{CheckedAddress, ConnectError};
use crate::hello::{AppVersions, HelloOutcome, compare_versions, read_hello};

/// The most of the hello answer the app reads. A real answer is well under
/// 200 bytes; anything longer isn't Halonic, and stopping here means a
/// device that sends a huge answer can't fill the phone's memory.
pub const MAX_HELLO_BYTES: usize = 16 * 1024;

/// One outcome of a Connect press, in the order the spec checks them.
/// `address` is the address as typed, normalised for display; versions are
/// the computer's.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ConnectResult {
    /// Open `url`, the computer's address, in the app window.
    Connected {
        url: String,
    },
    NotAnAddress,
    NotHomeNetwork,
    NotAnswering {
        address: String,
    },
    NotHalonic {
        address: String,
    },
    AppTooOld {
        computer_version: String,
    },
    ComputerTooOld {
        computer_version: String,
    },
}

/// The hello answer's body, collected chunk by chunk up to
/// [`MAX_HELLO_BYTES`].
#[derive(Debug, Default)]
pub struct HelloBody {
    bytes: Vec<u8>,
    too_long: bool,
}

impl HelloBody {
    /// Adds the next chunk. Returns `false` once the body is too long; the
    /// caller then stops reading, and the answer counts as "not Halonic".
    pub fn push(&mut self, chunk: &[u8]) -> bool {
        if self.bytes.len() + chunk.len() > MAX_HELLO_BYTES {
            self.too_long = true;
            self.bytes.clear();
        } else {
            self.bytes.extend_from_slice(chunk);
        }
        !self.too_long
    }

    /// The body as text, unless it was too long or isn't UTF-8.
    fn text(&self) -> Option<&str> {
        if self.too_long {
            return None;
        }
        std::str::from_utf8(&self.bytes).ok()
    }
}

/// What the hello call brought back, as the shell's HTTP client saw it.
#[derive(Debug)]
pub enum HelloReply {
    /// Nothing answered in time: the connection was refused or timed out,
    /// or the secure connection failed.
    NoAnswer,
    /// An HTTP answer, never a followed redirect.
    Answer { status: u16, body: HelloBody },
}

impl ConnectResult {
    /// The result when the connect check refused `input`, before any call.
    pub fn refused(error: ConnectError, input: &str) -> Self {
        let address = || {
            parse_address(input)
                .map(|address| address.display_form())
                .unwrap_or_else(|_| input.trim().to_owned())
        };
        match error {
            ConnectError::NotAnAddress => ConnectResult::NotAnAddress,
            ConnectError::NotHomeNetwork => ConnectResult::NotHomeNetwork,
            ConnectError::NotAnswering => ConnectResult::NotAnswering { address: address() },
            ConnectError::NotHalonic => ConnectResult::NotHalonic { address: address() },
        }
    }

    /// The result after the hello call to a checked address.
    pub fn after_hello(checked: &CheckedAddress, reply: &HelloReply, app: &AppVersions) -> Self {
        let address = checked.address.display_form();
        let HelloReply::Answer { status, body } = reply else {
            return ConnectResult::NotAnswering { address };
        };
        let Some(hello) = body.text().and_then(|text| read_hello(*status, text).ok()) else {
            return ConnectResult::NotHalonic { address };
        };
        match compare_versions(&hello, app) {
            // "A newer app is available" is the served Studio's to show, so
            // the page needs only the address here.
            HelloOutcome::Connected { .. } => ConnectResult::Connected {
                url: checked.studio_url(),
            },
            HelloOutcome::AppTooOld { computer_version } => ConnectResult::AppTooOld {
                computer_version: computer_version.to_string(),
            },
            HelloOutcome::ComputerTooOld { computer_version } => ConnectResult::ComputerTooOld {
                computer_version: computer_version.to_string(),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::version::Version;

    fn checked(input: &str) -> CheckedAddress {
        let address = parse_address(input).expect("a test address");
        CheckedAddress {
            address,
            socket_addrs: vec!["192.168.1.20:4280".parse().expect("a test socket")],
        }
    }

    fn app() -> AppVersions {
        let v = |text| Version::parse(text).expect("a test version");
        AppVersions {
            app: v("0.2.0"),
            oldest_computer: v("0.2.0"),
        }
    }

    fn answer(status: u16, text: &str) -> HelloReply {
        let mut body = HelloBody::default();
        body.push(text.as_bytes());
        HelloReply::Answer { status, body }
    }

    fn after(reply: &HelloReply) -> ConnectResult {
        ConnectResult::after_hello(&checked("192.168.1.20:4280"), reply, &app())
    }

    #[test]
    fn connect_result_opens_the_studio_when_the_versions_fit() {
        let reply = answer(
            200,
            r#"{"product":"halonic","version":"0.2.0","minAppVersion":"0.1.0"}"#,
        );
        assert_eq!(
            after(&reply),
            ConnectResult::Connected {
                url: "http://192.168.1.20:4280/".to_owned()
            }
        );
    }

    #[test]
    fn connect_result_reports_both_version_screens_with_the_computers_version() {
        let app_too_old = answer(
            200,
            r#"{"product":"halonic","version":"0.3.1","minAppVersion":"0.3.0"}"#,
        );
        assert_eq!(
            after(&app_too_old),
            ConnectResult::AppTooOld {
                computer_version: "0.3.1".to_owned()
            }
        );
        let computer_too_old = answer(
            200,
            r#"{"product":"halonic","version":"0.1.0","minAppVersion":"0.1.0"}"#,
        );
        assert_eq!(
            after(&computer_too_old),
            ConnectResult::ComputerTooOld {
                computer_version: "0.1.0".to_owned()
            }
        );
    }

    #[test]
    fn connect_result_reports_no_answer_and_other_answers() {
        let not_answering = ConnectResult::NotAnswering {
            address: "192.168.1.20:4280".to_owned(),
        };
        assert_eq!(after(&HelloReply::NoAnswer), not_answering);
        let not_halonic = ConnectResult::NotHalonic {
            address: "192.168.1.20:4280".to_owned(),
        };
        assert_eq!(
            after(&answer(200, "<html>router login</html>")),
            not_halonic
        );
        assert_eq!(after(&answer(302, "")), not_halonic);
    }

    #[test]
    fn connect_result_stops_reading_a_hello_answer_that_is_too_long() {
        let mut body = HelloBody::default();
        assert!(body.push(br#"{"product":"halonic","version":"0.2.0","#));
        assert!(!body.push(&vec![b' '; MAX_HELLO_BYTES]));
        assert!(!body.push(br#""minAppVersion":"0.1.0"}"#));
        let reply = HelloReply::Answer { status: 200, body };
        assert!(matches!(after(&reply), ConnectResult::NotHalonic { .. }));
    }

    #[test]
    fn connect_result_shows_refused_addresses_as_typed() {
        assert_eq!(
            ConnectResult::refused(ConnectError::NotAnswering, " http://my-laptop.local:4280/ "),
            ConnectResult::NotAnswering {
                address: "my-laptop.local:4280".to_owned()
            }
        );
        assert_eq!(
            ConnectResult::refused(ConnectError::NotAnAddress, "my laptop"),
            ConnectResult::NotAnAddress
        );
        assert_eq!(
            ConnectResult::refused(ConnectError::NotHomeNetwork, "8.8.8.8"),
            ConnectResult::NotHomeNetwork
        );
    }

    #[test]
    fn connect_result_has_the_connect_pages_shape() {
        let shape = |result: ConnectResult| serde_json::to_value(result).expect("serialisable");
        assert_eq!(
            shape(ConnectResult::Connected {
                url: "http://192.168.1.20:4280/".to_owned()
            }),
            json!({"kind": "connected", "url": "http://192.168.1.20:4280/"})
        );
        assert_eq!(
            shape(ConnectResult::NotAnAddress),
            json!({"kind": "notAnAddress"})
        );
        assert_eq!(
            shape(ConnectResult::NotHomeNetwork),
            json!({"kind": "notHomeNetwork"})
        );
        assert_eq!(
            shape(ConnectResult::NotAnswering {
                address: "a".to_owned()
            }),
            json!({"kind": "notAnswering", "address": "a"})
        );
        assert_eq!(
            shape(ConnectResult::NotHalonic {
                address: "a".to_owned()
            }),
            json!({"kind": "notHalonic", "address": "a"})
        );
        assert_eq!(
            shape(ConnectResult::AppTooOld {
                computer_version: "0.3.1".to_owned()
            }),
            json!({"kind": "appTooOld", "computerVersion": "0.3.1"})
        );
        assert_eq!(
            shape(ConnectResult::ComputerTooOld {
                computer_version: "0.1.0".to_owned()
            }),
            json!({"kind": "computerTooOld", "computerVersion": "0.1.0"})
        );
    }
}
