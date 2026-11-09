# workspace.trust-fingerprint

- Status: active
- Since: 0.1.0
- Source: HAL-188 (HAL-65 "Fingerprint" term, J8; SHA-256 through the `Digest` port, plan v1.11)

The workspace package shall compute a workspace's trust fingerprint as `hfp1:` followed by the lowercase hex SHA-256, taken through the `Digest` port, of the trust content's canonical JSON (`std.canonical-json`) preceded by its length in bytes and a line break.

## Examples

- Given the content `{ connectors: [] }`, when its fingerprint is computed, then it is `hfp1:108e472376d29b48d14f5f668bca2b827ca6400da7ad618b7c04f72dc42c19ae`.
- Given the same content with its keys in another order, when its fingerprint is computed, then it is the same.
- Given a program with the arguments `["a b"]` and one with `["a", "b"]`, when their fingerprints are computed, then they differ.
