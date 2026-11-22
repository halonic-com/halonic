# integration-sign-in.sign-in-host

- Status: active
- Since: unreleased
- Source: HAL-12191 (HAL-8613, app side), from the notes of HAL-8618

The host shall run the sign-ins of every integration the app names from one source for each: the integration's `read` gives its sheet and its settings, and both the kit's loader (from the same `choices`) and the host's sign-ins read that one place each time they need it, so a changed setting or sheet counts for both at once. The host shall read the client secret only through the secrets the app gives for the integration, which are the person's picks seen by the sheet's name (the kit's `chosenSecrets`). It shall give each integration one set of parts (its tokens for the kit, its flow, and the state of each sign-in) and answer a callback with the flow whose path it is, a cancelled sign-in's included, so its page says it was cancelled, and with the flow's plain 400 page when no flow is waiting on that path. It shall say where each sign-in of the sheet stands: `signedIn`, `signedOut`, `approvalChanged` (a grant saved for another sign-in than the one described now) or `cannotSignIn` (a setting is missing), with how the last sign-in ended since the host started and how many have ended, so a sign-in that ends the same way twice in a row still reads as new.

## Examples

- Given a client secret that the sheet names `example-client`, when a sign-in starts and finishes, then the token request carries what the integration's secrets give for `example-client`.
- Given a setting that changed after the host was built, then the next status and the next start read the new one.
- Given two integrations with a sign-in pending each, when a callback arrives at the second one's path, then only the second flow answers it.
- Given a cancelled sign-in, when its callback arrives, then its flow's page says it was cancelled in Halonic, so nothing was saved, nothing is exchanged and its status carries the outcome `cancelled`.
- Given a callback at a path no flow is waiting on, then the answer is a plain 400 and nothing is exchanged.
- Given an integration the app doesn't name, then the host has no parts for it.
- Given a sheet with a sign-in and no grant, then its state is `signedOut`; after it finishes, `signedIn`; after a setting it reads changes, `approvalChanged`; and with that setting missing, `cannotSignIn`.
- Given a sign-in that ended in `codeRefused`, then its status carries that outcome.
- Given a sign-in cancelled twice in a row, then its status carries the outcome `cancelled` both times, with the count 1 and then 2.
