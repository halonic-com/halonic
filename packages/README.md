# packages

Libraries, by layer. A package's layer and npm name follow from its folder;
see [docs/guides/checks.md](../docs/guides/checks.md).

- `core/`: pure TypeScript, no third-party code and no platform APIs
- `adapters/`: implementations of the core's ports; the only place for outside-world libraries.
  Each adapter declares where it runs: `"halonic": { "runtime": "node" | "web" | "workers" | "any" }`
- `host/`: runtime-neutral packages. `host/server` is planned, not built yet; it will be the
  `Request → Response` handler behind `halonic serve`. Web-standard APIs only (`fetch`, `Request`, `Response`, `URL`,
  `crypto.subtle`, streams), no Node APIs and no adapters
- `targets/<target>/`: runs the host on one platform and wires the adapters.
  `runtime/` is what runs (`targets/node/runtime` is `halonic serve`,
  `targets/cloudflare/runtime` is the Worker), `deploy/` ships it, and
  `testing/` holds dev-only test helpers for that target
- `studio/`: the Studio's shared packages; `studio/features/` holds one package per feature
- `testing/`: dev-only test helpers and contract suites

Create a package with `pnpm new package <layer>/<name>` (adapters also take
`--runtime <node | web | workers | any>`), a target package with
`pnpm new package targets/<target>/<runtime | deploy | testing>`, or a
feature with `pnpm new feature <name>`.
