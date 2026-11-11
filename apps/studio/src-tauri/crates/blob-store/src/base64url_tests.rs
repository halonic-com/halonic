use super::{decode, encode};

#[test]
fn blob_store_base64url_encodes_as_the_page_does() {
    // The examples of `encodeBase64url` in `@halonicjs/std`, and RFC 4648's.
    assert_eq!(encode(&[0xfb, 0xff]), "-_8");
    assert_eq!(encode(b""), "");
    assert_eq!(encode(b"f"), "Zg");
    assert_eq!(encode(b"fo"), "Zm8");
    assert_eq!(encode(b"foo"), "Zm9v");
    assert_eq!(encode(b"hello"), "aGVsbG8");
}

#[test]
fn blob_store_base64url_reads_back_every_byte() {
    let bytes: Vec<u8> = (0..=255).collect();
    for length in 0..bytes.len() {
        let text = encode(&bytes[..length]);
        assert_eq!(decode(&text).as_deref(), Some(&bytes[..length]), "{length}");
    }
}

#[test]
fn blob_store_base64url_refuses_text_that_isnt_strict() {
    // Padding, base64's own characters, a length no bytes give, and stray bits.
    for text in [
        "Zg==",
        "a+b/",
        "Z",
        "Zm9vY",
        "-_9",
        "Zh",
        "aGVsbG8\n",
        "aGVs bG8",
    ] {
        assert_eq!(decode(text), None, "{text:?}");
    }
}
