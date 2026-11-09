# ports.listed-tool-approval

- Status: draft
- Since: 0.1.0
- Source: HAL-520, from the HAL-517 decision on the MCP tools review (HAL-504): a server can change a listed tool's description after the workspace connects it, and `ports.untrusted-tool-listings` fences that text but doesn't stop it. Plan reviewed on HAL-520. It becomes active when `listedToolHash` and `gateToolListing` in `@halonicjs/app` prove the examples, and the user has signed off the approval screen in Studio.

The host shall offer the model a listed tool (as `ports.untrusted-tool-listings` defines it) only after a person has approved it, and again only after a person has approved it once more whenever its server, description or parameters change. Declared tools need no approval, because Halonic reviewed them.

- **What is approved.** An approval covers one listed tool of one source in one workspace, keyed by the workspace's location, the source's id and the listed name. It holds the hash of the _approved material_: the tool's server, and its listed name, description and parameters exactly as the source sent them, before the host removes invisible characters or rebuilds the parameters. So any change a reader can't see asks again too.

- **Which server.** The server is part of the material, so an edit that points the same source id at another server asks again. For an `http` connector it is the URL, parsed as a WHATWG URL and written back, without user name, password or fragment. For a `stdio` connector it is the command, its arguments and the pin, or `null` without one. For an integration it is its name, its version and the settings the workspace gives it. Headers and the environment are left out, because they hold secrets.

- **How it is hashed.** The hash is `htl1:` followed by the lowercase hex SHA-256 of the UTF-8 bytes of the material written as canonical JSON. The core computes SHA-256 through the `Digest` port. Canonical JSON follows RFC 8785 (JCS), written by hand without a library: object keys sorted by their UTF-16 code units, no white space, numbers written as ECMAScript writes them (so `1.0` is `1` and `-0` is `0`), and strings escaped with `\"`, `\\`, `\b`, `\f`, `\n`, `\r`, `\t` and `\u00xx` in lowercase hex for the other characters below U+0020, with every other character written as it is. It refuses any value that isn't plain JSON, so it can never hash the same as something else: `undefined`, `NaN`, `Infinity`, `-Infinity`, functions, symbols, big integers, arrays with holes, objects that aren't plain, values that contain themselves, and strings with an unpaired surrogate. A tool whose material it refuses is refused, with a refusal like the ones `ports.untrusted-tool-listings` returns.

- **Where approvals live.** The `ToolApprovalStore` port keeps approvals in the user's profile, never in a workspace, so a workspace can't arrive with its tools already approved. It only stores: the host computes the hash and decides. Only a person writes approvals; no tool the model can call reaches the store. An approval that can't be read makes the store throw with its key, the host offers none of that source's listed tools and says why, and `revoke` still deletes it.

- **How a listing is gated.** After the host has read a listing as `ports.untrusted-tool-listings` asks, it gates the listed tools it would offer against the source's approvals. The gate is pure: it reads approvals and returns three lists, and never writes the store.
  - _offered_: listed tools whose hash equals their approval's hash. Only these, and declared tools, reach the model.
  - _pending_: listed tools with no approval, or whose hash differs from their approval's. Each holds the material now listed and, when there was an approval, the material approved before, so Studio can show what changed. A pending tool never reaches the model, and a call to it is refused like a call to any tool not offered in the turn.
  - _removed_: approvals whose listed name the listing no longer returns.

  A tool the host refused while reading the listing, for example for a bad name, its size or its depth, is in none of the three lists, so the approval screen never shows a tool the model couldn't be offered.

- **What the host does with the lists.** The host revokes the approvals in _removed_ when it next writes the store for that source, and revokes the approval of a pending tool the person rejects, so the same name coming back is asked about again. When the person approves a pending tool, the host stores the hash and the material it showed.

- **What the person sees.** The approval screen shows each pending tool's listed and final name, its description and its parameters as the source sent them, with every character the host would remove shown as a visible escape, so hidden text can't be approved unseen. For a changed tool it shows what changed, including a changed server.

Approving a tool fixes what the model reads, not what the server does when called. Its results stay fenced and its risk stays `write` unless the workspace lowers it, as `ports.untrusted-tool-listings` asks.

## Examples

- Given a source `notes` with no approvals whose listing returns `lookup` and `search`, and an integration that declares `send`,
  when the listing is gated,
  then `lookup` and `search` are pending with no earlier material, only `send` is offered to the model, and the store is unchanged.
- Given an approval for `lookup` whose hash equals the hash of the listed `lookup`,
  when the listing is gated,
  then `notes__lookup` is offered.
- Given an approval for `lookup`, and a listing whose `lookup` description has gained one zero-width space,
  when the listing is gated and the model calls `notes__lookup`,
  then `lookup` is pending with the approved and the new description, it isn't offered, and the call is refused.
- Given approvals for `lookup` and `search`, and a listing that returns `lookup` and `archive`,
  when the listing is gated,
  then `lookup` is offered, `archive` is pending, `search` is removed, and the store still holds the approval for `search` until the host revokes it.
- Given an approval for `search` that the host revoked because `search` was removed,
  when a later listing returns `search` with the same description and parameters,
  then `search` is pending.
- Given an approval for `lookup` of the `http` source `notes` at `https://notes.example.com/mcp`, and a workspace edit that points `notes` at `https://other.example.com/mcp`,
  when the unchanged listing is gated,
  then `lookup` is pending, and its earlier material shows the old URL.
- Given an approval for a tool of a `stdio` source pinned to `@acme/notes-mcp` version `2.3.1`, and a new pin at version `2.4.0`,
  when the unchanged listing is gated,
  then the tool is pending.
- Given two `http` URLs that differ only in the case of the host name, a default port or a fragment,
  when the hash is computed for the same tool at each,
  then the two hashes are equal.
- Given a listed tool named `look up`, or whose `parameters` nest 65 levels deep,
  when the listing is read and gated,
  then the host returns a refusal for it and it is not pending.
- Given a workspace file that holds approvals for its own tools,
  when the listing is gated,
  then the host ignores the file and every listed tool is pending.
- Given an approval in the store that can't be read,
  when the listing of its source is gated,
  then none of that source's listed tools is offered, the user is told which approval, and `revoke` deletes it.
- Given the material `{"b": 1, "a": 1.0}` and the material `{"a": 1, "b": 1}`,
  when each is written as canonical JSON,
  then both are `{"a":1,"b":1}`.
- Given the numbers `-0` and `1e21`,
  when each is written as canonical JSON,
  then they are `0` and `1e+21`.
- Given an object with the keys `z`, `é`, `😀` and `ｚ`,
  when it is written as canonical JSON,
  then the keys come in the order `z`, `é`, `😀`, `ｚ`, because `😀` starts with the UTF-16 code unit D83D, which comes before FF5A.
- Given nested arrays `[[2, 1], [{"b": true, "a": null}]]`,
  when they are written as canonical JSON,
  then the result is `[[2,1],[{"a":null,"b":true}]]`: array order is kept and object keys are sorted at every depth.
- Given a string holding a tab, U+001F and `é`,
  when it is written as canonical JSON,
  then it is `"\t\u001fé"`.
- Given a value that holds `undefined`, `NaN`, `Infinity`, a `Date` or a string with an unpaired surrogate,
  when it is written as canonical JSON,
  then it is refused, and a listed tool with such material is refused, not pending.
- Given a listed tool's material,
  when its hash is computed,
  then it is `htl1:` followed by 64 lowercase hex digits, and the same material always gives the same hash.
