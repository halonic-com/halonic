//! The part resolver against an in-process fixture download, and the
//! allow-list on its own. Requirement `studio.src-tauri.sandbox-parts-download`.

use std::fs;
use std::io::{self, Cursor, Read};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::mpsc::{Receiver, Sender, channel};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use super::{
    FetchBody, FetchError, PartError, PartFetch, PartKind, PartLocks, PartPin, cached_path,
    partial_path, read_pin, remove_installed, resolve_part,
};

const PART: &[u8] = b"a runtime archive\n";
/// The SHA-256 of [`PART`].
const PART_SHA: &str = "042110a7eb741c1bf4ebc3564b3eb31aae57b57a76ecba9a469fc6dffccdb9c2";
const URL: &str =
    "https://github.com/halonic-com/halonic/releases/download/v0.1.1/halonic-runtime-0.1.1.tar.gz";

static NEXT_FOLDER: AtomicU32 = AtomicU32::new(0);

/// A folder in the system's temporary folder, removed when the test ends.
struct TempFolder(PathBuf);

impl TempFolder {
    fn new() -> Self {
        let number = NEXT_FOLDER.fetch_add(1, Ordering::Relaxed);
        let name = format!("halonic-parts-{}-{number}", std::process::id());
        let path = std::env::temp_dir().join(name);
        fs::create_dir_all(path.join("app")).expect("a temporary folder");
        Self(path)
    }

    fn app(&self) -> PathBuf {
        self.0.join("app")
    }

    fn parts(&self) -> PathBuf {
        self.0.join("parts")
    }
}

impl Drop for TempFolder {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn pin() -> PartPin {
    PartPin {
        version: "0.1.1+0123456789ab".to_owned(),
        sha256: PART_SHA.to_owned(),
        size: PART.len() as u64,
        url: URL.to_owned(),
        min_runtime: None,
    }
}

/// What one call to the fixture answers.
enum Reply {
    /// The bytes from the asked offset, honouring the range, stopping after
    /// `limit` of them when given.
    Serve { body: Vec<u8>, limit: Option<usize> },
    /// The whole body from byte 0, ignoring the range.
    Whole(Vec<u8>),
    /// A failure.
    Fail(FetchError),
}

/// The in-process download: answers each call with the next reply and
/// records the URL and offset it was asked for.
#[derive(Default)]
struct Fixture {
    replies: Mutex<Vec<Reply>>,
    asked: Mutex<Vec<(String, u64)>>,
}

impl Fixture {
    fn new(replies: Vec<Reply>) -> Self {
        Self {
            replies: Mutex::new(replies),
            asked: Mutex::default(),
        }
    }

    fn asked(&self) -> Vec<(String, u64)> {
        self.asked.lock().expect("the record").clone()
    }
}

impl PartFetch for Fixture {
    fn open(&self, url: &str, from: u64) -> Result<FetchBody, FetchError> {
        self.asked
            .lock()
            .expect("the record")
            .push((url.to_owned(), from));
        let mut replies = self.replies.lock().expect("the replies");
        assert!(!replies.is_empty(), "an unexpected download");
        let start = usize::try_from(from).expect("a small offset");
        match replies.remove(0) {
            Reply::Serve { body, limit } => {
                let mut rest = body[start..].to_vec();
                rest.truncate(limit.unwrap_or(rest.len()));
                Ok(FetchBody {
                    start: from,
                    reader: Box::new(Cursor::new(rest)),
                })
            }
            Reply::Whole(body) => Ok(FetchBody {
                start: 0,
                reader: Box::new(Cursor::new(body)),
            }),
            Reply::Fail(error) => Err(error),
        }
    }
}

fn serve(body: &[u8]) -> Reply {
    Reply::Serve {
        body: body.to_vec(),
        limit: None,
    }
}

fn resolve(folder: &TempFolder, fetch: &dyn PartFetch) -> Result<PathBuf, PartError> {
    resolve_part(
        &folder.app(),
        &folder.parts(),
        PartKind::Runtime,
        &pin(),
        &PartLocks::default(),
        fetch,
        &|_| {},
    )
}

/// Requirement `studio.src-tauri.sandbox-parts-download`: a download is
/// kept under the part's name and SHA-256, and no `.tmp` stays.
#[test]
fn a_download_is_kept_by_its_sha256() {
    let folder = TempFolder::new();
    let fixture = Fixture::new(vec![serve(PART)]);
    let path = resolve(&folder, &fixture).expect("the part");
    let expected = folder
        .parts()
        .join(format!("halonic-runtime-{PART_SHA}.tar.gz"));
    assert_eq!(path, expected);
    assert_eq!(fs::read(&path).expect("the part"), PART);
    assert!(!partial_path(&folder.parts(), PartKind::Runtime, &pin()).exists());
    assert_eq!(fixture.asked(), vec![(URL.to_owned(), 0)]);
}

/// Requirement `studio.src-tauri.sandbox-parts-download`: a part beside the
/// app that matches is used without a download.
#[test]
fn a_part_beside_the_app_is_used_without_a_download() {
    let folder = TempFolder::new();
    fs::write(folder.app().join("halonic-runtime.tar.gz"), PART).expect("the bundled part");
    let fixture = Fixture::new(Vec::new());
    let path = resolve(&folder, &fixture).expect("the part");
    assert_eq!(path, folder.app().join("halonic-runtime.tar.gz"));
    assert!(fixture.asked().is_empty());
}

/// Requirement `studio.src-tauri.sandbox-parts-download`: a cached part
/// whose size or SHA-256 differs is refused and deleted, then downloaded.
#[test]
fn a_cached_part_that_doesnt_match_is_deleted() {
    for wrong in [&b"a runtime archive!\n"[..], &b"a runtime archivX\n"[..]] {
        let folder = TempFolder::new();
        fs::create_dir_all(folder.parts()).expect("parts/");
        let cached = cached_path(&folder.parts(), PartKind::Runtime, &pin());
        fs::write(&cached, wrong).expect("a wrong part");
        let fixture = Fixture::new(vec![serve(PART)]);
        resolve(&folder, &fixture).expect("the part");
        assert_eq!(fs::read(&cached).expect("the part"), PART);
        assert_eq!(fixture.asked().len(), 1);
    }
}

/// Requirement `studio.src-tauri.sandbox-parts-download`: downloaded bytes
/// that don't match are refused, the `.tmp` is deleted and never renamed.
#[test]
fn a_tmp_that_doesnt_match_isnt_renamed() {
    let folder = TempFolder::new();
    let fixture = Fixture::new(vec![serve(b"a runtime archivX\n")]);
    let result = resolve(&folder, &fixture);
    assert!(matches!(result, Err(PartError::Mismatch)), "{result:?}");
    assert!(!partial_path(&folder.parts(), PartKind::Runtime, &pin()).exists());
    assert!(!cached_path(&folder.parts(), PartKind::Runtime, &pin()).exists());
}

/// Requirement `studio.src-tauri.sandbox-parts-download`: a server that
/// sends more than the pinned size is read only up to it.
#[test]
fn a_download_stops_at_the_pinned_size() {
    let folder = TempFolder::new();
    let mut longer = PART.to_vec();
    longer.extend_from_slice(&[b'x'; 4096]);
    let fixture = Fixture::new(vec![Reply::Whole(longer)]);
    let path = resolve(&folder, &fixture).expect("the part");
    assert_eq!(
        fs::metadata(path).expect("the part").len(),
        PART.len() as u64
    );
}

/// Requirement `studio.src-tauri.sandbox-parts-download`: a download that
/// breaks off resumes where it stopped, from the pin's URL, after a wait.
#[test]
fn a_broken_download_resumes_from_the_pins_url() {
    let folder = TempFolder::new();
    let fixture = Fixture::new(vec![
        Reply::Serve {
            body: PART.to_vec(),
            limit: Some(5),
        },
        Reply::Fail(FetchError::Network("reset".to_owned())),
        serve(PART),
    ]);
    let waits = Mutex::new(Vec::new());
    let path = resolve_part(
        &folder.app(),
        &folder.parts(),
        PartKind::Runtime,
        &pin(),
        &PartLocks::default(),
        &fixture,
        &|wait| waits.lock().expect("the waits").push(wait),
    )
    .expect("the part");
    assert_eq!(fs::read(path).expect("the part"), PART);
    let asked = fixture.asked();
    assert_eq!(
        asked,
        vec![
            (URL.to_owned(), 0),
            (URL.to_owned(), 5),
            (URL.to_owned(), 5)
        ]
    );
    let waits = waits.into_inner().expect("the waits");
    assert_eq!(waits, vec![Duration::from_secs(2), Duration::from_secs(4)]);
}

/// Requirement `studio.src-tauri.sandbox-parts-download`: a server that
/// ignores the range starts the `.tmp` over instead of appending.
#[test]
fn a_server_that_ignores_the_range_starts_over() {
    let folder = TempFolder::new();
    let fixture = Fixture::new(vec![
        Reply::Serve {
            body: PART.to_vec(),
            limit: Some(5),
        },
        Reply::Whole(PART.to_vec()),
    ]);
    let path = resolve(&folder, &fixture).expect("the part");
    assert_eq!(fs::read(path).expect("the part"), PART);
}

/// Requirement `studio.src-tauri.sandbox-parts-download`: three retries,
/// then the failure; a refusal isn't retried.
#[test]
fn retries_stop_after_three_and_a_refusal_isnt_retried() {
    let folder = TempFolder::new();
    let broken = || Reply::Fail(FetchError::Network("offline".to_owned()));
    let fixture = Fixture::new(vec![broken(), broken(), broken(), broken()]);
    let result = resolve(&folder, &fixture);
    assert!(
        matches!(result, Err(PartError::Fetch(FetchError::Network(_)))),
        "{result:?}"
    );
    assert_eq!(fixture.asked().len(), 4);

    let refused = Fixture::new(vec![Reply::Fail(FetchError::Refused(
        "plain http".to_owned(),
    ))]);
    let result = resolve(&folder, &refused);
    assert!(
        matches!(result, Err(PartError::Fetch(FetchError::Refused(_)))),
        "{result:?}"
    );
    assert_eq!(refused.asked().len(), 1);
}

/// A fixture whose first download waits until the test lets it go on.
struct HeldFixture {
    started: Mutex<Sender<()>>,
    go: Mutex<Receiver<()>>,
    calls: AtomicU32,
}

impl PartFetch for HeldFixture {
    fn open(&self, _url: &str, _from: u64) -> Result<FetchBody, FetchError> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        self.started
            .lock()
            .expect("the sender")
            .send(())
            .expect("the test listens");
        self.go
            .lock()
            .expect("the receiver")
            .recv()
            .expect("the test lets it go");
        Ok(FetchBody {
            start: 0,
            reader: Box::new(Cursor::new(PART.to_vec())),
        })
    }
}

/// Requirement `studio.src-tauri.sandbox-parts-download`: a second download
/// of the same part waits for the first and uses its file.
#[test]
fn a_second_download_of_a_part_waits_for_the_first() {
    let folder = Arc::new(TempFolder::new());
    let locks = Arc::new(PartLocks::default());
    let (started_sender, started) = channel();
    let (go, go_receiver) = channel();
    let fixture = Arc::new(HeldFixture {
        started: Mutex::new(started_sender),
        go: Mutex::new(go_receiver),
        calls: AtomicU32::new(0),
    });
    let run = || {
        let (folder, locks, fixture) = (
            Arc::clone(&folder),
            Arc::clone(&locks),
            Arc::clone(&fixture),
        );
        thread::spawn(move || {
            let (app, parts) = (folder.app(), folder.parts());
            resolve_part(
                &app,
                &parts,
                PartKind::Runtime,
                &pin(),
                &locks,
                &*fixture,
                &|_| {},
            )
            .expect("the part")
        })
    };
    let first = run();
    started.recv().expect("the first download started");
    let second = run();
    go.send(()).expect("the first download goes on");
    assert_eq!(
        first.join().expect("the first"),
        second.join().expect("the second")
    );
    assert_eq!(fixture.calls.load(Ordering::SeqCst), 1);
}

/// Requirement `studio.src-tauri.sandbox-parts-download`: an installed part
/// is deleted from `parts/`; one beside the app stays.
#[test]
fn an_installed_part_is_deleted() {
    let folder = TempFolder::new();
    let fixture = Fixture::new(vec![serve(PART)]);
    let path = resolve(&folder, &fixture).expect("the part");
    remove_installed(&folder.parts(), PartKind::Runtime, &pin()).expect("deleted");
    assert!(!path.exists());
    remove_installed(&folder.parts(), PartKind::Runtime, &pin()).expect("already gone");
}

/// The pin is read with its `url` and the runtime's `minRuntime`, and a
/// pin the updater would refuse is refused.
#[test]
fn the_pin_is_read_and_checked() {
    let folder = TempFolder::new();
    assert!(
        read_pin(&folder.app(), PartKind::Image)
            .expect("no pin")
            .is_none()
    );
    let text = format!(
        r#"{{"version":"0.1.1+0123456789ab","sha256":"{PART_SHA}","size":18,"url":"{URL}","minRuntime":"0.1.0"}}"#
    );
    fs::write(folder.app().join("halonic-runtime.json"), text).expect("the pin");
    let read = read_pin(&folder.app(), PartKind::Runtime).expect("a pin");
    assert_eq!(
        read,
        Some(PartPin {
            min_runtime: Some("0.1.0".to_owned()),
            ..pin()
        })
    );
    let bad = format!(r#"{{"version":"0.1.1","sha256":"ABC","size":18,"url":"{URL}"}}"#);
    fs::write(folder.app().join("halonic-wsl.json"), bad).expect("a bad pin");
    assert!(matches!(
        read_pin(&folder.app(), PartKind::Image),
        Err(PartError::Pin(_))
    ));
}

/// A reader that fails after its first bytes, as a dropped connection does.
struct Breaks(Cursor<Vec<u8>>);

impl Read for Breaks {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        match self.0.read(buffer)? {
            0 => Err(io::Error::new(io::ErrorKind::ConnectionReset, "reset")),
            read => Ok(read),
        }
    }
}

struct BreaksOnce(Mutex<bool>);

impl PartFetch for BreaksOnce {
    fn open(&self, _url: &str, from: u64) -> Result<FetchBody, FetchError> {
        let mut broke = self.0.lock().expect("the flag");
        let start = usize::try_from(from).expect("a small offset");
        if *broke {
            return Ok(FetchBody {
                start: from,
                reader: Box::new(Cursor::new(PART[start..].to_vec())),
            });
        }
        *broke = true;
        Ok(FetchBody {
            start: from,
            reader: Box::new(Breaks(Cursor::new(PART[..7].to_vec()))),
        })
    }
}

/// Requirement `studio.src-tauri.sandbox-parts-download`: a read that fails
/// mid-download keeps what arrived and resumes after it.
#[test]
fn a_read_error_keeps_what_arrived_and_resumes() {
    let folder = TempFolder::new();
    let path = resolve(&folder, &BreaksOnce(Mutex::new(false))).expect("the part");
    assert_eq!(fs::read(path).expect("the part"), PART);
}
