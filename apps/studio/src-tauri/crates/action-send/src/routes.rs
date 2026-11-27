//! The route list: every step the shell may send or open, generated from the
//! action catalog at build time and compiled into the shell (architecture
//! note on HAL-17491, 2.4). Nothing at run time adds to it.
//!
//! The file's routes have the shape of `ActionRoute` in `@halonicjs/ports`.
//! [`RouteList::parse`] checks all of it and refuses the whole list on any
//! problem, so a list the shell loaded holds only routes it can check.

use std::collections::BTreeMap;

use serde::Deserialize;
use serde_json::Value;

pub use crate::kinds::{Method, Risk};
use crate::pattern::Pattern;
use crate::services::{Service, service};
use crate::template::{
    QueryPair, Segment, call_placeholder_names, is_name, parse_call_path, parse_path,
    placeholder_names,
};
use crate::web::{WebOrigin, parse_web_origin};

/// The format the list's file names.
pub const FORMAT: &str = "halonic.action-routes/1";

/// What a body field holds.
#[derive(Debug, Clone, PartialEq)]
pub enum BodyKind {
    Text(Pattern),
    Integer,
    Boolean,
    IntegerList,
    /// The route's own value, which the shell sends; the page never does.
    Constant(Value),
    /// A value typed into the shell's native dialog during the send.
    SecretInput,
}

/// One top-level field of a call's body.
#[derive(Debug, Clone, PartialEq)]
pub struct BodyField {
    pub name: String,
    pub kind: BodyKind,
}

/// Which step: a definition, its major version and the step's number.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct StepKey {
    pub definition: String,
    pub version: u32,
    pub step: u32,
}

/// A step that calls the service's API on its fixed origin.
#[derive(Debug, Clone)]
pub struct CallRoute {
    pub service: &'static Service,
    pub risk: Risk,
    pub placeholders: BTreeMap<String, Pattern>,
    pub method: Method,
    pub path: Vec<Segment>,
    /// The query's fixed keys and their placeholders, in order.
    pub query: Vec<QueryPair>,
    pub body: Vec<BodyField>,
    pub keep: Vec<String>,
}

/// A step that opens a page on the service's own web origin.
#[derive(Debug, Clone)]
pub struct GuidedRoute {
    pub service: String,
    pub placeholders: BTreeMap<String, Pattern>,
    /// The page's host, one of the service's web origins.
    pub host: String,
    pub path: Vec<Segment>,
}

/// The checked list.
#[derive(Debug, Default)]
pub struct RouteList {
    pub calls: BTreeMap<StepKey, CallRoute>,
    pub guided: BTreeMap<StepKey, GuidedRoute>,
    /// The pages `browser` blocks may open (note, 7.1).
    pub web_origins: Vec<WebOrigin>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ListFile {
    format: String,
    web_origins: Vec<WebOriginFile>,
    routes: Vec<RouteFile>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct WebOriginFile {
    pub service: String,
    pub host: String,
    pub path_prefixes: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RouteFile {
    kind: String,
    definition: String,
    version: u32,
    step: u32,
    service: String,
    risk: Risk,
    placeholders: BTreeMap<String, String>,
    method: Option<Method>,
    path: Option<String>,
    body: Option<Vec<BodyFieldFile>>,
    keep: Option<Vec<String>>,
    address: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BodyFieldFile {
    name: String,
    kind: String,
    pattern: Option<String>,
    value: Option<Value>,
}

impl RouteList {
    /// Reads and checks the list's file, or says what is wrong with it.
    pub fn parse(text: &str) -> Result<Self, String> {
        let file: ListFile = serde_json::from_str(text).map_err(|error| error.to_string())?;
        if file.format != FORMAT {
            return Err(format!(
                "the route list's format is `{}`, not `{FORMAT}`",
                file.format
            ));
        }
        let mut list = RouteList {
            web_origins: file
                .web_origins
                .iter()
                .map(parse_web_origin)
                .collect::<Result<_, _>>()?,
            ..RouteList::default()
        };
        for route in file.routes {
            let key = StepKey {
                definition: route.definition.clone(),
                version: route.version,
                step: route.step,
            };
            let named = format!("{}@{} step {}", key.definition, key.version, key.step);
            let duplicate = match route.kind.as_str() {
                "call" => list
                    .calls
                    .insert(key, call_route(route).map_err(|e| format!("{named}: {e}"))?)
                    .is_some(),
                "guided" => {
                    let guided = guided_route(route, &list.web_origins)
                        .map_err(|e| format!("{named}: {e}"))?;
                    list.guided.insert(key, guided).is_some()
                }
                other => return Err(format!("{named}: `{other}` isn't a route kind")),
            };
            if duplicate {
                return Err(format!("{named} is listed twice"));
            }
        }
        Ok(list)
    }
}

fn placeholders(route: &RouteFile, used: &[&str]) -> Result<BTreeMap<String, Pattern>, String> {
    let declared: Vec<&str> = route.placeholders.keys().map(String::as_str).collect();
    if used.len() != declared.len() || !used.iter().all(|name| declared.contains(name)) {
        return Err("the placeholders don't match the template's".to_owned());
    }
    route
        .placeholders
        .iter()
        .map(|(name, pattern)| Ok((name.clone(), Pattern::parse(pattern)?)))
        .collect()
}

fn call_route(route: RouteFile) -> Result<CallRoute, String> {
    if route.address.is_some() {
        return Err("a call has no address".to_owned());
    }
    let service = service(&route.service)
        .ok_or_else(|| format!("the shell doesn't send to the service `{}`", route.service))?;
    let method = route.method.ok_or("a call needs a method")?;
    let (path, query) = parse_call_path(route.path.as_deref().ok_or("a call needs a path")?)?;
    let placeholders = placeholders(&route, &call_placeholder_names(&path, &query)?)?;
    let body = route
        .body
        .unwrap_or_default()
        .into_iter()
        .map(body_field)
        .collect::<Result<Vec<_>, _>>()?;
    let mut names: Vec<&str> = body.iter().map(|field| field.name.as_str()).collect();
    names.sort_unstable();
    names.dedup();
    if names.len() != body.len() {
        return Err("a body field is listed twice".to_owned());
    }
    if method == Method::Get && !body.is_empty() {
        return Err("a GET has no body".to_owned());
    }
    let keep = route.keep.unwrap_or_default();
    if !keep.iter().all(|name| !name.is_empty()) {
        return Err("a kept field has no name".to_owned());
    }
    Ok(CallRoute {
        service,
        risk: route.risk,
        placeholders,
        method,
        path,
        query,
        body,
        keep,
    })
}

fn body_field(field: BodyFieldFile) -> Result<BodyField, String> {
    if !is_name(&field.name) {
        return Err(format!("`{}` isn't a body field name", field.name));
    }
    let kind = match (field.kind.as_str(), field.pattern, field.value) {
        ("string", Some(pattern), None) => BodyKind::Text(Pattern::parse(&pattern)?),
        ("integer", None, None) => BodyKind::Integer,
        ("boolean", None, None) => BodyKind::Boolean,
        ("integer-list", None, None) => BodyKind::IntegerList,
        ("constant", None, Some(value)) if !value.is_object() && !value.is_array() => {
            BodyKind::Constant(value)
        }
        ("secret-input", None, None) => BodyKind::SecretInput,
        (kind, _, _) => {
            return Err(format!(
                "the body field `{}` of kind `{kind}` has the wrong shape",
                field.name
            ));
        }
    };
    Ok(BodyField {
        name: field.name,
        kind,
    })
}

fn guided_route(route: RouteFile, origins: &[WebOrigin]) -> Result<GuidedRoute, String> {
    if route.method.is_some()
        || route.path.is_some()
        || route.body.is_some()
        || route.keep.is_some()
    {
        return Err("a guided step has only an address".to_owned());
    }
    let address = route
        .address
        .as_deref()
        .ok_or("a guided step needs an address")?;
    let rest = address
        .strip_prefix("https://")
        .ok_or_else(|| format!("`{address}` isn't https"))?;
    let (host, path) = rest.split_at(rest.find('/').unwrap_or(rest.len()));
    let known = origins
        .iter()
        .any(|origin| origin.service == route.service && origin.host == host);
    if !known {
        return Err(format!(
            "`{host}` isn't a web origin of `{}`",
            route.service
        ));
    }
    let path = parse_path(path)?;
    let placeholders = placeholders(&route, &placeholder_names(&path)?)?;
    Ok(GuidedRoute {
        service: route.service,
        placeholders,
        host: host.to_owned(),
        path,
    })
}
