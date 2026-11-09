# @halonicjs/tooling-discover

Generates the registration files and keeps the Studio's feature list in
`apps/studio/package.json` correct. Also scaffolds new packages
and shows who else is working on a package.

- **Layer:** tooling
- **Owner:** mateo
- **Commands:**
  - `pnpm discover` writes `apps/studio/src/generated/features.ts` (gitignored). Turbo runs it as the `codegen` task before every typecheck, test and build. It also writes one file per folder discovery (below).
  - `pnpm discover --fix` also rewrites the feature list (run `pnpm install` after) and adds missing folder-discovery globs to `turbo.json`.
  - `pnpm discover --check` changes nothing and fails if the feature list, a folder discovery or `turbo.json` is out of date.
  - `pnpm new package <layer>/<name> --owner <agent> [--purpose "<one line>"]` and `pnpm new feature <name> --owner <agent> [--purpose "<one line>"]` create an empty package or feature, with its `AGENTS.md` written from `templates/package-AGENTS.md`. Adapters also take `--runtime <node | web | workers | any>`; target packages are `targets/<target>/<runtime | deploy | testing>`. Without `--purpose` the file holds `TODO: one-line purpose`, and `pnpm check` fails until you replace it.
  - `pnpm who-touches [<package>] [--repo <owner/name>]` lists the open pull requests that change a package. It reads GitHub's public REST API, so it needs no sign-in; set `GH_TOKEN` for the higher rate limit. A short name that fits several packages (`runtime`) lists them, so you can pick the full name.

## Folder discovery

A package registers the subfolders of one of its folders without a hand-written
list by declaring them in its `package.json`:

```json
"halonic": {
  "discover": {
    "states": {
      "folder": "src/states",
      "file": "state.ts",
      "suffix": "State",
      "satisfies": { "type": "StateRegistry", "from": "src/kernel/registry.ts" }
    }
  }
}
```

Every subfolder of `src/states` that has a `state.ts` must export
`<folder in camelCase>State` from it (`sub-workflow/state.ts` exports
`subWorkflowState`). `pnpm discover` writes `src/generated/states.ts`
(gitignored), which exports them keyed by folder name:

```ts
export const states = {
  final: finalState,
  "sub-workflow": subWorkflowState,
} as const satisfies StateRegistry;
```

`satisfies` is optional. When the type maps a union to entries, such as
`{ readonly [Type in StateType]: StateHandler<Type> }`, a missing or extra
folder fails typecheck. `pnpm discover --check` fails on a subfolder without the
file, a folder name that isn't lowercase words joined by hyphens, a wrong
declaration, and a `turbo.json` codegen task that doesn't list the package's
`package.json`, the discovered files and the generated file. `pnpm discover --fix`
adds those globs, so Turbo never replays a stale generated file.
