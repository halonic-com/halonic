# Decision: a restore whose listing failed tries again at the next listing

- Task: HAL-19027
- Approval: Liam approved restoring a sign-in on open on HAL-18911 and HAL-19030; he reviews this PR and signs this note
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:e9Y07yhRq6WwpLcZMIhIYkfJbq0tpyfMaZ7cNMYWtPtSG53rFEMUZnRjhjeqh+uvfFRQF+qrO9jIf9Ue6VwjBQ==

## What changes

The installed app's click test still showed the Paperclip connection signed out after a restart,
on a build with the restore (`9c0dbb3e1`, run 45733391864). The restore runs once, when the
workspace opens trusted. If the agent host can't list the workspace's connections at that moment,
as right after a cold start, the restore only reported the failure and never ran again, so the
row stayed on Sign in again while the key in the keychain still worked.

- `services.paperclip-restore`: one sentence is added. When the host can't list the workspace's
  connections for the restore, the Studio services report it and try the restore again before
  the next listing of the connections, until one listing succeeds. Every other rule stays as it
  was: nothing is restored before the person trusts the workspace, a failed keychain read or
  hand-over is still not tried again, and the path, address and company checks are unchanged.
- An example for that case is added.

## Tests

No test was weakened, skipped or deleted. New tests in
`packages/studio/services/src/host-agent-connections-restore.test.ts`:

- a restore whose first listing fails hands the key over at the next list, which then reads online
  (fails before the fix);
- once a listing succeeded, later lists read the keychain no more;
- a workspace that never asked for a restore, such as an untrusted one, hands nothing over on list.

## Covers

- services.paperclip-restore
