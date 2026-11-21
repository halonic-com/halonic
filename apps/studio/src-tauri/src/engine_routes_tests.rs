//! Requirement `engine-commands`: the shell builds an engine path only from
//! a route of its table and params it has checked.

use serde_json::{Map, Value, json};

use halonic_agent_host::Answer;

use super::{BadParam, ITEM_ID_PATTERN, engine_path, find_engine_route, is_item_id};

fn path(route: &str, answer: Answer, params: Value) -> Result<String, BadParam> {
    let route = find_engine_route(route, answer).expect("a route of the table");
    let Value::Object(params) = params else {
        panic!("params are an object");
    };
    engine_path(route, &params)
}

fn refused_param(route: &str, answer: Answer, params: Value) -> Option<&'static str> {
    path(route, answer, params).expect_err("refused").param
}

#[test]
fn engine_routes_build_each_path_from_its_params() {
    assert_eq!(
        path("GET /api/hello", Answer::Json, json!({})),
        Ok("/api/hello".to_owned())
    );
    assert_eq!(
        path(
            "POST /api/runs/{run}/events",
            Answer::Json,
            json!({"run": "run-1"})
        ),
        Ok("/api/runs/run-1/events".to_owned())
    );
    assert_eq!(
        path(
            "GET /api/runs/{run}/events",
            Answer::Stream,
            json!({"run": "r", "after": 12})
        ),
        Ok("/api/runs/r/events?after=12".to_owned())
    );
    assert_eq!(
        path(
            "POST /api/routines/{hub}/{routine}/run",
            Answer::Json,
            json!({"hub": "@workspace", "routine": "nightly-report"})
        ),
        Ok("/api/routines/@workspace/nightly-report/run".to_owned())
    );
}

#[test]
fn engine_routes_name_a_route_only_with_its_own_answer() {
    assert!(find_engine_route("GET /api/run-updates", Answer::Json).is_none());
    assert!(find_engine_route("GET /api/hello", Answer::Stream).is_none());
    for name in [
        "GET http://example.com/",
        "GET /api/hello?x=1",
        "POST /api/chat-turn",
        "GET /api/runs/abc",
    ] {
        assert!(find_engine_route(name, Answer::Json).is_none(), "{name}");
    }
}

#[test]
fn engine_routes_encode_a_run_id_as_one_segment() {
    assert_eq!(
        path(
            "GET /api/runs/{run}",
            Answer::Json,
            json!({"run": "a b?c#d%2F\\e"})
        ),
        Ok("/api/runs/a%20b%3Fc%23d%252F%5Ce".to_owned())
    );
}

#[test]
fn engine_routes_refuse_a_run_id_that_would_reach_another_route() {
    for run in ["", "a/b", ".", "..", &"x".repeat(257)] {
        assert_eq!(
            refused_param(
                "POST /api/runs/{run}/cancel",
                Answer::Json,
                json!({ "run": run })
            ),
            Some("run"),
            "{run:?}"
        );
    }
    assert_eq!(
        refused_param(
            "POST /api/runs/{run}/cancel",
            Answer::Json,
            json!({"run": 7})
        ),
        Some("run")
    );
}

#[test]
fn engine_routes_refuse_a_missing_extra_or_wrongly_typed_param() {
    assert_eq!(
        refused_param("GET /api/runs/{run}", Answer::Json, json!({})),
        Some("run")
    );
    for after in [json!(-1), json!(1.5), json!("3"), Value::Null] {
        assert_eq!(
            refused_param(
                "GET /api/runs/{run}/events",
                Answer::Stream,
                json!({"run": "r", "after": after})
            ),
            Some("after")
        );
    }
    let extra = path("GET /api/hello", Answer::Json, json!({"run": "r"})).expect_err("refused");
    assert_eq!(extra.param, None);
}

#[test]
fn engine_routes_refuse_a_hub_or_routine_that_isnt_an_id() {
    let run_now = "POST /api/routines/{hub}/{routine}/run";
    for (hub, routine, refused) in [
        ("..", "daily", "hub"),
        ("@other", "daily", "hub"),
        ("Sales", "daily", "hub"),
        ("sales", "a/b", "routine"),
        ("sales", "@workspace", "routine"),
        ("sales", "-daily", "routine"),
    ] {
        assert_eq!(
            refused_param(
                run_now,
                Answer::Json,
                json!({"hub": hub, "routine": routine})
            ),
            Some(refused),
            "{hub}/{routine}"
        );
    }
}

#[test]
fn engine_routes_never_repeat_a_params_value() {
    let value = "secret-looking/value";
    let refusal =
        path("GET /api/runs/{run}", Answer::Json, json!({ "run": value })).expect_err("refused");
    assert!(!refusal.message.contains(value), "{}", refusal.message);
    let refusal = path(
        "POST /api/routines/{hub}/{routine}/run",
        Answer::Json,
        json!({"hub": "sales", "routine": value}),
    )
    .expect_err("refused");
    assert!(!refusal.message.contains(value), "{}", refusal.message);
}

/// The workspace format's rule for an item's id, from the spec it publishes:
/// the Rust check must follow the same pattern as the TypeScript one.
#[test]
fn engine_routes_check_ids_by_the_workspace_formats_rule() {
    for spec in [
        include_str!("../../../../packages/core/format/spec/routine.schema.json"),
        include_str!("../../../../packages/core/format/spec/hub.schema.json"),
    ] {
        let schema: Map<String, Value> = serde_json::from_str(spec).expect("the spec is JSON");
        let id = &schema["properties"]["id"];
        assert_eq!(id["pattern"], ITEM_ID_PATTERN);
        assert_eq!(id["minLength"], 1);
    }
    for good in ["a", "0", "nightly-report", "sales_2", "a-_-b"] {
        assert!(is_item_id(good), "{good}");
    }
    for bad in ["", "-a", "_a", "A", "a.b", "a b", "a/b", "é", "@workspace"] {
        assert!(!is_item_id(bad), "{bad}");
    }
}
