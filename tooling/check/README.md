# @halonicjs/tooling-check

Our own repo checks. This package is being built up over a few pull
requests: first the workspace model, then `pnpm check` and the rules.

- **Layer:** tooling
- **Owner:** mateo

Uses `@typescript/typescript6` for the parser API until TypeScript 7.1
ships its own (D9); then that dependency goes.
