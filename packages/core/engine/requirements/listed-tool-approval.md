# engine.listed-tool-approval

- Status: active
- Since: 0.1.0
- Source: HAL-850 section 3 (signed off on 2026-11-09), HAL-2212 step 4, and Liam's answers on HAL-2212 (the approval is required, so every caller chooses; `call-tool` effects go through the same step)

When the engine builds the tools of a model turn, for a chat turn, a run's model call, a subagent's turn and a `call-tool` effect alike, it shall, for each connector that lists its tools, read the listing (`readToolListing`), check it against the approvals a person gave (`approveListedTools`), and pass only the approved tools on to the fence (`ports.untrusted-tool-listings`). It shall do this at the start of every turn, so an approval revoked since the last turn, and a tool whose name, description or parameters changed, take effect on the next turn, and a changed tool's old version is not offered either. Every other listed tool waits: the engine shall leave it out and return it in `waiting` (`ports.chat-turn-waiting`), apart from the refusals, with its name cut to 64 characters and escaped. The engine shall never put a waiting tool, its name or its text in anything the model gets. A call, or a `call-tool` effect, that names a waiting tool shall be refused like a call to a tool nobody offered. When a connector's approvals can't be read, or its server has no address to approve at, none of its listed tools shall be offered and the listing shall be refused.

The tools of a connector Halonic reviewed (an integration's, a plugin's or the built-in Google connector's) aren't listed tools and shall pass as they are. The caller shall have to choose how listed tools are approved: a caller with no approval store passes `noListedToolApproval`, which puts every listed tool on waiting. When a turn leaves tools waiting, the engine shall tell the host, so the host can say which command approves them where nobody can answer, such as `serve`, CI or a scheduled run.

## Examples

- Given a connector `notes` that lists `lookup` and `search`, and an approval for `lookup` only,
  when a chat turn is built,
  then the model is offered `lookup`, and the turn's `waiting` holds `search` of `notes`, apart from its refusals.
- Given the same connector with no approvals,
  when a model turn is built,
  then the model is offered none of its tools, and the request to the model holds neither tool's name.
- Given `lookup` approved, and its description changed by the server before the next turn,
  when that turn is built,
  then `lookup` is not offered, in either version, and it is in `waiting`.
- Given `lookup` approved, and the approval revoked between two turns,
  when the second turn is built,
  then `lookup` is not offered.
- Given a `call-tool` effect that names `search`, which waits,
  when the engine makes it,
  then the call isn't made, and the outcome is `error`.
- Given a caller that passes `noListedToolApproval`,
  when its connector lists tools,
  then every listed tool waits.
- Given a connector Halonic reviewed,
  when a turn is built with no approvals at all,
  then its tools are offered as before.
