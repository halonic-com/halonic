//! The engine's routes a page may call through the shell (design note D3 of
//! HAL-14206), by name (`"POST /api/runs/{run}/events"`), never by URL or
//! path. The page sends the route's params apart (`{ "run": "…" }`), and the
//! shell checks each one before it builds the path, so nothing the page
//! sends can change which route of the engine it reaches.

use serde_json::{Map, Value};

use halonic_agent_host::{Answer, Method};

/// The rule a routine's and a hub's id follow, as the workspace format says
/// (`id` in `packages/core/format/spec/routine.schema.json` and
/// `hub.schema.json`). A test holds the two together.
pub const ITEM_ID_PATTERN: &str = "^[a-z0-9][a-z0-9-_]*$";

/// The hub a routine at the workspace root runs in, as Run now names it
/// (`routineKey` in `@halonicjs/routines`).
const WORKSPACE_HUB: &str = "@workspace";

/// The longest run, hub or routine id the shell sends on. Real ones are far
/// shorter; this only keeps a page from building a huge path.
const ID_LIMIT: usize = 256;

/// A value the page sends with a route, by the name it has in the route.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Param {
    /// A run's id: one path segment, percent-encoded.
    Run,
    /// The last event `seq` the page has, as a whole number.
    After,
    /// A hub's id, or `@workspace` for a routine at the workspace root.
    Hub,
    /// A routine's id.
    Routine,
}

impl Param {
    fn name(self) -> &'static str {
        match self {
            Self::Run => "run",
            Self::After => "after",
            Self::Hub => "hub",
            Self::Routine => "routine",
        }
    }
}

/// One route of the engine: its name, how it is called, its path with a
/// `{param}` for each value the page sends, and the params of its query.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EngineRoute {
    pub name: &'static str,
    pub method: Method,
    pub answer: Answer,
    path: &'static str,
    query: &'static [Param],
}

const fn route(
    name: &'static str,
    method: Method,
    path: &'static str,
    query: &'static [Param],
    answer: Answer,
) -> EngineRoute {
    EngineRoute {
        name,
        method,
        answer,
        path,
        query,
    }
}

/// Every route a page may call. `Answer::Stream` routes answer with
/// server-sent events. No other route of the engine is reachable.
const ROUTES: &[EngineRoute] = &[
    // The engine's version, which `executor-remote`'s `send` reads first.
    route(
        "GET /api/hello",
        Method::Get,
        "/api/hello",
        &[],
        Answer::Json,
    ),
    route(
        "POST /api/runs",
        Method::Post,
        "/api/runs",
        &[],
        Answer::Json,
    ),
    route(
        "POST /api/agent-runs",
        Method::Post,
        "/api/agent-runs",
        &[],
        Answer::Json,
    ),
    route(
        "GET /api/waiting-runs",
        Method::Get,
        "/api/waiting-runs",
        &[],
        Answer::Json,
    ),
    route(
        "GET /api/runs/{run}",
        Method::Get,
        "/api/runs/{run}",
        &[],
        Answer::Json,
    ),
    route(
        "POST /api/runs/{run}/events",
        Method::Post,
        "/api/runs/{run}/events",
        &[],
        Answer::Json,
    ),
    route(
        "POST /api/runs/{run}/cancel",
        Method::Post,
        "/api/runs/{run}/cancel",
        &[],
        Answer::Json,
    ),
    route(
        "GET /api/runs/{run}/events",
        Method::Get,
        "/api/runs/{run}/events",
        &[Param::After],
        Answer::Stream,
    ),
    route(
        "GET /api/run-updates",
        Method::Get,
        "/api/run-updates",
        &[],
        Answer::Stream,
    ),
    route(
        "GET /api/routines",
        Method::Get,
        "/api/routines",
        &[],
        Answer::Json,
    ),
    route(
        "POST /api/routines/{hub}/{routine}/run",
        Method::Post,
        "/api/routines/{hub}/{routine}/run",
        &[],
        Answer::Json,
    ),
];

/// The route a page names, when it is one of the table's and answers as
/// `answer`; `None` for any other name.
pub fn find_engine_route(name: &str, answer: Answer) -> Option<EngineRoute> {
    ROUTES
        .iter()
        .find(|route| route.name == name && route.answer == answer)
        .copied()
}

/// Why the shell refused a route's params. It names the param, never its
/// value, which came from the page.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BadParam {
    pub param: Option<&'static str>,
    pub message: String,
}

impl BadParam {
    fn of(param: Param, message: impl std::fmt::Display) -> Self {
        Self {
            param: Some(param.name()),
            message: format!("`{}` {message}", param.name()),
        }
    }
}

/// The path and query to call for `route` with the page's `params`. Every
/// param the route names must be there and valid, and no other may be.
///
/// # Errors
///
/// [`BadParam`] naming the first param that is missing or invalid, or
/// saying that the page sent one the route doesn't take.
pub fn engine_path(route: EngineRoute, params: &Map<String, Value>) -> Result<String, BadParam> {
    let mut used = 0;
    let mut path = String::new();
    for segment in route.path.split('/').skip(1) {
        path.push('/');
        match segment
            .strip_prefix('{')
            .and_then(|rest| rest.strip_suffix('}'))
        {
            Some(name) => {
                let param = param_named(name);
                path.push_str(&segment_value(param, params.get(name))?);
                used += 1;
            }
            None => path.push_str(segment),
        }
    }
    for (index, &param) in route.query.iter().enumerate() {
        let after = whole_number(param, params.get(param.name()))?;
        path.push(if index == 0 { '?' } else { '&' });
        path.push_str(&format!("{}={after}", param.name()));
        used += 1;
    }
    if params.len() > used {
        return Err(BadParam {
            param: None,
            message: format!("{} takes no other params", route.name),
        });
    }
    Ok(path)
}

/// The param a `{name}` of the table stands for. The table names only these.
fn param_named(name: &str) -> Param {
    match name {
        "run" => Param::Run,
        "hub" => Param::Hub,
        _ => Param::Routine,
    }
}

/// A path param's value, checked and ready for the path.
fn segment_value(param: Param, value: Option<&Value>) -> Result<String, BadParam> {
    let Some(value) = value else {
        return Err(BadParam::of(param, "is missing"));
    };
    let Some(text) = value.as_str() else {
        return Err(BadParam::of(param, "isn't text"));
    };
    if text.len() > ID_LIMIT {
        return Err(BadParam::of(
            param,
            format!("is longer than {ID_LIMIT} bytes"),
        ));
    }
    match param {
        Param::Run => run_segment(text),
        Param::Hub if text == WORKSPACE_HUB => Ok(text.to_owned()),
        Param::Hub | Param::Routine if is_item_id(text) => Ok(text.to_owned()),
        Param::Hub | Param::Routine => Err(BadParam::of(
            param,
            "isn't an id: lowercase letters, digits, '-' or '_', starting with a letter or digit",
        )),
        Param::After => Err(BadParam::of(param, "isn't part of the path")),
    }
}

/// A run's id as one path segment. A `/` would reach another route, and a
/// `.` or `..` segment would be resolved away, so those are refused rather
/// than encoded.
fn run_segment(text: &str) -> Result<String, BadParam> {
    if text.is_empty() {
        return Err(BadParam::of(Param::Run, "is empty"));
    }
    if text.contains('/') {
        return Err(BadParam::of(Param::Run, "holds a '/'"));
    }
    if text == "." || text == ".." {
        return Err(BadParam::of(Param::Run, "is '.' or '..'"));
    }
    Ok(percent_encode(text))
}

/// A query param that is a whole number from 0 up.
fn whole_number(param: Param, value: Option<&Value>) -> Result<u64, BadParam> {
    let Some(value) = value else {
        return Err(BadParam::of(param, "is missing"));
    };
    value
        .as_u64()
        .ok_or_else(|| BadParam::of(param, "isn't a whole number from 0 up"))
}

/// Whether `text` follows [`ITEM_ID_PATTERN`].
pub fn is_item_id(text: &str) -> bool {
    let mut bytes = text.bytes();
    let Some(first) = bytes.next() else {
        return false;
    };
    let lower_or_digit = |byte: u8| byte.is_ascii_lowercase() || byte.is_ascii_digit();
    lower_or_digit(first) && bytes.all(|byte| lower_or_digit(byte) || byte == b'-' || byte == b'_')
}

/// Encodes every byte but ASCII letters, digits, `-`, `.`, `_` and `~`, so
/// the value stays one segment whatever it holds.
fn percent_encode(text: &str) -> String {
    let mut encoded = String::with_capacity(text.len());
    for byte in text.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~') {
            encoded.push(char::from(byte));
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

#[cfg(test)]
#[path = "engine_routes_tests.rs"]
mod tests;
