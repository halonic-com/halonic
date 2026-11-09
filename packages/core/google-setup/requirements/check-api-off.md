# google-setup.check-api-off

- Status: active
- Since: 0.1.0
- Source: HAL-708 (build plan B3; design 3.5 point 3, section 6 item 7)

When a service's check answers 403 with an `ErrorInfo` detail whose reason is `SERVICE_DISABLED`, or with an `errors` entry whose reason is `accessNotConfigured`, `readGoogleCheckAnswer` shall return `apiOff`. It shall keep `api` and the API's name only when the service's sheet lists the API that `metadata.service` names, taking both from the sheet, and as `project` the caller's project ID when it is valid, or else the project number from `metadata.consumer`. When `api` is known, it shall add the API's Console link in that project. It shall keep nothing else from Google's answer.

## Examples

- Given Google's full answer for `ledger.googleapis.com` in project number `123456789012`, and no project ID,
  then the result is `apiOff` with `api`, `apiName` `Ledger API`, `project` `123456789012` and the Enable link in that project.
- Given the same answer and the project ID `halonic-x1`, then `project` is `halonic-x1`.
- Given only `accessNotConfigured`, then the result is `apiOff` with no other field.
- Given `metadata.service` of `evil.example.com`, or of `other.googleapis.com` that the sheet doesn't list, then the result has no `api` and no link.
- Given `consumer` of `projects/some-word` rather than a project number, then the result has no `project`.
