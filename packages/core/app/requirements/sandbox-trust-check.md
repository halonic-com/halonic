# app.sandbox-trust-check

- Status: active
- Since: 0.1.0
- Source: HAL-3306; docs/adr/2026-11-10-mxc-sandbox-backend.md ("The trust check"); the real-PC check on HAL-2546 (10 Nov) and the plan on HAL-3292

The trust check of a sandbox backend shall run the backend's check, then open one canary session with a profile that uses the paths a real run uses, run the canary's probes in it and close it. It shall pass only when the check passes, the session opens, the probe program starts, no probe gets through, both controls work (a file in a read-only allowed folder can be read, and Node loads a script from the read-write working folder) and the fence proof is fenced. Otherwise it shall fail with exactly one code from a closed list: the first leak in the list's order, then `too-strict` when only a control failed, then `did-not-start`, then `other`, with the sentences behind it kept apart for logs. Name lookups that leave through the operating system's DNS service shall be reported, not failed.

## Examples

- Given a passing check, a fenced session, no leaks and both controls working,
  then the check passes, and the session is closed.
- Given nothing leaked but the read-only file couldn't be read, or Node couldn't load the script,
  then the check fails with `too-strict`.
- Given a control failed and a hidden file could be read,
  then the check fails with `file-readable`, because a leak comes first.
- Given a port and a DNS server could both be reached,
  then the check fails with `port-reachable`, the first of them in the list.
- Given the session can't be opened, or the probe program didn't start,
  then the check fails with `did-not-start`.
- Given the backend's own check fails, the canary profile can't be built or the probe throws,
  then the check fails with `other`, with the message for logs.
- Given the probes found nothing but the fence proof is `not-fenced`,
  then the check fails with `other`, with the fence's sentence for logs.
- Given name lookups leave through the operating system's DNS service and nothing else failed,
  then the check passes and says so.
