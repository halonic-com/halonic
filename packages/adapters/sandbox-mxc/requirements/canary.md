# sandbox-mxc.canary

- Status: active
- Since: 0.1.0
- Source: HAL-3305, HAL-3306 (`TrustCanary`), HAL-3292 (plan, "Grant rules, 12 Nov"), HAL-3503 (grant rules 5 and 6), ADR 2026-11-10-mxc-sandbox-backend ("The trust check")

The sandbox-mxc adapter shall build the trust check's canary: a profile built exactly like a real session's, with the project folder as the working folder, a fresh box folder under Halonic's data folder (never `%TEMP%`) for the temp, settings and read-only folders, the Node folder readable and the bridge as the network; and a probe that runs in the open session. A new profile shall use a new box folder and remove the one before, and the probe shall remove the canary's box folder when it ends. The probe shall find out, with a Node program in the box, which of these got through: a hidden file or a denied file inside a readable folder (`file-readable`), a file created, changed or removed in the hidden folder or the read-only folder (`file-writable`), a loopback port of a listener on this computer (`port-reachable`). It shall report two controls: a file in the read-only folder can be read, and a third, that Node loads a script from the working folder, lists the folder and writes a file in it, then removes it and the script. It shall report the leaks even when the session's own fence proof said `not-fenced`, so the trust check can name the leak. A probe program that prints nothing shall be `started: false`; one that doesn't end in time shall make the probe throw and be killed. It shall report that name lookups leave the box, which is a known limit of MXC.

## Examples

- Given a box that is fenced and not too strict,
  when the trust check runs on the canary,
  then it passes, and says name lookups leave.
- Given a box where the hidden file, or a denied file inside the readable folder, can be read,
  when the trust check runs,
  then it fails as `file-readable`, though the session opened `not-fenced`.
- Given a box where the probe can write a file in the hidden folder,
  when the trust check runs,
  then it fails as `file-writable`.
- Given a box where the probe reaches the listener,
  when the trust check runs,
  then it fails as `port-reachable`.
- Given a box where the read-only file can't be read,
  when the trust check runs,
  then it fails as `too-strict`.
- Given a box where Node can't list or write the working folder, or can't load its script from there,
  when the trust check runs,
  then it fails as `too-strict`.
- Given a probe program that prints nothing,
  when the trust check runs,
  then it fails as `did-not-start`.
- Given a probe program that never ends,
  when the time runs out,
  then the program is killed and the trust check fails as `other`.
- Given a finished trust check,
  when the project folder and the data folder are looked at,
  then no probe script is left in the project folder and the canary's box folder is gone.
