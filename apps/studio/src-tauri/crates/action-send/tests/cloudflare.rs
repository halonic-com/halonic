//! Requirement `studio.src-tauri.crates.action-send.action-send`.
//!
//! Cloudflare's calls: the fixed origin and base path, a query of fixed
//! keys, and the `result` / `errors` envelope (plan and Liam's conditions
//! on HAL-17530 and HAL-20239). The zone and records are invented.

mod support;

use halonic_action_send::account;
use halonic_action_send::{Answer, Refusal, RouteList, SendResult, Unusable};
use serde_json::{Map, Value, json};
use support::{FakeDialogs, FakeKeychain, FakeLog, FakeNetwork, NOW, TOKEN, send_with};

const ROUTES: &str = include_str!("fixtures/acme-cloudflare-routes.json");
const ZONE: &str = "0123456789abcdef0123456789abcdef";

fn routes() -> RouteList {
    RouteList::parse(ROUTES).expect("the acme Cloudflare route list loads")
}

fn signed_in() -> FakeKeychain {
    let keychain = FakeKeychain::signed_out();
    account::store(
        &keychain.backend,
        "cloudflare",
        "acme-zone-editor",
        TOKEN,
        NOW + 3_600,
    )
    .expect("stores");
    keychain
}

fn find(name: &str) -> Value {
    json!({
        "definition": "acme.find-dns-record",
        "version": 1,
        "step": 1,
        "placeholders": { "zone_id": ZONE, "type": "A", "name": name },
    })
}

fn read_zone() -> Value {
    json!({ "definition": "acme.read-zone", "version": 1, "step": 1, "placeholders": { "zone_id": ZONE } })
}

fn answer(status: u16, body: Value) -> Result<Answer, String> {
    Ok(Answer {
        status,
        content_type: Some("application/json".to_owned()),
        body: body.to_string().into_bytes(),
        ..Answer::default()
    })
}

fn send(request: Value, reply: Result<Answer, String>) -> (SendResult, FakeNetwork) {
    let network = FakeNetwork::answering(reply);
    let result = send_with(
        &routes(),
        &network,
        &signed_in(),
        &FakeDialogs::answering(true),
        &FakeLog::default(),
        request,
    );
    (result, network)
}

fn kept(fields: Value) -> Map<String, Value> {
    fields.as_object().expect("an object").clone()
}

fn record(id: &str, content: &str) -> Value {
    json!({ "id": id, "type": "A", "name": "www.acme.example", "content": content, "ttl": 1 })
}

#[test]
fn a_call_goes_under_the_base_path_with_the_query_built_by_the_shell() {
    let (_, network) = send(find("www.acme.example"), answer(200, json!({})));
    let calls = network.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(
        calls[0].address.as_str(),
        format!(
            "https://api.cloudflare.com/client/v4/zones/{ZONE}/dns_records?type=A&name.exact=www.acme.example"
        )
    );
    assert!(
        calls[0]
            .headers
            .contains(&("authorization".to_owned(), format!("Bearer {TOKEN}")))
    );
}

#[test]
fn a_query_value_holding_and_or_equals_or_a_hash_is_refused_before_the_network() {
    for name in [
        "www.acme.example&type=MX",
        "a=b.acme.example",
        "www.acme.example#x",
    ] {
        let (result, network) = send(find(name), answer(200, json!({})));
        assert_eq!(
            result,
            SendResult::Refused {
                reason: Refusal::BadValue
            },
            "{name}"
        );
        assert!(network.calls().is_empty(), "{name}");
    }
}

#[test]
fn a_query_key_is_fixed_text_and_its_value_one_whole_placeholder() {
    let with_path = |path: &str| {
        let mut list: Value = serde_json::from_str(ROUTES).expect("json");
        list["routes"][0]["path"] = json!(path);
        RouteList::parse(&list.to_string())
    };
    for path in [
        "/zones/{zone_id}/dns_records?type={type}&name.exact={name}&per_page=50",
        "/zones/{zone_id}/dns_records?{type}={name}&x={zone_id}",
        "/zones/{zone_id}/dns_records?type=a{type}&name.exact={name}",
        "/zones/{zone_id}/dns_records?type={type}&name.exact={name}#x",
        "/zones/{zone_id}/dns_records?type={type}&type={type}&name.exact={name}",
        "/zones/{zone_id}/dns_records?ty pe={type}&name.exact={name}",
    ] {
        assert!(with_path(path).is_err(), "{path}");
    }
}

#[test]
fn an_envelope_keeps_the_route_fields_of_its_result() {
    let body = json!({
        "success": true,
        "errors": [],
        "result": { "name": "acme.example", "status": "active", "owner": { "id": "x" } },
    });
    let (result, _) = send(read_zone(), answer(200, body));
    assert_eq!(
        result,
        SendResult::Answered {
            status: 200,
            kept: kept(json!({ "name": "acme.example", "status": "active" })),
            error: None,
            unusable: None,
        }
    );
}

#[test]
fn a_list_of_one_keeps_that_record_and_its_total_count() {
    let body = json!({
        "success": true,
        "result": [record("372e67954025e0ba6aaa6d586b9e0b59", "192.0.2.1")],
        "result_info": { "count": 1, "total_count": 1, "page": 1, "per_page": 100 },
    });
    let (result, _) = send(find("www.acme.example"), answer(200, body));
    assert_eq!(
        result,
        SendResult::Answered {
            status: 200,
            kept: kept(json!({
                "id": "372e67954025e0ba6aaa6d586b9e0b59",
                "content": "192.0.2.1",
                "total_count": 1,
            })),
            error: None,
            unusable: None,
        }
    );
}

#[test]
fn an_empty_list_keeps_a_total_count_of_zero() {
    let body =
        json!({ "success": true, "result": [], "result_info": { "count": 0, "total_count": 0 } });
    let (result, _) = send(find("new.acme.example"), answer(200, body));
    assert_eq!(
        result,
        SendResult::Answered {
            status: 200,
            kept: kept(json!({ "total_count": 0 })),
            error: None,
            unusable: None,
        }
    );
}

fn more_than_one() -> [Value; 2] {
    let two = json!({
        "success": true,
        "result": [record("aaaa0000aaaa0000aaaa0000aaaa0000", "192.0.2.1"), record("bbbb0000bbbb0000bbbb0000bbbb0000", "192.0.2.2")],
        "result_info": { "count": 2, "total_count": 2 },
    });
    let one_of_many = json!({
        "success": true,
        "result": [record("aaaa0000aaaa0000aaaa0000aaaa0000", "192.0.2.1")],
        "result_info": { "count": 1, "total_count": 3 },
    });
    [two, one_of_many]
}

#[test]
fn a_check_answering_a_list_of_two_or_a_total_count_above_one_is_unusable() {
    for body in more_than_one() {
        let (result, _) = send(find("www.acme.example"), answer(200, body));
        assert_eq!(
            result,
            SendResult::Answered {
                status: 200,
                kept: Map::new(),
                error: None,
                unusable: Some(Unusable::MoreThanOne),
            }
        );
        let page = serde_json::to_value(&result).expect("serializes");
        assert_eq!(page["unusable"], json!("more-than-one"));
        assert!(page.get("error").is_none(), "{page}");
    }
}

#[test]
fn a_write_answering_a_list_of_more_than_one_keeps_nothing_and_still_succeeds() {
    let update = json!({
        "definition": "acme.update-dns-record",
        "version": 1,
        "step": 1,
        "placeholders": { "zone_id": ZONE, "record_id": "372e67954025e0ba6aaa6d586b9e0b59" },
    });
    for body in more_than_one() {
        let (result, network) = send(update.clone(), answer(200, body));
        assert_eq!(network.calls()[0].method, "PATCH");
        assert_eq!(
            result,
            SendResult::Answered {
                status: 200,
                kept: Map::new(),
                error: None,
                unusable: None,
            }
        );
    }
}

#[test]
fn a_failure_shows_the_envelopes_errors_with_their_codes() {
    let body = json!({
        "success": false,
        "errors": [{ "code": 10000, "message": "Authentication error" }],
        "messages": [],
        "result": null,
    });
    let (result, _) = send(read_zone(), answer(403, body));
    assert_eq!(
        result,
        SendResult::Answered {
            status: 403,
            kept: Map::new(),
            error: Some("Authentication error (code 10000)".to_owned()),
            unusable: None,
        }
    );
}

#[test]
fn a_github_token_is_never_sent_to_cloudflare() {
    let network = FakeNetwork::answering(answer(200, json!({})));
    let result = send_with(
        &routes(),
        &network,
        &FakeKeychain::signed_in(),
        &FakeDialogs::answering(true),
        &FakeLog::default(),
        read_zone(),
    );
    assert_eq!(
        result,
        SendResult::Refused {
            reason: Refusal::SignedOut
        }
    );
    assert!(network.calls().is_empty());
}
