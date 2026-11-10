# integration.plugin-conformance

- Status: active
- Since: 0.1.0
- Source: HAL-1741 (P8), the plugins ADR (`docs/adr/2026-11-09-plugins.md`, Accepted, sections 1, 1.4, 1.5 and 2)

The conformance suite shall take a plugin folder, read its one manifest as Halonic does (a `plugin.yaml`, or an `integration.yaml` read as a plugin with only a backend), and fail when the folder has no manifest or both, when the manifest fails its schema or its own checks (naming the line), when its `sdk` isn't this Halonic's, when a file it names (the backend's `entry`, a local tool's `script`) isn't in the folder, when it declares a backend but no code is given for it, or when the code differs from the backend as the kit's loader checks it. A plugin's backend shall then pass every integration check, with every code file beside its `entry` scanned.

## Examples

- Given the weather plugin with its backend code, recordings and cases, when the suite runs, then every check passes.
- Given a copy with both `plugin.yaml` and `integration.yaml`, when the manifest is checked, then it fails and says to keep only `plugin.yaml`.
- Given a copy whose card names an undeclared tool, when the manifest is checked, then it fails at `plugin.yaml:<line>:<col>`.
- Given a copy with `sdk: 2`, a missing `entry` or a missing local tool `script`, when the manifest is checked, then it fails and names it.
- Given a copy whose backend says `risk: read` for a tool the code says is `write`, when the manifest is checked, then it fails at `backend.tools.1.risk`.
- Given a copy with a backend file that reads `process.env`, when its sources are checked, then it fails and names the file and line.
- Given a folder with only an `integration.yaml`, when it is read, then it is a plugin named by its id, with an empty description and the sheet's tools.

## Deliberate limits in v0.1

- The test file passes the backend's code as `backend`; the suite checks that `entry` exists but doesn't import it. How the I5 worker finds the `Integration` in `entry` is P4.
- Local tools are checked as the manifest declares them. Starting them in a sandbox and refusing a tool or a host they didn't declare is P5 and P10.
