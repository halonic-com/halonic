# On Windows 11, MXC is a second sandbox backend, used only after a trust check

- **Status:** Proposed
- **Date:** 2026-11-10

## Context

On plain Windows there is no sandbox today, so agent runs don't start there
(the `windows` reason in [sandbox check reason codes](2026-11-09-sandbox-check-reason-codes.md),
and the board's D44 path). Windows 11 ships Microsoft's process container
(MXC). The board decided on HAL-2546 to offer it as an opt-in backend, with a
trust check, and to make it the default later. The plan is on HAL-3292.

The evidence comes from CI on `windows-11-arm` (Windows 11 Enterprise), as the
runner user and as a normal local user:

- HAL-2396, rounds 2 and 3: BaseContainer hides denied files, including a
  denied file inside a readable folder, and blocks loopback ports. The DACL
  tier (what Windows Server gets) leaked `deniedPaths`. pnpm fails with
  `EPERM lstat 'C:\'`.
- HAL-3303 (go/no-go): Claude Code and Codex run in the box through the SDK's
  `spawn`/`MxcProcess`, and `kill` ends the whole process tree. Denial capture
  crashed our host process. Writing outside the allowed folders is blocked,
  and so are outbound connections.
- HAL-3365: with a loopback egress rule for the bridge, every other loopback
  port is reachable too, and host names resolve outside the box. One policy,
  the bridge as MXC's network proxy, reaches only the bridge. No policy that
  reaches the bridge keeps name lookups inside the box.

We looked at running pnpm outside the box, making the drive root readable,
listing the drive root (`enumeratePaths`), and a loopback allow rule for the
bridge. Each one opens more than it fixes (see below).

## Decision

**`sandbox-mxc` is an adapter on the existing `Sandbox` port.** The port
doesn't change and stays at version 3. `capabilities()` is
`{ files: "shared", strength: "os" }`. Every rule below is in the adapter or
in `core/app`, not in the port.

### Where MXC is offered

Only on Windows 11 client editions (Home, Pro, Enterprise), where the SDK
reports the BaseContainer tier and `baseContainerSupportsIdentitylessLoopbackProxy`.
Everywhere else (Windows 10, Windows Server, the DACL tier on any edition, a
host without the proxy support) `check()` answers `{ ok: false, reason: "windows" }`,
the same as plain Windows today. The DACL tier is never used, even when it is
the only one there: it fails closed. "Not offered" is not a failure. There is
no trust check, no session and nothing new for the person to read.

### How the adapter runs a program

- Processes start through the SDK's `spawn`/`MxcProcess`, which gives the
  streams and a `kill` that ends the whole tree. Not through `run`.
- Telemetry is off on every SDK call.
- The UI policy is on (`ui.disable: false`), with no clipboard and no input
  injection; without it, Node and git don't start.
- Node programs start with `--preserve-symlinks --preserve-symlinks-main`.
- Files: the program reads and writes `workingFolder`, `tempFolder` and
  `settingsFolder`, reads `readOnlyPaths`, and nothing else. `deniedPaths`
  wins over every other list. `TEMP` and `TMP` point at `tempFolder`. The
  drive root is never granted, not even for listing.
- **Denial capture is not used.** The adapter never passes `captureDenials`,
  because it crashed the host process (HAL-3303). `onBlocked` reports what the
  child's own errors show (`EACCES`, `EPERM`, "Access is denied", refused
  connections), as on the other backends.

### The network: the bridge is MXC's proxy

- **Policy:** `egress: deny` with no rules,
  `ingress: { default: allow, hostLoopback: allow }`, and
  `runtimeConfig.networkProxy: http://127.0.0.1:<bridge port>`. This is
  HAL-3365 variant 1a, the only tested setup where the bridge is the one local
  port the box reaches. We don't use a loopback egress rule: it opens every
  loopback port.
- **Bridge host:** `open` takes `127.0.0.1` or `localhost`. It throws for
  `::1` in the first version, because IPv6 loopback is untested.
- **`allowedSites`:** when it isn't empty, `open` throws. SDK v1 has no rule
  per host name, so MXC never runs with the internet partly open.
- **What the bridge must do.** MXC points `HTTP_PROXY`, `HTTPS_PROXY` and
  WinHTTP at the bridge, so the harnesses' requests arrive in proxy form
  (`POST http://127.0.0.1:<port>/v1/messages`). The harness bridge accepts
  that form only for its own address. It refuses `CONNECT` and every other
  host, so it never becomes a proxy to the internet. It checks the per-run
  token on every request and never trusts a request for coming from the box.
  It does this on every backend, because it costs the others nothing.

### Known limits

These are written down in the threat model, the README and `halonic doctor`
(HAL-3308), not hidden:

- **Name lookups leave the box.** Lookups go through the Windows DNS client
  service, which runs outside the box and answers for any box that may use
  the network. A program in the box can't open a connection, but it can send
  small amounts of data out in the names it looks up. MXC has no setting that
  turns this off (HAL-3365).
- **pnpm and similar tools fail.** Their own code walks up to the drive root,
  which the box can't read. We don't run them outside the box for the agent,
  because that runs untrusted package scripts without the fence. We don't
  make the drive root readable or listable, because that opens every file name
  on the drive, including names in folders we keep private. Pointing `TEMP`
  into the working folder didn't help (HAL-3303). The limit stays until srt's
  Windows mode or Phase 5 gives Windows a stronger option.
- **The private-network permission works both ways.** The proxy setup needs
  it. In CI, the host couldn't connect into the box, but CI has no local
  network. The real-PC check (HAL-2546) adds a probe from another machine on
  the local network into the box. If it gets in, we come back to this record
  before MXC is turned on by default.

### The trust check

**What it is:** `check()`, then one short canary session under the real
policy (bridge proxy included), running a probe program. It runs at startup,
after any change to the sandbox settings, when the person asks to check again,
and when a running MXC session's fence proof is `not-fenced`. It has a time
limit.

**What it probes.** Each probe has a control that must work, or the result is
`other`:

| Reason code          | Fails when                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `file-readable`      | a hidden canary file, or a denied file inside a readable folder, can be read                                                                                 |
| `file-writable`      | a file outside the writable folders can be created, changed or removed                                                                                       |
| `port-reachable`     | a canary listener on the host, other than the bridge, can be reached (on loopback and on the host's own addresses)                                           |
| `internet-reachable` | an outside address can be reached, either directly (by IP and by name, bypassing the proxy) or through the bridge (`CONNECT`, or a request for another host) |
| `dns-reachable`      | a lookup sent straight to a public DNS server (UDP 53) gets an answer                                                                                        |
| `did-not-start`      | `check()` passed, but the box or the probe program didn't start                                                                                              |
| `other`              | anything else, including a failed control (such as reading an allowed file) and the time limit                                                               |

When more than one fails, the check reports the first in this order.

The probe also looks up a never-used name through the DNS client service and
records whether it got out. Under this policy it always does. That is the
known limit above: `doctor` shows it, and it doesn't fail the check, because
a failure there would switch MXC off on every machine.

**On failure,** MXC is off for this start of Halonic only. The person's
setting stays as they left it, and the next start checks again. Halonic never
falls back to running without a fence: if no other backend passes, the step
doesn't run.

### Choosing a sandbox on Windows (`core/app`)

`core/app` holds the choice. It takes a list of backends, so Phase 5
(HAL-3288) can add more. On Windows, in this order:

1. The person's explicit choice. An MXC setting of `on` is an explicit choice.
2. srt, once its Windows mode passes its own check.
3. MXC, when the MXC setting isn't set and `mxcDefault` is `"on"`.
4. Otherwise no sandbox: the `windows` reason and the D44 path.

The MXC setting is `on`, `off` or not set. Not set follows one constant,
`mxcDefault`, which is `"opt-in"` today. Turning MXC on by default is the
one-line change of that constant to `"on"` (HAL-3310). It waits on the real-PC
check on HAL-2546, the security review (HAL-3307) and the Settings switch
being on `main` (HAL-3309).

**What Studio and the CLI get.** The choice reports codes, never sentences.
Words come only from the board-approved design (HAL-3290), as with the port's
reason codes. The MXC state is one of this closed list:

- `not-offered`: see above. Nothing is shown.
- `off`: the setting is `off`, or not set while `mxcDefault` is `"opt-in"`.
- `in-use`: MXC passed the trust check and is the sandbox in use.
- `not-used`: MXC would run, but srt came first (only once srt runs on Windows).
- `mxc-check-failed`, with exactly one reason code from the table above.

A new state or reason code is a change to `core/app` through a task that
names it, and it needs words in the design before Studio shows it.

## Consequences

- Windows 11 people can run agents in a fence without WSL 2. Windows 10 and
  Server see no change.
- The Settings wording can promise "can't connect to the internet" and "can't
  read files you keep from them", and that other local programs can't be
  reached, because the check tests each of these at every start. It can't
  promise "the network is off": name lookups get out.
- The harness bridge gains a proxy-form check, and refuses `CONNECT` and
  other hosts, on every backend.
- These keep the decision true:
  - The `sandbox-mxc` adapter runs `sandboxCheckContract` and the fence-proof
    contract on a `windows-11-arm` fence job (HAL-3305).
  - A contract test fails if the adapter passes `captureDenials`, adds an
    egress rule, or opens with a non-empty `allowedSites`.
  - Unit tests for the choice cover the order above with fake backends, and
    a type test fails on an unlisted state or reason (HAL-3306).
  - Bridge tests cover proxy-form requests: its own address is accepted;
    `CONNECT`, other hosts and a missing or wrong run token are refused.
  - The trust-check probes reuse HAL-3365's method (`spikes/mxc/probe5.mjs`):
    match the exact unique name in the host's DNS cache, and pass
    `--noproxy *` to curl so it doesn't hand the name to the bridge.
  - Julian's security review and attack cases on Windows 11 (HAL-3307).
- Later hardening: the MXC guide calls a proxy without a peer identity the
  weaker option. A packaged or AppContainer bridge with `allowedProxyPeer` and
  host loopback denied is stronger. It wouldn't fix name lookups, because it
  needs the same permission.
