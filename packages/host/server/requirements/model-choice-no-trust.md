# server.model-choice-no-trust

- Status: active
- Since: unreleased
- Source: HAL-16635 (HAL-14808 PR 2, Liam's D2: no trust from a browser in the first version)

The model choice routes shall never let a request grant the workspace's trust. `POST /api/model-choice/continue` shall always call the service's `continue` with no shown fingerprint, whatever the body holds, and `GET /api/model-choice/preview/<testId>` shall answer the trust line's facts (`reaches`, `localOnlyOff`) without the fingerprint. Continue shall answer `{"ok": true, "changes": […], "trusted": <boolean>}`, or `{"ok": false, "failed": "<step>", "keySaved": <boolean>}` with no reason; when the failed step is `key` or `write`, the reason shall go to the error log.

Rationale: starting a run under trust someone granted at the computer is not the same as granting it over the network, possibly from a phone. A served Continue saves the key and the choice; trust stays a step at the computer. A failed step's reason can name the host's own paths, so it stays on the host.

## Examples

- Given `{"testId": "test_1", "shownFingerprint": "sha256:fake"}`, then the service's `continue` gets `test_1` and no fingerprint.
- Given a passed test, then its preview answer has no `fingerprint` field.
- Given a Continue whose file write failed with a message naming a folder, then the answer is `{"ok": false, "failed": "write", "keySaved": true}` and the message is in the error log only.
