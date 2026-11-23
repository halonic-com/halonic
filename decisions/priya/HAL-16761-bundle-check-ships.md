# Decision: the cloud bundle check judges what ships, not what's parsed

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16761 (Liam's decision: option 2)
- Kind: user-visible

## What changes

`checkCloudBundle` (`tooling/check/src/lib/bundle.ts`) used to check every
input esbuild parsed. It now checks only the inputs that put bytes in the
script: those that any output lists with a `bytesInOutput` above 0. An entry
whose byte count is missing or isn't a number still counts as shipped, never
as 0. esbuild leaves an input it dropped out of every output's `inputs`, so
an input no output lists has no bytes in the script and isn't checked.

`tooling/check/src/lib/bundle.ts` is one of the guard's trust roots (the guard
commands import it), so this note is `user-visible` and carries two
guardians' signatures.

It fails closed: when any output doesn't list its inputs at all (an older
esbuild, a hand-written metafile, a metafile from another bundler), every
parsed input is checked, as before.

The core packages `app`, `engine`, `format`, `ports`, `std`, `workspace` and
`yaml` now say `"sideEffects": false`, so esbuild drops the modules of theirs
the Worker never uses. None of their modules does work at import time: no
top-level statement other than declarations, no bare `import "./x"`, and
every top-level `const` built from a call builds a plain value (schemas,
sets, keys, settings).

## Why

#5409 is the first change that puts `@halonicjs/engine` in the Cloudflare
Worker's import graph. The engine imports the `@halonicjs/app` root, which
reaches `@halonicjs/format` and `@halonicjs/workspace`, and through them the
`yaml` library. With `"sideEffects": false` esbuild drops all of it (0 bytes
of `yaml` in the script, which shrinks from 1.76 MB to 1.41 MB), but the old
check still failed, because it read what was parsed.

The rule is about what ships to the provider. Anything with bytes in the
script is still checked, so this can't let an unchecked library run at a
provider. If a module were marked side-effect free by mistake, the bundle
would lose code and the Worker would break at run time, where its tests catch
it.

Narrowing the engine's imports to subpaths, so nothing parses `format`'s or
`workspace`'s root, is HAL-16764.

## Covers

- tooling/check/
