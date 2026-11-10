//! The NIST test vectors (FIPS 180-4 examples and the long-message
//! vector), and one digest Node gives, so the shell names trust record
//! files exactly as `fs-node` does. Requirement `sha256-digest`.

use halonic_sha256::{Sha256, sha256};

/// The NIST vectors: the message and its digest in hex.
#[rustfmt::skip]
const VECTORS: [(&str, &str); 4] = [
    ("", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"),
    ("abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"),
    // 448 bits: the padding no longer fits in the block, so a second one follows.
    (
        "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
        "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    ),
    (
        "abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu",
        "cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1",
    ),
];

#[test]
fn sha256_digest_gives_the_nist_vectors() {
    for (message, digest) in VECTORS {
        assert_eq!(sha256(message.as_bytes()).to_hex(), digest, "{message:?}");
    }
}

#[test]
fn sha256_digest_is_the_same_given_at_once_or_in_parts() {
    let million_a = vec![b'a'; 1_000_000];
    let expected = "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0";
    assert_eq!(sha256(&million_a).to_hex(), expected);
    // Parts shorter than, equal to and longer than a block.
    for part in [1, 63, 64, 65, 1000] {
        let digest = million_a
            .chunks(part)
            .fold(Sha256::new(), |hash, bytes| hash.update(bytes))
            .finish();
        assert_eq!(digest.to_hex(), expected, "parts of {part} bytes");
    }
}

#[test]
fn sha256_digest_pads_every_length_around_a_block_edge() {
    // 55 bytes is the most that leaves room for the padding in one block;
    // 56 to 63 need a second block, 64 fills one exactly. Each digest is
    // the one Python's hashlib gives for that many `x` bytes.
    #[rustfmt::skip]
    let digests = [
        (55, "d5e285683cd4efc02d021a5c62014694958901005d6f71e89e0989fac77e4072"),
        (56, "04c26261370ee7541549d16dee320c723e3fd14671e66a099afe0a377c16888e"),
        (63, "75220b47218278e656f2013bb8f0c455a25eaf01e86c64924e9d48d89776d6f2"),
        (64, "7ce100971f64e7001e8fe5a51973ecdfe1ced42befe7ee8d5fd6219506b5393c"),
        (65, "9537c5fdf120482f7d58d25e9ed583f52c02b4e304ea814db1633ad565aed7e9"),
    ];
    for (length, expected) in digests {
        let message = vec![b'x'; length];
        assert_eq!(sha256(&message).to_hex(), expected, "{length} bytes");
        let byte_by_byte = message
            .iter()
            .fold(Sha256::new(), |hash, byte| hash.update(&[*byte]))
            .finish();
        assert_eq!(byte_by_byte.to_hex(), expected, "{length} bytes one by one");
    }
}

#[test]
fn sha256_digest_names_a_location_as_node_does() {
    // `createHash("sha256").update("/Workspaces/Café", "utf16le").digest("hex")`
    let utf16le: Vec<u8> = "/Workspaces/Café"
        .encode_utf16()
        .flat_map(u16::to_le_bytes)
        .collect();
    assert_eq!(
        sha256(&utf16le).to_hex(),
        "a47c4600542f1f0e56aedc0ccf0d69ab2aaca89accf3ea63a7d0cd172535da7e"
    );
}
