# @halonicjs/app-studio

The Studio app. Today it only holds the Studio's feature list: one
`"@halonicjs/studio-feature-<name>": "workspace:*"` dependency per feature,
kept in step with `packages/studio/features/` by `pnpm discover --fix` and
checked by `pnpm check features`. Vite, the Tauri shell and the Android
project come later.

- **Layer:** apps
- **Owner:** elena
