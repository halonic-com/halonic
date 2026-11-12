# Decision: sandbox-srt asks the ready check again after a failure

- Task: HAL-7062
- Approval: Liam approves this note in review on [HAL-7062](/HAL/issues/HAL-7062), following his review of #2007 on [HAL-6518](/HAL/issues/HAL-6518)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:An/JCLts086MEd2chNssCsK/MpXmm17pqsc5RoESXRP4RzEuvjykoImH9OLGM5WCsyYapLNLjlIwUJ50uS6eAg==

## What changes

The active requirement `sandbox-srt.check` said the ready check (srt starts its smallest sandbox and runs `true` in it, within 10 seconds) is "asked once per process", and the adapter kept a failure as long as a pass. Now only a pass is kept for the rest of the process. A failure is dropped once it is known, so the next check runs the ready check again. Checks made while one is running share it, so there is never more than one in flight and no tight loop.

The requirement gets one new example (a host whose check timed out once under load can start at the next check, without a restart). No example was removed or weakened.

## Why

In a long-running agent host, one timeout under load left the sandbox "not ready" until the host restarted. A pass can stay cached because what the machine can run doesn't change while Halonic runs, and `open()` still proves the fence for every session.

## Cost

None while the sandbox is ready. While it isn't, each check pays for one more ready check (320 ms measured in the bubblewrap fence job, at most 10 seconds), instead of answering from the cache.

## Tests

No test was skipped or weakened. `srt-sandbox.test.ts` adds two: a failure followed by a pass reports ready on the second check and doesn't start a third sandbox, and two checks made at the same time share one ready check.

## Covers

- sandbox-srt.check
