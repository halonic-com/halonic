//! The allow-list of a request's record events: the same fields and limits
//! as `checkActionEvent` in `@halonicjs/events`, for every kind but
//! `action.requested`, which is a run event and never goes in a record
//! (architecture note on HAL-17491, 4.2). Each kind may carry only the
//! fields listed for it, so a token, a header, an `input` value or a whole
//! answer body can't ride along under any name.

use serde_json::{Map, Value};

use crate::answer::MAX_ERROR_CHARS;

/// The longest id (request, digest, service, account) an event may hold.
pub const MAX_ID_CHARS: usize = 200;
/// The longest text a kept field may hold.
pub const MAX_KEPT_VALUE_CHARS: usize = 1000;
/// The most kept fields one step may have.
pub const MAX_KEPT_FIELDS: usize = 50;
/// The highest step number a definition may have.
const MAX_STEP: f64 = 100.0;

/// Every reason a step may fail for: `ActionStepFailure`.
const STEP_FAILURES: &[&str] = &[
    "service-error",
    "refused",
    "unreachable",
    "malformed",
    "state-changed",
];
/// Every way a request may end: `ActionOutcome`.
const OUTCOMES: &[&str] = &["succeeded", "failed", "declined", "expired"];
const DECISIONS: &[&str] = &["opened", "declined", "blocked"];

/// What one field may hold.
#[derive(Clone, Copy)]
enum Field {
    Id,
    Error,
    Time,
    Step,
    Status,
    Kept,
    OneOf(&'static [&'static str]),
}

/// One field of a kind: its name, what it holds, and whether it may be left out.
struct Spec(&'static str, Field, bool);

static BASE: [Spec; 2] = [
    Spec("request", Field::Id, false),
    Spec("at", Field::Time, false),
];
const STEP: Spec = Spec("step", Field::Step, false);
static REVIEWED: [Spec; 2] = [
    Spec("decision", Field::OneOf(DECISIONS), false),
    Spec("digest", Field::Id, false),
];
static SIGNED_IN: [Spec; 2] = [
    Spec("service", Field::Id, false),
    Spec("account", Field::Id, false),
];
static STEP_ONLY: [Spec; 1] = [STEP];
static SUCCEEDED: [Spec; 3] = [
    STEP,
    Spec("status", Field::Status, true),
    Spec("kept", Field::Kept, false),
];
static FAILED: [Spec; 4] = [
    STEP,
    Spec("failure", Field::OneOf(STEP_FAILURES), false),
    Spec("status", Field::Status, true),
    Spec("error", Field::Error, true),
];
static FINISHED: [Spec; 1] = [Spec("outcome", Field::OneOf(OUTCOMES), false)];

/// The fields of each record kind, besides `type`, `request` and `at`.
fn specs_of(kind: &str) -> Option<&'static [Spec]> {
    match kind {
        "action.reviewed" => Some(&REVIEWED),
        "action.signed-in" => Some(&SIGNED_IN),
        "action.step.started" | "action.step.skipped" => Some(&STEP_ONLY),
        "action.step.succeeded" => Some(&SUCCEEDED),
        "action.step.failed" => Some(&FAILED),
        "action.finished" => Some(&FINISHED),
        _ => None,
    }
}

/// Checks one record event against the allow-list.
///
/// # Errors
///
/// Every problem found, each naming the field and never its value.
pub fn check_record_event(value: &Value) -> Result<(), Vec<String>> {
    let Some(event) = value.as_object() else {
        return Err(vec!["an action event is a JSON object".to_owned()]);
    };
    let Some(specs) = event.get("type").and_then(Value::as_str).and_then(specs_of) else {
        return Err(vec!["type: not an action record event".to_owned()]);
    };
    let listed = || BASE.iter().chain(specs);
    let mut problems: Vec<String> = event
        .keys()
        .filter(|key| *key != "type" && !listed().any(|spec| spec.0 == key.as_str()))
        .map(|key| format!("{}: not allowed", key.chars().take(64).collect::<String>()))
        .collect();
    for Spec(name, field, optional) in listed() {
        let problem = match event.get(*name) {
            None if *optional => None,
            None => Some("missing"),
            Some(found) => field_problem(*field, found),
        };
        if let Some(problem) = problem {
            problems.push(format!("{name}: {problem}"));
        }
    }
    if problems.is_empty() {
        Ok(())
    } else {
        Err(problems)
    }
}

/// Checks a request id, as the `request` field of an event.
///
/// # Errors
///
/// What is wrong with it, never the id itself.
pub fn check_request_id(request: &str) -> Result<(), String> {
    match field_problem(Field::Id, &Value::String(request.to_owned())) {
        None => Ok(()),
        Some(problem) => Err(format!("request: {problem}")),
    }
}

fn field_problem(field: Field, value: &Value) -> Option<&'static str> {
    match field {
        Field::Id => text_problem(value, MAX_ID_CHARS).or_else(|| control_problem(value)),
        Field::Error => text_problem(value, MAX_ERROR_CHARS),
        Field::Time => match value.as_str() {
            Some(text) if is_utc_time(text) => None,
            _ => Some("not a UTC time"),
        },
        Field::Step => whole_number_problem(value, 1.0, MAX_STEP),
        Field::Status => whole_number_problem(value, 100.0, 599.0),
        Field::Kept => kept_problem(value),
        Field::OneOf(values) => match value.as_str() {
            Some(text) if values.contains(&text) => None,
            _ => Some("not allowed"),
        },
    }
}

/// The text's length as JavaScript counts it, in UTF-16 units, so both
/// sides cut at the same place.
fn js_length(text: &str) -> usize {
    text.encode_utf16().count()
}

fn text_problem(value: &Value, max: usize) -> Option<&'static str> {
    match value.as_str() {
        None | Some("") => Some("not a text"),
        Some(text) if js_length(text) > max => Some("too long"),
        Some(_) => None,
    }
}

fn control_problem(value: &Value) -> Option<&'static str> {
    let has_control = value
        .as_str()
        .is_some_and(|text| text.chars().any(|c| c < '\u{20}' || c == '\u{7f}'));
    has_control.then_some("has a control character")
}

fn whole_number_problem(value: &Value, least: f64, most: f64) -> Option<&'static str> {
    match value.as_f64() {
        Some(number) if number.fract() == 0.0 => {
            (number < least || number > most).then_some("out of range")
        }
        _ => Some("not a whole number"),
    }
}

/// Plain values (or `null`) under plain names, so no object, list or long
/// text can hide in a step's kept fields.
fn kept_problem(value: &Value) -> Option<&'static str> {
    let Some(kept) = value.as_object() else {
        return Some("not an object");
    };
    if kept.len() > MAX_KEPT_FIELDS {
        return Some("too many fields");
    }
    if !kept.keys().all(|name| is_plain_name(name)) {
        return Some("a field name that isn't plain");
    }
    (!kept.values().all(is_plain_value)).then_some("a value that isn't plain")
}

/// `^[A-Za-z][A-Za-z0-9_]{0,63}$`.
fn is_plain_name(name: &str) -> bool {
    let mut characters = name.chars();
    characters.next().is_some_and(|c| c.is_ascii_alphabetic())
        && name.len() <= 64
        && characters.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

fn is_plain_value(value: &Value) -> bool {
    match value {
        Value::Null | Value::Bool(_) | Value::Number(_) => true,
        Value::String(text) => js_length(text) <= MAX_KEPT_VALUE_CHARS,
        Value::Array(_) | Value::Object(_) => false,
    }
}

/// `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$`.
fn is_utc_time(text: &str) -> bool {
    let bytes = text.as_bytes();
    let shape = b"dddd-dd-ddTdd:dd:dd";
    if bytes.len() <= shape.len() || !matches_shape(&bytes[..shape.len()], shape) {
        return false;
    }
    match &bytes[shape.len()..] {
        [b'Z'] => true,
        [b'.', fraction @ .., b'Z'] => {
            (1..=3).contains(&fraction.len()) && fraction.iter().all(u8::is_ascii_digit)
        }
        _ => false,
    }
}

fn matches_shape(bytes: &[u8], shape: &[u8]) -> bool {
    bytes
        .iter()
        .zip(shape)
        .all(|(byte, expected)| match expected {
            b'd' => byte.is_ascii_digit(),
            _ => byte == expected,
        })
}

/// Seconds since 1970 of a time the allow-list took, such as an event's
/// `at`; `None` for any other text.
pub fn seconds_of(at: &str) -> Option<u64> {
    if !is_utc_time(at) {
        return None;
    }
    let number = |range: std::ops::Range<usize>| at.get(range)?.parse::<i64>().ok();
    let (year, month, day) = (number(0..4)?, number(5..7)?, number(8..10)?);
    let (hour, minute, second) = (number(11..13)?, number(14..16)?, number(17..19)?);
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    let seconds = days_from_civil(year, month, day) * 86_400 + hour * 3600 + minute * 60 + second;
    u64::try_from(seconds).ok()
}

/// Days from 1970-01-01 to a date in the proleptic Gregorian calendar
/// (Howard Hinnant's `days_from_civil`).
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = year.div_euclid(400);
    let year_of_era = year - era * 400;
    let shifted_month = (month + 9) % 12;
    let day_of_year = (153 * shifted_month + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

/// The event's `type`, `request` or `at`, for an event the allow-list took.
pub(crate) fn text_field<'a>(event: &'a Map<String, Value>, name: &str) -> &'a str {
    event.get(name).and_then(Value::as_str).unwrap_or_default()
}
