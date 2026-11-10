# app.plugin-trust-content

- Status: active
- Since: 0.1.0
- Source: HAL-1735 plan, section 4, approved by Liam on HAL-4038 (D4: the `hpf1:` prefix); the plugins ADR (`docs/adr/2026-11-09-plugins.md`), section 6: the fingerprint covers the normalised manifest plus every file hash, and the prompt shows hosts, secrets and where they go, tools with their `risk`, and local programs with their pins and network

The app shall build a plugin's trust content from its parsed manifest and the SHA-256 of every file in its folder. The content shall hold the plugin's id, version, sdk and name; every host, by the part that may reach it (the backend's hosts and each local tool's network); every secret with its purpose, hosts, whether it is optional and, for the backend, how it is put in; every tool with its part, `risk` and `untrusted`; each local tool's start (its package pin or its script), arguments, environment variables and what each reads, network and time limit; the whole parsed manifest; and every file's path and hash. Every list shall be sorted by code-unit order.

The plugin's trust fingerprint shall be `hpf1:` and the SHA-256, in hex, of the content, encoded as the workspace fingerprint encodes its content: canonical JSON preceded by its length in bytes and a line break. Any change to the manifest, a file or a pin shall change it, and the order the files were hashed in shall not.

## Examples

- Given the weather plugin with a backend and the local tool `files`,
  when its content is built,
  then its hosts are `api.example.com` for the backend and `api.acme.com` for `local:files`.
- Given the weather plugin,
  when its local tool's pin goes from `3.1.4` to `3.1.5`, or its description changes,
  then its fingerprint changes.
- Given the same files hashed in another order,
  when the fingerprint is computed,
  then it is the same.
- Given any plugin,
  then its fingerprint starts with `hpf1:`, never a workspace's `hfp1:`.
