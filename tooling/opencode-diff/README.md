# @halonicjs/tooling-opencode-diff

Lists what changed between two OpenCode versions: the `OPENCODE_*` environment names in its
program and the keys of its config schema. Its output goes in the body of every OpenCode
version-bump pull request (the checklist in `docs/adr/2026-11-24-opencode-harness-program.md`).

- **Layer:** tooling
- **Owner:** owen
- **Public API:** `@halonicjs/tooling-opencode-diff`

## Example

```sh
pnpm --filter @halonicjs/tooling-opencode-diff diff 2.3.0 2.4.1
```

It downloads `@opencode/cli-linux-x64` and `@opencode/schema` at both versions with `npm pack`
(no package script runs), and prints Markdown: each program package's integrity, then the names
and keys one version has and the other hasn't. A config key is written as `<module>: <key>`,
for every module the schema's `config.js` reaches.

The names come from the program's text, where strings sit next to each other, so a name can
come out glued to a stray letter (`OPENCODE_CLAUDE_PATHT`). It is the same in both versions
unless the build moved it, so read a lone added or removed name like that as noise.
