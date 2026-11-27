# @halonicjs/toolscript-host

The ToolScript `ctx` host. Over any `ToolScriptIsolate`, it decides which capabilities `ctx` gets
(`uses`, one audience only), turns secret inputs into handles, checks every call on the parent side
(secret fields, the capability's schema, `touches`), confirms each write or `ctx.batch` with the
frozen copy it then sends, and adds the capability's own preview lines (ADR on HAL-17560, S3, S4, S7,
S9 and S14 to S17).

- **Layer:** core
- **Owner:** priya
- **Public API:** `@halonicjs/toolscript-host`

The host follows in the next pull request; this one adds the package and its `coreOrder` entry.
