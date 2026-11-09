# engine.turn-tool-names

- Status: active
- Since: 0.1.0
- Source: HAL-1061, rules agreed on HAL-1516

When two tools offered in one model turn have the same name, the engine shall keep the first one in the order caller tools, Halonic tools, server tools, and refuse the later one with a reason that names both sources. It shall never let a later tool replace an earlier one.

## Examples

- Given a caller tool `search` and a server `mail` that lists `search`,
  when the turn runs and the model calls `search`,
  then the call goes back to the caller, the server's tool isn't offered, and a refusal for it names `mail` and `caller`.
