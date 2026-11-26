# paperclip.merge-control-security-signoff

- Status: active
- Since: unreleased
- Source: HAL-19508; the live Merger since 26 Nov 07:34 UTC (HAL-19404, Chief's OK 26 Nov 07:33; HAL-19358), seen missing in the shadow by the CI sweep of 26 Nov (HAL-18424)

While an open pull request is a security pull request, by its `security` label, a line starting `security-review` in its description, or a changed path other than a changeset under `apps/studio/src-tauri/` or `docs/security/`, named `SECURITY.md`, or naming sandbox, secret, sign-in, oauth, keychain or trust, the plugin shall not queue it until a team-account comment holds one plain line `Julian: security sign-off on head <sha>` naming its current head, posted after its last push, with no change request of Julian's after it, and shall give the gate reason `security PR: waiting for "Julian: security sign-off on head <h9>"`; a queued pull request shall not be taken out for it.

## Examples

- Given #6418, approved by Liam on its head, changing `packages/core/app/src/trusted-runner-start.ts`,
  when a pass runs,
  then it isn't queued and the gate names the sign-off it waits for.
- Given the same pull request with Julian's sign-off on its head after the last push,
  when a pass runs,
  then it is queued.
- Given a sign-off naming another head, posted before the last push, asking for changes, or followed by Julian's change request,
  when a pass runs,
  then it isn't queued.
- Given a pull request with the `security` label, or a `security-review` line, and no security path,
  when the gate runs,
  then it waits for the sign-off; with neither, it doesn't.
- Given a pull request changing only a changeset, the lockfile and a workflow,
  when the gate runs,
  then it doesn't wait for the sign-off.
- Given a queued security pull request without the sign-off,
  when a pass runs,
  then it stays queued.
