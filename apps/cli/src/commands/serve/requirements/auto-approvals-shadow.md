# cli.commands.serve.auto-approvals-shadow

- Status: active
- Since: unreleased
- Source: HAL-19971 (follow-up to HAL-19901, the reviews of #6621); `auto-approvals.shadow-runner`, `paperclip-client.shadow-reads`

While the serve profile holds an `auto-approvals/shadow.json` with the pinned issue, both document ids, the owners and a connection whose Paperclip key is stored, the `halonic serve` command shall run the auto approvals shadow runner: once at the start, then on the runner's own delay, through the read-only shadow reader only, so it sends nothing to Paperclip but GETs on the shadow list. After every poll it shall write the day's digest to `auto-approvals/digests/<UTC day>.txt` in the profile, finish the last day's digest when the UTC day changes, and count the calls to Paperclip per day, from the day's start or from when `serve` started, whichever is later. When the runner halts, `serve` shall stop polling until a person restarts `serve`, and the digest shall say why and since when. Without the file, `serve` shall read nothing for auto approvals; with a file it can't use, or no stored key for its connection, it shall log why and not start the runner.

Rationale: the 14-day shadow run needs the runner on a timer and a digest an owner can read each day, without giving it any way to write to Paperclip. A halt, such as a refused request or a ledger that can't take an entry, means a person must look, so no timer may clear it.

## Run notes

- `serverTime()` is the `Date` of the reader's newest answer, whatever its status, a 404 or a 429 included. That is the server's clock either way, which is all the 2-minute skew check and the never-list's 24 hours need.
- The digest file sits next to the ledger in the same profile folder. The head check at start (`ledger.head_mismatch`, A44) only catches a ledger swapped or cut back by accident: anyone who can replace the ledger file can replace the digest file too. Keep the profile folder the person's own.
- The ledger doesn't record which never-list revision was in force for an entry (A25). Shadow mode doesn't need it: the digest's revision times are enough to work it out. Live mode must record it on every decision before it starts.
- The drills of the 14-day run (Part C): C1 and C2 end in `stop.not_owner_latest`, C3 in `never_list.not_owner_latest`.

## Examples

- Given no `auto-approvals/shadow.json` in the serve profile,
  then `serve` sends no shadow read and writes no ledger or digest.
- Given a config and a Paperclip that answers every read with 500,
  then every request was a GET, the ledger holds `run.started` and `read.status`, and today's digest says "Runner: running".
- Given the newest digest names a ledger head the ledger doesn't hold,
  then the runner doesn't poll, and the digest says "Runner: halted since … (ledger.head_mismatch), until a person restarts it".
