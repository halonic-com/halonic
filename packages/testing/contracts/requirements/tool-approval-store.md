# contracts.tool-approval-store

- Status: draft
- Since: 0.1.0
- Source: HAL-2210 step 3; `ToolApprovalStore` port v1 (`ports.listed-tool-approval`); store rows H5, H6 and D8 of the HAL-2579 test cases. It becomes active with `ports.listed-tool-approval`.

Where an adapter implements `ToolApprovalStore`, it shall give back every field of an approval, for every kind of server address, `null` for a key it has no approval for, and an empty list for a source it holds none for. Approving a key again shall replace its approval, and revoking shall delete it; revoking a key without an approval shall not be an error. It shall keep the key's three parts apart, so no joined spelling of one key reads another, and shall know no tool named like an object's own properties, such as `constructor` or `__proto__`, until one is approved under that name. It shall compare keys exactly as given (no case folding and no Unicode normalisation) and list one source in one workspace sorted by name in UTF-16 code-unit order. It shall keep what was approved, whatever the caller later does with the objects it passed in or got back. When a stored approval can't be read, `get` for that key and `list` for its source shall reject with an `UnreadableToolApprovalError` naming the workspace and source as fields, `get`'s naming the tool too, while other tools and sources still read; `revoke` shall delete it, and approving the key again shall replace it. It shall note waiting versions as `ports.listed-tool-approval-waiting` sets out, keyed like approvals, and forget a tool's waiting versions when it is approved or revoked.

## Examples

- Given an approval for `lookup` at fingerprint 1,
  when `lookup` is approved at fingerprint 2,
  then `get` gives the second approval and `list` holds one.
- Given approvals for `beta`, `Zeta` and `alpha` of `notes`, and one for `send` of `mail`,
  when `notes` is listed,
  then the order is `Zeta`, `alpha`, `beta`, and `send` is not in it.
- Given an approval for the tool `b/c` of the source `a`,
  when the source `a/b` is listed,
  then it is empty.
- Given an approval for `lookup` only,
  when `get` asks for `constructor` or `__proto__`,
  then it gives `null`.
- Given an approval for `café` with `é` as one code point,
  when `café` with `e` and a combining accent is read,
  then it gives `null`.
- Given approvals for `lookup` and `search`, and `lookup` can't be read,
  when `get` for `lookup` and `list` for the source are called,
  then both reject, `get` naming `lookup`, and `search` still reads.
- Given an approval that can't be read,
  when it is revoked,
  then `get` gives `null`.
- Given waiting versions noted for `lookup`,
  when `lookup` is approved and a new version is noted,
  then only the new version is returned.
