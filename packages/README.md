# packages

Libraries, by layer. A package's layer and npm name follow from its folder;
see [docs/guides/checks.md](../docs/guides/checks.md).

- `core/`: pure TypeScript, no third-party code and no platform APIs
- `adapters/`: implementations of the core's ports; the only place for outside-world libraries
- `host/`: the server behind `halonic serve`, Web-standard APIs only; the Node runtime lives in `targets/`
- `studio/`: the Studio's shared packages; `studio/features/` holds one package per feature
- `testing/`: dev-only test helpers and contract suites

Create a package with `pnpm new package <layer>/<name>`, or a feature with
`pnpm new feature <name>`.
