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

This is the first of three pull requests (HAL-3305). It says where MXC is offered and whether
it can start, and it holds the grant-path and box-folder rules. Sessions come in the next pull
request, so `open()` refuses for now. The adapter doesn't depend on MXC's SDK
(`@microsoft/mxc-sdk`) yet: until it does, `systemMachine()` reports the SDK as missing, so
`check()` says `other` on Windows 11.

## Where MXC is offered

`offered()` is true only on Windows 11 client editions (Home, Pro, Enterprise, build 22000 or
later) where the SDK reports the BaseContainer tier with the loopback proxy. On Windows 10,
Windows Server, the DACL tier and every other system it is false, and `check()` says
`windows`, as on plain Windows today. When the SDK can't be loaded on Windows 11, MXC still
counts as offered, and `check()` says `other`, so a broken install shows up instead of
being hidden.

## Grant rules

These follow Mateo's grant rules from HAL-3503:

- **Folders only.** A read-only path that is a single file is refused with a sentence that
  names it. The adapter never grants the file's folder instead, because the program could then
  read everything next to the file. Denied paths may name single files.
- **One path form.** Every path MXC gets is a plain absolute Windows path: a drive letter in
  capitals, backslashes, no trailing backslash (`grantPath`).
- **Never the drive root.** `grantPath` refuses `C:\`.
- **A fresh box folder for every session.** `BoxFolders` makes each one under `mxc-boxes` in
  Halonic's data folder and removes it when the session closes. The first box of a process
  removes the folders that crashed processes left behind. The base folder is one constant,
  `boxFoldersBase`.

## Example

```ts
import { MxcSandbox, systemMachine } from "@halonicjs/adapter-sandbox-mxc";

const mxc = new MxcSandbox(systemMachine());
if (await mxc.offered()) {
  const check = await mxc.check(); // { ok: false, reason: "other", missing: ["MXC's SDK can't be loaded or asked: …"] }
}
```
