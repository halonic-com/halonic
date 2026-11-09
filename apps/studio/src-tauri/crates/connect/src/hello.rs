//! Reads the computer's answer to `GET /api/hello` and compares versions
//! (flow-install-update 5.4).

use serde_json::Value;

use crate::version::Version;

/// The app's own version and the oldest computer version it works with.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppVersions {
    pub app: Version,
    pub oldest_computer: Version,
}

/// What the computer said: `{"product": "halonic", "version", "minAppVersion"}`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Hello {
    pub version: Version,
    pub min_app_version: Version,
}

/// Something answered, but it isn't Halonic.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NotHalonic;

/// Reads the hello answer. Anything but a `200` with that JSON is
/// [`NotHalonic`], including a redirect: the call never follows one.
/// Fields other than the three are ignored, so the computer can add some.
pub fn read_hello(status: u16, body: &str) -> Result<Hello, NotHalonic> {
    if status != 200 {
        return Err(NotHalonic);
    }
    let answer: Value = serde_json::from_str(body).map_err(|_| NotHalonic)?;
    if answer.get("product").and_then(Value::as_str) != Some("halonic") {
        return Err(NotHalonic);
    }
    let version_field = |name: &str| {
        answer
            .get(name)
            .and_then(Value::as_str)
            .and_then(Version::parse)
            .ok_or(NotHalonic)
    };
    Ok(Hello {
        version: version_field("version")?,
        min_app_version: version_field("minAppVersion")?,
    })
}

/// What the app shows after a hello answer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HelloOutcome {
    /// Open the computer's address. `newer_app` is the computer's version
    /// when it is newer than the app, for "A newer app is available".
    Connected { newer_app: Option<Version> },
    /// "This app is too old for Halonic on your computer (`computer_version`)."
    /// The version in brackets is the computer's, not `minAppVersion`.
    AppTooOld { computer_version: Version },
    /// "Halonic on your computer (`computer_version`) is too old for this app."
    ComputerTooOld { computer_version: Version },
}

/// Compares the hello answer with the app's versions. When both sides are too
/// old for each other, the app's side wins: a new app is the fix the user can
/// make on the phone.
pub fn compare_versions(hello: &Hello, app: &AppVersions) -> HelloOutcome {
    if hello.min_app_version > app.app {
        HelloOutcome::AppTooOld {
            computer_version: hello.version.clone(),
        }
    } else if hello.version < app.oldest_computer {
        HelloOutcome::ComputerTooOld {
            computer_version: hello.version.clone(),
        }
    } else {
        let newer_app = (hello.version > app.app).then(|| hello.version.clone());
        HelloOutcome::Connected { newer_app }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(text: &str) -> Version {
        Version::parse(text).expect("a test version")
    }

    fn hello(version: &str, min_app_version: &str) -> Hello {
        Hello {
            version: v(version),
            min_app_version: v(min_app_version),
        }
    }

    fn app(app: &str, oldest_computer: &str) -> AppVersions {
        AppVersions {
            app: v(app),
            oldest_computer: v(oldest_computer),
        }
    }

    #[test]
    fn hello_answer_reads_halonic() {
        let body = r#"{"product":"halonic","version":"0.1.1","minAppVersion":"0.1.0","extra":1}"#;
        assert_eq!(read_hello(200, body), Ok(hello("0.1.1", "0.1.0")));
    }

    #[test]
    fn hello_answer_accepts_pre_release_versions() {
        let body =
            r#"{"product":"halonic","version":"0.1.0-beta.1","minAppVersion":"0.1.0-beta.1"}"#;
        assert_eq!(
            read_hello(200, body),
            Ok(hello("0.1.0-beta.1", "0.1.0-beta.1"))
        );
    }

    #[test]
    fn hello_answer_is_not_halonic_otherwise() {
        let good = r#"{"product":"halonic","version":"0.1.0","minAppVersion":"0.1.0"}"#;
        assert_eq!(read_hello(302, good), Err(NotHalonic));
        assert_eq!(read_hello(404, good), Err(NotHalonic));
        for body in [
            "",
            "<html>router login</html>",
            "[]",
            r#"{"product":"other","version":"0.1.0","minAppVersion":"0.1.0"}"#,
            r#"{"version":"0.1.0","minAppVersion":"0.1.0"}"#,
            r#"{"product":"halonic","minAppVersion":"0.1.0"}"#,
            r#"{"product":"halonic","version":"0.1.0"}"#,
            r#"{"product":"halonic","version":"latest","minAppVersion":"0.1.0"}"#,
            r#"{"product":"halonic","version":1,"minAppVersion":"0.1.0"}"#,
        ] {
            assert_eq!(read_hello(200, body), Err(NotHalonic), "{body:?}");
        }
    }

    #[test]
    fn hello_versions_connect_when_both_sides_fit() {
        let same = compare_versions(&hello("0.1.0", "0.1.0"), &app("0.1.0", "0.1.0"));
        assert_eq!(same, HelloOutcome::Connected { newer_app: None });
        let computer_newer = compare_versions(&hello("0.1.1", "0.1.0"), &app("0.1.0", "0.1.0"));
        assert_eq!(
            computer_newer,
            HelloOutcome::Connected {
                newer_app: Some(v("0.1.1"))
            }
        );
        let app_newer = compare_versions(&hello("0.1.0", "0.1.0"), &app("0.1.1", "0.1.0"));
        assert_eq!(app_newer, HelloOutcome::Connected { newer_app: None });
    }

    #[test]
    fn hello_versions_app_too_old() {
        // The computer's version is shown, not `minAppVersion`.
        let outcome = compare_versions(&hello("0.2.1", "0.2.0"), &app("0.1.0", "0.1.0"));
        assert_eq!(
            outcome,
            HelloOutcome::AppTooOld {
                computer_version: v("0.2.1")
            }
        );
        let both = compare_versions(&hello("0.1.0", "0.3.0"), &app("0.2.0", "0.2.0"));
        assert_eq!(
            both,
            HelloOutcome::AppTooOld {
                computer_version: v("0.1.0")
            }
        );
    }

    #[test]
    fn hello_versions_computer_too_old() {
        let outcome = compare_versions(&hello("0.1.0", "0.1.0"), &app("0.2.0", "0.2.0"));
        assert_eq!(
            outcome,
            HelloOutcome::ComputerTooOld {
                computer_version: v("0.1.0")
            }
        );
        let beta = compare_versions(&hello("0.2.0-beta.1", "0.1.0"), &app("0.2.0", "0.2.0"));
        assert_eq!(
            beta,
            HelloOutcome::ComputerTooOld {
                computer_version: v("0.2.0-beta.1")
            }
        );
    }
}
