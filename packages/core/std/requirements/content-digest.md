# std.content-digest

- Status: active
- Since: 0.1.0
- Source: save model 1.7 (HAL-1102), HAL-3247; the digest the `DefinitionStore` port v2 compares (`ports.definition-store-write-if-unchanged`)

The content digest helpers shall give, as `contentDigest`, `sha256:` and the 64 lowercase hex characters of the SHA-256 of a text's UTF-8 bytes, with the SHA-256 the caller passes in, and shall say, as `matchesExpected`, whether a file's text, or `null` for no file, is what the caller expects: `absent` matches only no file, and a digest matches only a file whose text has that digest.

## Examples

- Given the text "hello", when its digest is worked out, then it is `sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824`.
- Given the text "é", when its digest is worked out, then it is the SHA-256 of the two bytes `c3 a9`.
- Given a file holding "3" and the digest of "1", when they are compared, then they don't match.
- Given no file, when it is compared with `absent`, then it matches; an empty file doesn't.
