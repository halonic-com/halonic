# Decision: the release file carries the snapshot's SHA-256

- Approval: HAL-18195 (follow-up from HAL-18192, Ravi's answer point 2; the setting label from Sofia's copy check on HAL-18191, point 5)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:bHT1euasE1DHhPFFcaZkE8h9AfK6s5AfBTB4BnudGZkVAp4W2w8LSr8DHMj9sVaWwVlTdRSJ/nubbEuRvLLHBQ==

The plugin's **Pinned snapshot SHA-256** setting asks for the SHA-256 of `package/snapshot.json`, which only the unpacked plugin file held. The release file now carries it as `snapshotSha256`, hashed from the same bytes the archive packs, and `halonic build paperclip-plugin` prints it in a **Snapshot SHA-256** row and in `--json`. A release file from an earlier build, without the field, is still read, so `--since` keeps working on it. The archive's bytes don't change, so no checksum golden moves. Each requirement gains a clause and examples; nothing is removed.

## Covers

- plugin-build.release-file
- cli.commands.build.paperclip-plugin
