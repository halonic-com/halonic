# google-setup.connector-token

- Status: active
- Since: unreleased
- Source: HAL-9410 (follow-up of HAL-9378); Liam's decision of 14 Nov: the run finds the token through the record

When a run needs the sign-in of a Google connector, `googleTokenFor` shall look up the setup record by the connector's workspace key and id, and give the record's account ref and the refresh token's name for it. It shall give `null` when the connector has no setup, and shall not fall back to the connector file's account address or to a record of another workspace.

## Examples

- Given a setup for workspace A's `gmail`,
  when its token is looked up,
  then the answer holds that setup's account ref and `google-account-<accountRef>`.
- Given a setup for workspace A's `gmail` and none for workspace B's `gmail`,
  when B's token is looked up,
  then the answer is `null`, never A's account.
- Given a connector with no setup,
  then the answer is `null`.
- Given two setups for the same connector,
  then the answer is the one started last.
- Given a stored record with no link,
  then the answer is `null` and nothing throws.
