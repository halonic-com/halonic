use halonic_agent_host::{Answer, LineSplitter, LineTooLong, Method, find_route};

#[test]
fn routes_finds_each_route_by_its_name_and_answer() {
    let open = find_route("POST /v1/sandbox/sessions/open", Answer::Json).expect("a route");
    assert_eq!(open.method, Method::Post);
    assert_eq!(open.path, "/v1/sandbox/sessions/open");
    let health = find_route("GET /v1/health", Answer::Json).expect("a route");
    assert_eq!(health.method, Method::Get);
    let bridge = find_route("POST /v1/bridge/open", Answer::Stream).expect("a route");
    assert_eq!(bridge.path, "/v1/bridge/open");
}

#[test]
fn routes_refuses_any_other_name() {
    for name in [
        "",
        "/v1/health",
        "get /v1/health",
        "GET /v1/health/",
        "POST /v1/health",
        "GET /v1/sandbox/check?x=1",
        "GET http://127.0.0.1:1/v1/health",
        "POST /v1/bridge/../health",
    ] {
        assert_eq!(find_route(name, Answer::Json), None, "{name}");
        assert_eq!(find_route(name, Answer::Stream), None, "{name}");
    }
}

#[test]
fn routes_keeps_json_and_stream_routes_apart() {
    assert_eq!(find_route("POST /v1/bridge/open", Answer::Json), None);
    assert_eq!(find_route("POST /v1/bridge/answer", Answer::Stream), None);
}

#[test]
fn routes_splits_a_stream_into_its_lines_across_chunks() {
    let mut splitter = LineSplitter::new(64);
    assert_eq!(
        splitter.push(b"{\"a\":1}\n{\"b\""),
        Ok(vec![b"{\"a\":1}".to_vec()])
    );
    assert_eq!(splitter.push(b":2}\n\n"), Ok(vec![b"{\"b\":2}".to_vec()]));
    assert_eq!(splitter.push(b"{\"c\":3}"), Ok(vec![]));
    assert_eq!(splitter.finish(), Some(b"{\"c\":3}".to_vec()));
}

#[test]
fn routes_stops_a_line_past_the_limit() {
    let mut splitter = LineSplitter::new(4);
    assert_eq!(splitter.push(b"1234\n"), Ok(vec![b"1234".to_vec()]));
    assert_eq!(splitter.push(b"123"), Ok(vec![]));
    assert_eq!(splitter.push(b"45"), Err(LineTooLong));
}
