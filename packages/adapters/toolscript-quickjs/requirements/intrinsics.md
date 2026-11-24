# toolscript-quickjs.intrinsics

- Status: active
- Since: unreleased
- Source: ADR "Halonic ToolScript" (`docs/adr/2026-11-24-toolscript.md`, section 2.1), with the security conditions on HAL-17650; task HAL-17569

The QuickJS adapter shall create each context with its pinned intrinsics, `Eval` on and `Proxy`, typed arrays and bignum off, so a script finds no `Proxy`, `ArrayBuffer`, typed array or `BigInt`, and both QuickJS packages shall be pinned to exactly 0.32.0.

## Examples

- Given any script,
  when it reads `typeof Proxy` and `typeof Uint8Array`,
  then both are `"undefined"`.
