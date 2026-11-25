//! Tests for `studio.src-tauri.crates.engine-supervisor.engine-stderr`
//! (HAL-18245, from the HAL-14212 security review; HAL-18253): the real
//! engine role in Node, under the shell's supervisor, prints two secrets the
//! broker gave it on stderr, one shaped like a key and one with no known
//! shape, and neither value reaches `shell.log`.
//!
//! Ignored in plain `cargo test`, because it needs pnpm and the workspace's
//! packages. CI's Rust job has both and runs it with `--ignored`. Its own
//! test binary, since the shell's log is named once per process: the tests
//! share one engine run, and so one log.

#![allow(
    clippy::disallowed_methods,
    reason = "a test's programs share its console"
)]

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use halonic_engine_supervisor::{EngineProcess, LinkEnd, LinkWatcher};
use halonic_secret_broker::{SecretBroker, WorkspaceTrust};
use halonic_secrets::{MemoryBackend, SecretBackend, SecretName};

/// The engine, from the repository root.
const CANARY_ENGINE: &str = "apps/agent-host/src/engine/engine-stderr-canary.test-helper.ts";

/// What the engine prints once it has printed the canary's lines.
const PRINTED_MARKER: &str = "acme canary: printed";

/// What the engine prints in place of a secret the broker gave it.
const REDACTED: &str = "[redacted]";

/// Each canary is printed 3 ways: console.log, console.error and the engine's own error line.
const PRINTS_PER_CANARY: usize = 3;

/// Node, the engine's packages and the workspace take a while on a cold runner.
const WAIT: Duration = Duration::from_secs(60);

const POLL: Duration = Duration::from_millis(50);

/// The canary: an invented value shaped like an OpenAI project key, so a
/// match anywhere in the log can only come from the engine's stderr.
fn canary() -> String {
    format!("sk-proj-AcmeCanary{}", "Q7x".repeat(8))
}

/// The second canary: an invented value with no known key shape, like a
/// refresh token or a password, which the shell's key-shape filter can't
/// recognise. Only the engine's own redaction keeps it out of the log.
const SHAPELESS_CANARY: &str = "acme-refresh-Q7xQ7xQ7xQ7x";

struct Trusted;

impl WorkspaceTrust for Trusted {
    fn is_trusted(&self) -> Result<bool, String> {
        Ok(true)
    }
}

struct Quiet;

impl LinkWatcher for Quiet {
    fn health_changed(&self) {}
    fn ended(&self, _end: LinkEnd) {}
}

/// A folder of the test's own, removed when it ends, however it ends.
struct TempFolder(PathBuf);

impl TempFolder {
    fn new() -> Self {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |since| since.as_nanos());
        let path = std::env::temp_dir().join(format!(
            "halonic-engine-stderr-{}-{nanos}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("the test's folder");
        Self(path)
    }
}

impl Drop for TempFolder {
    fn drop(&mut self) {
        let _already_gone = fs::remove_dir_all(&self.0);
    }
}

/// An invented workspace, and an empty profile folder beside it.
fn acme_folders(root: &Path) -> (PathBuf, PathBuf) {
    let workspace = root.join("acme");
    fs::create_dir_all(&workspace).expect("the workspace folder");
    fs::write(workspace.join("workspace.yaml"), "id: acme\nname: Acme\n")
        .expect("the workspace file");
    (workspace, root.join("profile"))
}

/// The canary engine, as `engine_command` would run the real one.
fn canary_engine(profile_folder: &Path, workspace: &Path) -> Command {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../../..");
    let mut command = Command::new("pnpm");
    command
        .args([
            "exec",
            "node",
            CANARY_ENGINE,
            "--engine",
            "--profile-folder",
        ])
        .arg(profile_folder)
        .arg("--workspace")
        .arg(workspace)
        .current_dir(root);
    command
}

fn broker_with_canary() -> SecretBroker {
    let backend = MemoryBackend::new();
    backend
        .set(&SecretName::parse("acme_api_key").unwrap(), &canary())
        .unwrap();
    backend
        .set(
            &SecretName::parse("acme_refresh_token").unwrap(),
            SHAPELESS_CANARY,
        )
        .unwrap();
    SecretBroker::with_timeout(Arc::new(backend), Arc::new(Trusted), WAIT)
}

/// The log's text once it holds `marker`.
fn log_once_it_holds(log: &Path, marker: &str) -> String {
    let deadline = Instant::now() + WAIT;
    loop {
        let text = fs::read_to_string(log).unwrap_or_default();
        if text.contains(marker) {
            return text;
        }
        assert!(
            Instant::now() < deadline,
            "the engine printed no {marker:?} in time; the log holds:\n{text}"
        );
        std::thread::sleep(POLL);
    }
}

/// The log's text after one run of the canary engine, shared by the tests.
/// The run's folders are removed before it returns.
fn logged_text() -> &'static str {
    static TEXT: OnceLock<String> = OnceLock::new();
    TEXT.get_or_init(|| {
        let folder = TempFolder::new();
        let (workspace, profile_folder) = acme_folders(&folder.0);
        let log = profile_folder
            .join("studio")
            .join(halonic_shell_log::FILE_NAME);
        halonic_shell_log::start(log.clone());

        let engine = EngineProcess::start(
            canary_engine(&profile_folder, &workspace),
            broker_with_canary(),
            Arc::new(Quiet),
        )
        .expect("the engine starts; run `pnpm install` at the repository root first");
        // The canary engine reads the secrets once it hears where the sandbox host is.
        engine
            .link()
            .send_sandbox_host(None)
            .expect("the engine reads its input");
        let text = log_once_it_holds(&log, PRINTED_MARKER);
        // Dropping closes the engine's input, which ends it at once: after a
        // `stop` it waits for that close anyway.
        drop(engine);
        text
    })
}

#[test]
#[ignore = "needs pnpm and the workspace's packages; CI's Rust job runs it"]
fn engine_stderr_never_logs_a_broker_secret() {
    let text = logged_text();
    assert!(
        !text.contains("acme canary: the read failed"),
        "the broker handed the canaries over:\n{text}"
    );
    assert!(
        !text.contains(&canary()) && !text.contains("AcmeCanary"),
        "the canary reached the log:\n{text}"
    );
    // Both canaries, each printed three ways, redacted by the engine itself.
    assert_eq!(
        text.matches(REDACTED).count(),
        2 * PRINTS_PER_CANARY,
        "the log holds:\n{text}"
    );
}

#[test]
#[ignore = "needs pnpm and the workspace's packages; CI's Rust job runs it"]
fn engine_stderr_never_logs_a_shapeless_broker_secret() {
    let text = logged_text();
    assert!(
        !text.contains("acme canary: the read failed"),
        "the broker handed the canaries over:\n{text}"
    );
    assert!(
        !text.contains(SHAPELESS_CANARY) && !text.contains("acme-refresh"),
        "the shapeless canary reached the log:\n{text}"
    );
    assert!(text.contains(REDACTED), "the log holds:\n{text}");
}
