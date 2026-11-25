# @halonicjs/action-catalog

The reviewed stepper definitions shipped with Halonic: one file per definition under `src/<service>/`, found by
`pnpm discover --fix` without a hand-edited list, each with the SHA-256 of its source and the package files it imports. Pure code, no IO. The design is
the steppers architecture note (HAL-17491, sections 1.2, 4.1, 7.8 and 7.9); the types come from
`@halonicjs/action-steppers`.

- **Layer:** core
- **Owner:** tomas
- **Public API:** `@halonicjs/action-catalog`

## Example

```ts
const checked = validateStepperRequest(requestJson, shippedCatalog); // from @halonicjs/action-steppers
if (checked.ok) cardBody = renderManualGuide(checked.value, shippedCatalog);
// "…\n1. Open https://github.com/acme/app/settings\n2. Under **Social preview** …"
const hash = sourceHashOf("github.upload-social-preview", 1); // goes into the request's record
```

Only declarative steps (`guided`, `input`) ship for now. API steps (`call`, `check`) wait for the ToolScript ADR
(HAL-17560). The manual guide is `renderManualGuide` from `@halonicjs/action-steppers`, built from the same
definitions; the catalog's tests check that every definition can be done by hand (`manualFormProblems`).

## Adding a guided definition

A definition widens what a user can be asked to do, so it's a security pull request: Julian reviews it.

1. **One file:** `src/<service>/<name>.ts`, both in lowercase words joined by hyphens. It exports `definition`, whose
   `id` is `<service>.<name>`, `service` is `<service>` and `version` is `1`. Copy
   `src/github/upload-social-preview.ts`. Every other `.ts` file in a service folder counts as a definition, so shared
   parameters go next to the folder (`src/github-parameters.ts`), and tests are `<name>.test.ts`. A definition's
   `sourceHash` covers its own file and every file it reaches through relative imports, so changing a shared file
   changes the hash of each definition that uses it.
2. **Parameters:** `strictParameters` from `@halonicjs/action-steppers`. Every text has an anchored pattern or is a
   choice; no free address, body or header.
3. **Steps:** a `guided` step has an `address` on the service's own web origin with `{name}` placeholders, numbered
   `instructions` written for that exact page (bold the labels the user clicks: `**Edit**`), and `checkedOn`, the date
   you walked them against the real page. A value the user pastes back is a `result` with an anchored pattern; a key,
   token or one-time password is never a `result` but a `secret` `input`.
4. **Preview:** one plain sentence per step that names the target. A guided step Halonic can't check says so.
5. **Requirement:** `requirements/<service>-<name>.md` in EARS form, `Since: unreleased`.
6. **Tests:** `src/<service>/<name>.test.ts`, wrapped in `verifies("action-catalog.<service>-<name>", …)`, pinning the
   preview, the targets and the whole manual guide (`renderManualGuide`) for `acme` parameters, and refusing a path trick in a parameter.
7. **Generate:** run `pnpm discover --fix` and commit `src/catalog.generated.ts`. `pnpm check` (rule `catalog-hashes`)
   fails until you do, and again whenever the definition changes.
