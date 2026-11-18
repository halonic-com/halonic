//! Endpoints from a pairing, read into where the transport connects.

use halonic_tunnel::Endpoint;

#[test]
fn gateway_endpoint_reads_the_three_schemes() {
    let lan = Endpoint::parse("tcp:192.168.1.20:4100").expect("a tcp endpoint");
    assert!(!lan.is_secure());
    assert_eq!((lan.host(), lan.port()), ("192.168.1.20", 4100));
    assert_eq!(lan.websocket_url(), "ws://192.168.1.20:4100/v1/gateway");

    let tailnet = Endpoint::parse("wss:tims-laptop.tail1234.ts.net:4100").expect("wss");
    assert!(tailnet.is_secure());
    assert_eq!(
        tailnet.websocket_url(),
        "wss://tims-laptop.tail1234.ts.net:4100/v1/gateway"
    );

    let named = Endpoint::parse("https://host.example.ts.net/").expect("https");
    assert_eq!((named.host(), named.port()), ("host.example.ts.net", 443));

    let v6 = Endpoint::parse("tcp:[fd7a:115c:a1e0::1]:4100").expect("an IPv6 endpoint");
    assert_eq!(v6.host(), "fd7a:115c:a1e0::1");
    assert_eq!(
        v6.websocket_url(),
        "ws://[fd7a:115c:a1e0::1]:4100/v1/gateway"
    );
}

#[test]
fn gateway_endpoint_refuses_anything_else() {
    let refused = [
        "ws:192.168.1.20:4100",
        "http://192.168.1.20:4100",
        "tcp:192.168.1.20",
        "tcp:192.168.1.20:0",
        "tcp:192.168.1.20:65536",
        "tcp:192.168.1.20:+80",
        "wss://user@host.example:443",
        "wss://host.example/other",
        "wss://host.example:443?x=1",
        "wss://",
        "tcp:[192.168.1.20]:4100",
        "192.168.1.20:4100",
    ];
    for url in refused {
        assert_eq!(Endpoint::parse(url), None, "{url}");
    }
}
