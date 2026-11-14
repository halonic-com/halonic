# @halonicjs/adapter-sandbox-mxc

The `Sandbox` port on MXC, the process container in Windows 11. It is a second sandbox
backend next to `sandbox-srt`, and Halonic uses it only after a trust check passes. The
design is in [the ADR](../../../docs/adr/2026-11-10-mxc-sandbox-backend.md), and the plan
is on HAL-3292.

- **Layer:** adapters
- **Owner:** ravi
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-sandbox-mxc`

## Status

The adapter is on `main`: where MXC is offered, the grant rules, sessions, the fence proof,
the trust check's canary, the read-only copies, the network probes and the SDK download. Nothing
in Studio or the CLI turns it on yet: the Settings switch waits for the approved design
(HAL-3290), and MXC stays opt-in until the check on a real PC has passed (HAL-2546). No release
ships MXC before then.

## Loading MXC's SDK

The SDK (`@microsoft/mxc-sdk`) is not a dependency. It is downloaded once, on Windows only,
when the host calls `download()`, which it does only when the person picks MXC. The download
comes from `registry.npmjs.org` over https, each package pinned to an exact version and hash
(`sdk-pins.ts`), and is checked before a byte is unpacked. `mxcSdkLoader` loads the SDK from that
folder the first time `offered()` or `check()` needs it, never at module top level, and
`systemMachine()` keeps the answer for the rest of the process. Without the download, or on
any other system, MXC doesn't start: `check()` says `other` on Windows 11, and a download is
needed. The adapter reads only the SDK's platform support, backends and `spawn`. Every `spawn`
call passes `telemetry: { enabled: false }`, and the adapter never asks for telemetry consent.

## Where MXC is offered

`offered()` is true only on Windows 11 client editions (Home, Pro, Enterprise, build 22000 or
later) where the SDK reports the BaseContainer tier with the loopback proxy. On Windows 10,
Windows Server, the DACL tier and every other system it is false, and `check()` says
`windows`, as on plain Windows today. When the SDK can't be loaded on Windows 11, MXC still
counts as offered, and `check()` says `other`, so a broken install shows up instead of
being hidden.

## Grant rules

These follow Mateo's grant rules from HAL-3503:

- **Folders only.** MXC grants folders, so a read-only path that is a single file is copied into
  the session's own box folder (one folder per file) and only that folder is granted to read. The
  copy is a snapshot made when the session opens, and the program reads the copy: `start` puts the copy
  in place of the original in the command (as the program, an argument or an option's value), and
  the session's `readOnlyCopies` lists each original and its copy. A file inside a denied path is refused. The
  adapter never grants the file's folder instead, because the program could then read everything
  next to the file. Denied paths may name single files.
- **One path form.** Every path MXC gets is a plain absolute Windows path: a drive letter in
  capitals, backslashes, no trailing backslash (`grantPath`).
- **Never the drive root.** `grantPath` refuses `C:\`.
- **A fresh box folder for every session.** `BoxFolders` makes each one under `mxc-boxes` in
  Halonic's data folder and removes it when the session closes. The first box of a process
  removes the folders that crashed processes left behind. The base folder is one constant,
  `boxFoldersBase`.

## Sessions

`open(profile)` turns the profile into one policy and starts every program under it:

- **Files.** The working, temp and settings folders are read and write (the temp and settings
  folders are made when missing), `readOnlyPaths` are read, and `deniedPaths` win over both.
  `TEMP` and `TMP` point at the temp folder.
- **Network.** `egress: deny` with no rule, and the bridge as MXC's proxy
  (`networkProxy: http://127.0.0.1:<bridge port>`, host loopback allowed), so the bridge is the
  one local port the box reaches. Without a bridge, no loopback at all. A non-empty
  `allowedSites` makes `open` throw, and so does a bridge host other than `127.0.0.1`.
- **Environment.** Only the profile's variables, plus `TEMP`, `TMP` and `NODE_OPTIONS` with the two
  symlink flags (`--preserve-symlinks --preserve-symlinks-main`). A program that is Node itself
  also gets the flags as arguments.
- **UI.** On, with no clipboard and no input injection: without it Node and git don't start.
- **Command line.** MXC takes one string, so the program and arguments are quoted the way
  Windows reads them back. A batch file (`.cmd`, `.bat`) is refused: `cmd.exe` reads its
  arguments by rules no quoting makes safe.

**Box folder.** Every session gets a new folder under `mxc-boxes`, removed when it closes. It
holds the files of the fence proof and nothing the program may read.

**Fence proof.** Before anything runs, a Node probe starts in the box under the session's own
policy. It must be refused a file no grant names, a denied file inside a folder it may read and
a port of a listener on this computer's loopback addresses and a connection to its other addresses (no listener there), the internet and a
public DNS server asked directly, and it must read a file in a folder it may read
(without that control "hidden" proves nothing). A network probe counts as blocked only when the system refused it, or when it timed out and the
box did connect to its bridge (the network control): any other failure, such as Winsock not
starting without `SystemRoot`, proves nothing. Anything else, including a probe that can't run
or a box folder inside a denied path, makes the fence `not-fenced`, and `start` throws.

**Trust check.** `MxcCanary` builds the canary profile and probe for `core/app`'s trust check.
Its box is built exactly like a real session's, with a fresh box folder under Halonic's data
folder, never `%TEMP%`. The probe re-runs the leak probes, reports a file written where
nothing may be written, and adds the third control: Node loads a script from the working
folder, lists the folder and writes a file in it. A failed control is `too-strict`.

**`onBlocked`.** MXC's denial capture crashed the host process (HAL-3303), so the adapter never
uses it. It reports what the program's own error output shows: Node's `EACCES`/`EPERM` errors
that name a path (`open` and calls that only look count as reads) and refused connections with
their address and port. Messages without a path or address, such as cmd.exe's "Access is
denied.", are not reported, so a program that doesn't print its errors reports nothing.

**Not covered yet.** `reopenedPaths` makes `open` throw: MXC's denied paths win over every
grant, so a path inside one can't be reopened. The refusal of files under a skill's `scripts/`
folder, which `sandbox-srt` applies, isn't ported. The probes cover the router and other
private addresses, but not the bridge itself (`CONNECT`, or a request for another host or port
through it): the bridge is the box's only network control, and nothing probes it yet.

## Known limits

These are the limits in [the ADR](../../../docs/adr/2026-11-10-mxc-sandbox-backend.md). The
first is a leak the box can't stop; the trust check reports it rather than catching it.

- **Name lookups leave the box.** They go through Windows' DNS client service, which runs
  outside the box. A program can't open a connection, but it can encode data in the names it
  looks up, slowly. The canary reports `nameLookupsLeave: true`. Showing it in `halonic doctor`
  is Planned with the host wiring (HAL-3309); doctor doesn't know about MXC today.
- **pnpm and other tools that look up the drive root don't work.** They walk up to `C:\`, which
  the box can't read (`EPERM lstat 'C:'`). Halonic doesn't run them outside the box instead,
  because that would run package scripts without the fence, and it doesn't make the drive root
  readable, because that would show every file name on the drive. Node scripts and git work.
  The limit stays until srt's Windows mode or a later sandbox gives Windows a stronger option.
- **`cmd /c dir` is refused, even on the box's own folder.** Tools that list folders through
  Node (`readdirSync`) work, and so does reading and writing files. A script or `.cmd` shim that
  shells out to `dir` fails. This is a limit, not a leak.
- **The permission that lets the box reach the bridge works both ways.** In CI the box couldn't
  reach the internet and the host couldn't connect in, but CI has no local network. The probes
  cover the router and another local address, and the real-PC check (HAL-2546) tests both
  directions. Until it has passed, MXC ships in no release.

## Example

```ts
import { BoxFolders, MxcSandbox, systemMachine } from "@halonicjs/adapter-sandbox-mxc";

const mxc = new MxcSandbox(systemMachine(), new BoxFolders(dataFolder, process.pid));
if (await mxc.offered()) {
  const check = await mxc.check(); // { ok: false, reason: "other", missing: ["MXC's SDK can't be loaded or asked: …"] }
}
```
