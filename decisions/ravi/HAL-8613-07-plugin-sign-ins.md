# Decision: a trusted plugin's backend may hold a sign-in

- Approval: the plan for PR 5b is on HAL-8613 (19 Nov), Liam set its scope there on 21 Nov; SL1 is the team's decision with the designer (C403, HAL-14497, HAL-2282 rule); Liam approves this note in his security review
- Kind: user-visible
- Task: HAL-8613

## What changes

Halonic stops refusing a plugin backend's `signIns` and runs them in the agent host:

- **The three refusals go, for plugins only.** The format's plugin check no longer refuses `backend-sign-in`, and checks a backend's sign-ins as a sheet's, under `backend`. A plugin has no `kit`, so the sheet's `sign-ins-need-kit-2` is said at `sdk`. `readPluginFolder` no longer refuses one in an `integration.yaml`. The kit's loader lets a sign-in through for a plugin's backend (`source.plugin`) and keeps `sign-ins-not-allowed` for any other local integration, whose approval shows no sign-in.
- **The host runs a trusted plugin's sign-ins** under the plugin's id. Each read of the sheet, the settings or the client secret reads the plugin's folder and checks the trust again, as a backend's start does, through the same `pluginBackendChoices`. The client secret comes only from the plugin's own handed-over secrets. A plugin that isn't there, changed or lost its trust answers `404 unknown_integration`. A backend's start gets its own plugin's sign-in tokens, which the kit places.
- **The trust summary counts sign-ins** after the secrets: "…Sends 2 secrets, has 2 sign-ins and reaches 2 addresses." (SL1).
- Two cleanups from Liam's reviews: the CLI trust check no longer escapes a sign-in line's hosts twice, and `endpointHost` loses a branch that couldn't run.

Changed requirements and tests:

- `format.plugin-backend-sign-ins`: from "refuses" to "accepts and checks", with the `sdk` example.
- `app.plugin-folder`: the `backend-sign-in` refusal and its example go; a sign-in in an `integration.yaml` or a `plugin.yaml` now reads.
- `integration-kit.loader`: the same sheet that `sign-ins-not-allowed` refuses as a plain local integration loads as a plugin's backend.
- `agent-host.integration-sign-in-routes`: `404 unknown_integration` also for a plugin the trust doesn't cover now. The host test asks for `example`, which no profile has, and still gets the 404.
- `plugins.plugin-trust-check`: the summary counts sign-ins.
- `host-sign-ins.test.ts`: `noSignInIntegrations` is gone, so its test now asks an `openHostSignIns` that runs nothing, and the routes without a profile folder are tested.
- `host-plugin-backends.test.ts` and `host-plugins.sea.test.ts`: the backend context and `hostPlugins` take the sign-in tokens; existing tests are unchanged.

## Why

Since #4066 the trust check names each sign-in's hosts, its scopes, the token host warning and the client secret's hosts, and #4116 keeps the revoke host to the token or sign-in host. So the person sees every host a plugin's sign-in reaches before they trust it, which was the only reason for the refusals. Studio's Sign-ins section (#3941, #3983, #3984) is already built, and without the host side it would show its load error. A local integration that isn't a plugin has no such trust check, so it keeps the refusal. Reading the folder and the trust again at each request means a changed plugin can't use a sign-in it was never trusted with. Settings and secret names come from where the backend's start reads them, so there's one source (Julian's notes of 13 Nov).

## Covers

- format.plugin-backend-sign-ins
- app.plugin-folder
- integration-kit.loader
- agent-host.integration-sign-in-routes
- plugins.plugin-trust-check
- packages/core/format/src/kinds/plugin/backend-sign-ins.test.ts
- packages/core/app/src/plugin-folder.test.ts
- packages/adapters/integration-kit/src/loader.test.ts
- packages/studio/features/plugins/src/trust/trust-check.test.ts
- apps/agent-host/src/host.test.ts
- apps/agent-host/src/sign-in/host-sign-ins.test.ts
- apps/agent-host/src/plugin/host-plugin-backends.test.ts
- apps/agent-host/src/plugin/host-plugins.sea.test.ts
