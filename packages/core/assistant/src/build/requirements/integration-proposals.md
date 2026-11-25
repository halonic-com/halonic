# assistant.build.integration-proposals

- Status: active
- Since: unreleased
- Source: HAL-1309 (I4, plan rev 1, Done when tests 1 and 3); HAL-18267

When the model writes an integration in the Build chat, its permission sheet, its code and the connector file that switches it on shall be changes to review like any other file: nothing of them shall reach a run until the person accepts them, Reject shall put the workspace back as it was, and the `risk` each tool has on the sheet shall be the one the run-time check reads, so a tool whose risk isn't `read` still asks first.

## Examples

- Given the person asks "build an integration for the notes service at api.notes.example.com",
  when the model proposes `integrations/notes/integration.yaml`, `integrations/notes/backend/index.js` and `library/connectors/notes.connector.yaml`,
  then each is a change to review and Try it reads none of them.
- Given those three changes to review,
  when the person rejects them,
  then none of the three files is in the workspace.
- Given a sheet whose tool `add_note` has risk `write`,
  when the person accepts it,
  then the run-time check of a call to `add_note` asks first.
