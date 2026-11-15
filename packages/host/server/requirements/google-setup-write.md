# server.google-setup-write

- Status: active
- Since: 0.1.0
- Source: HAL-9409; Liam's plan approval on HAL-10009

The server shall start a Google setup record on `POST /api/google/setups` with `{ accountType, connector: { workspace, id } }`, answer 201 with its `accountRef`, and keep the connector link on the record, so that the record is the one `forConnector` finds for that workspace and connector. It shall change a record on `PATCH /api/google/setups/<accountRef>` for the edits a person makes only (account type, project ID, a step done or open again, "In production", client ID, and that the connector's address changed, which clears the wrong-account note), and refuse the edits the server records itself (sign-in, client secret, service checks). It shall remove a record, its refresh token and its client secret, not while another account uses the client, on `POST /api/google/setups/<accountRef>/start-over`, without asking Google. A body that isn't what the route expects, or a connector link that breaks the name rules, shall answer 400 `bad_request` and write nothing. A ref with no record shall answer 404 `google_setup_not_found`. A request a browser says comes from another site shall be refused. No answer shall hold a secret, a token or a client ref.

Rationale: the desktop app has no way to write the records, so the agent host, which holds the sealed tokens, writes them for Studio through these routes.

## Examples

- Given a workspace key and a connector `gmail`, when a setup is started, then the answer is 201 and `forConnector` returns that record.
- Given a connector id that holds `..`, when a setup is started, then the answer is 400 and no record exists.
- Given an edit `{ kind: "signed-in" }`, then the answer is 400 and the record is unchanged.
- Given a record with a project ID, when `project-id` is set to `null`, then the project ID is cleared.
- Given a signed-in account, when Start over runs, then the record and the refresh token are gone and Google was not asked.
- Given a record with a wrong-account note, when `address-changed` is sent, then `wrongAccountAt` is `null`.
- Given a ref with no record, then edit and start over answer 404.
