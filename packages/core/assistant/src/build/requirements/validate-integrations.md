# assistant.build.validate-integrations

- Status: active
- Since: unreleased
- Source: HAL-1309 (I4, plan rev 1); HAL-18267; integration guide section 10, rule 4

When the model calls `validate`, the Build chat shall also check each local integration in `integrations/<folder>/`, changes to review included: its `integration.yaml` with the same check `halonic validate` runs, the tools its code declares against the tools on its sheet (name, `risk`, `untrusted`), and its code for the direct forms of `eval`, `Function`, a dynamic `import()`, `fetch` and Node's built-in modules and `process`; and report each as an `error` line. The checks on the code read it as text and are hints for the model, not a security boundary.

## Examples

- Given a change to review in `integrations/notes/integration.yaml` whose tool has no `untrusted`,
  when the model calls `validate`,
  then the result has an `error` line for `integrations/notes/integration.yaml`.
- Given a sheet whose tool `add_note` has risk `write` and code that declares it with risk `read`,
  when the model calls `validate`,
  then the result has an `error` line for the code file naming `add_note` and both risks.
- Given code in `integrations/notes/backend/index.js` that calls `fetch(`,
  when the model calls `validate`,
  then the result has an `error` line for that file saying to send requests through `host.http`.
