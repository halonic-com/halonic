# harness-kit.web-entries

- Status: active
- Since: unreleased
- Source: HAL-18013 (the Worker runs harness steps in a Cloudflare container), Liam's conditions on HAL-18023

The Web entries of the harness kit and of the Claude Code and Codex harnesses (`@halonicjs/adapter-harness-kit/web`, `@halonicjs/adapter-harness-claude-code/web` and `@halonicjs/adapter-harness-codex/web`) shall import no `node:` module and no third-party module, through every `import` and `export … from` they reach. If the check can't resolve an import, it shall fail rather than skip it. The Web harness factories shall take the settings writer, the own-sandbox check and the path rules as required options, with no fallback to this computer's disk or `node:path`.

## Examples

- Given the three Web entries, when every module they reach is followed, then none imports a `node:` or third-party module.
- Given a module that re-exports from `node:path` with `export … from`, when the check follows it, then the check fails naming it.
- Given an import the check can't resolve, when the check follows it, then the check fails naming it.
