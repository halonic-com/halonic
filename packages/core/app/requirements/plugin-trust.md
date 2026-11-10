# app.plugin-trust

- Status: active
- Since: 0.1.0
- Source: HAL-1735 plan, section 4 and decision D2 (`checkPlugin` and `grantPlugin` on `TrustService`, with the shared record handling in its own file), approved by Liam on HAL-4038; the plugins ADR (`docs/adr/2026-11-09-plugins.md`), section 6

The app's `TrustService` shall decide whether a plugin is trusted by building its trust content and fingerprint and comparing them with the trust record for the plugin folder's real path, in the same store as workspace records. It shall hand out a trust grant only when the record's fingerprint is the current one. Without a record the plugin is new; with a record whose fingerprint differs it has changed, and the app shall give what changed and when it was trusted. A plugin's record shall never shrink: any change turns the plugin off until a person trusts it again. When the record can't be read, the plugin isn't trusted and the app shall give the store's error.

The app shall save a person's trust in a plugin only when the fingerprint they were shown is exactly the current one, and shall otherwise save nothing and give the current fingerprint. The saved record shall hold each local tool's package pin, keyed by the local tool's id, with the manifest's registry or the runner's public registry, given as the registry's base address (`https://pypi.org` for `uvx`, never its `/simple` index).

## Examples

- Given no record for `/profile/plugins/weather`,
  when the plugin is checked,
  then it is new, with a fingerprint that starts with `hpf1:`, and there is no grant.
- Given a person trusted the weather plugin with the fingerprint they were shown,
  when it is checked,
  then it is trusted, and the record holds the pin of `@acme/files-mcp` 3.1.4 from `https://registry.npmjs.org` for the local tool `files`.
- Given a plugin with a `uvx` local tool `notes` that names no registry,
  when a person trusts it,
  then the record pins `notes` to `https://pypi.org`.
- Given a trusted plugin that only lost a file,
  when it is checked,
  then it has changed, and the record is as it was.
- Given a workspace record at the plugin's location,
  when the plugin is checked,
  then it has changed, and the changes can't be read as plugin content.
