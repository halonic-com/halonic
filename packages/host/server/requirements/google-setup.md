# server.google-setup

- Status: active
- Since: 0.1.0
- Source: HAL-710 (build plan B5, D6); Google setup flow design on HAL-621

The server shall answer `GET /api/google/setups/<accountRef>` with the saved progress of that account's Google setup and the steps generated for it (`setupSteps`, from the record's route, account type and project ID, the account's address and the ticked services that the `GoogleSetupSource` port gives), only behind the sign-in. The answer shall hold no client secret, no ref of one, no token and no authorisation code: it shows only that a secret is saved, and when. It shall carry the saved problem (`savedConnectorState`) of the account, if there is one. A ref that has no record, that isn't a setup ref, or whose account no connector uses any more shall answer 404 with the code `google_setup_not_found`. A server whose host passed no `google` ports shall answer 404 `not_found` on every path under `/api/google/`.

Rationale: the setup item shows its steps and progress from this answer, and it is shown to anyone who is signed in, so it must be safe to log, cache in a page and screenshot.

## Examples

- Given a signed-in caller and a setup with a saved secret, then the answer says `clientSecretSavedAt` and holds neither the secret nor its client ref.
- Given no session on a server with a password, then the answer is 401 and the ports are not asked.
- Given a ref that isn't a setup ref, then the answer is 404 `google_setup_not_found`.
- Given a host with no `google` ports, then `GET /api/google/setups/anything` answers 404 `not_found`.
