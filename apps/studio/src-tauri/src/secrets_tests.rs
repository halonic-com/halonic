//! Requirement `key-origin-commands`: the origin the shell makes from an
//! address, and the answers of `secret_allow_origin`.

use serde_json::json;

use super::{AddressProblem, AllowOriginAnswer, origin_of};

#[test]
fn key_origin_commands_make_the_origin_new_url_makes() {
    // Each expected origin is what `new URL(address).origin` gives in Node,
    // which the CLI stores and the model resolver compares.
    for (address, origin) in [
        ("https://LLM.Example.com/v1/chat", "https://llm.example.com"),
        ("https://llm.example.com:443/", "https://llm.example.com"),
        ("http://llm.example.com:80", "http://llm.example.com"),
        ("http://localhost:11434/api", "http://localhost:11434"),
        (
            "https://llm.example.com:8443",
            "https://llm.example.com:8443",
        ),
        ("https://bücher.example/v1", "https://xn--bcher-kva.example"),
        ("http://[::1]:8080/x", "http://[::1]:8080"),
        ("http://127.0.0.1:1234", "http://127.0.0.1:1234"),
        ("  https://llm.example.com  ", "https://llm.example.com"),
        ("https://llm.example.com.", "https://llm.example.com."),
        ("HTTPS://llm.example.com?q=1#f", "https://llm.example.com"),
        ("http://0x7f.1/", "http://127.0.0.1"),
    ] {
        assert_eq!(origin_of(address), Ok(origin.to_owned()), "{address}");
    }
}

#[test]
fn key_origin_commands_refuse_what_cant_be_an_allowed_origin() {
    for address in [
        "ftp://llm.example.com",
        "llm.example.com",
        "file:///etc/passwd",
        "javascript:alert(1)",
        "data:text/plain,x",
        "https://",
        "",
    ] {
        assert_eq!(
            origin_of(address),
            Err(AddressProblem::NotAnAddress),
            "{address:?}"
        );
    }
    for address in [
        "https://user@llm.example.com",
        "https://user:pw@llm.example.com",
        "https://:pw@llm.example.com",
    ] {
        assert_eq!(
            origin_of(address),
            Err(AddressProblem::HasUserInfo),
            "{address}"
        );
    }
}

#[test]
fn key_origin_commands_answer_in_the_shape_of_the_cli_store() {
    let origin = "https://llm.example.com".to_owned();
    for (answer, shape) in [
        (
            AllowOriginAnswer::Added {
                origin: origin.clone(),
            },
            json!({"result": "added", "origin": origin}),
        ),
        (
            AllowOriginAnswer::AlreadyAllowed {
                origin: origin.clone(),
            },
            json!({"result": "already-allowed", "origin": origin}),
        ),
        (AllowOriginAnswer::NoKey, json!({"result": "no-key"})),
        (AllowOriginAnswer::Full, json!({"result": "full"})),
        (
            AllowOriginAnswer::BadAddress {
                problem: AddressProblem::NotAnAddress,
            },
            json!({"result": "bad-address", "problem": "not-an-address"}),
        ),
        (
            AllowOriginAnswer::BadAddress {
                problem: AddressProblem::HasUserInfo,
            },
            json!({"result": "bad-address", "problem": "has-user-info"}),
        ),
    ] {
        assert_eq!(serde_json::to_value(&answer).expect("serializes"), shape);
    }
}
