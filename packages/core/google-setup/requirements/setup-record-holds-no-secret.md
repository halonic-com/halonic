# google-setup.setup-record-holds-no-secret

- Status: active
- Since: 0.1.0
- Source: HAL-706 (build plan D5, security review A7 in HAL-705)

The setup records shall let a record hold only its listed values: route, account type, start time, project ID, step ticks, the "In production" tick, client ID, the client secret's ref and save time, the sign-in start and last sign-in times, and the check result per service. The setup records shall refuse, without writing anything, an edit that would make an invalid record, such as a client ID that isn't one. They shall report a stored record with any other key or an invalid value as damaged, leave it out of the list, and never repeat a stored or edited value in an error message.

## Examples

- Given the record's keys, then they are exactly the listed ones, so none can hold the client secret, a refresh, access or ID token, the authorisation code, the PKCE `code_verifier` or the `state`.
- Given a client secret where the client ID belongs,
  when it is saved as the client ID, then it throws `SetupRecordError` `refused`, nothing is appended, and the message doesn't hold the value.
- Given a stored record with an extra `refreshToken` value,
  when it is read, then it throws `SetupRecordError` `damaged` without the value, and the list leaves it out.
- Given a client secret ref that breaks the ref rule, such as `gclient_1_staged`, then the edit is refused.
