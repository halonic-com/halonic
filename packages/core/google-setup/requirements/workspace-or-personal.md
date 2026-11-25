# google-setup.workspace-or-personal

- Status: active
- Since: 0.1.0
- Source: HAL-707 (build plan B2; design 2.3); HAL-18663 made *Testing* the default for a personal app

Where the account is a Workspace account, the steps shall create the project inside the organisation, set the audience to Internal with no required tick, and show the admin note before sign-in. For a personal account, they shall allow any project, set the audience to External with the required tick `test-user` while the app stays in *Testing* (the default) or `in-production` when it is published (`google-setup.personal-testing`), and show the warning preview before sign-in. `accountTypeFromAddress` shall return `personal` for `@gmail.com` and `@googlemail.com` addresses in any case, and nothing for any other address.

## Examples

- Given a personal account, then step 3 requires the tick `test-user`.
- Given a Workspace account, then step 7 shows the admin note.
- Given `someone@example.com`, then `accountTypeFromAddress` returns `undefined`, so Studio asks.
