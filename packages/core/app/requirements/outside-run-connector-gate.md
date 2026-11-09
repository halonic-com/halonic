# app.outside-run-connector-gate

- Status: active
- Since: 0.1.0
- Source: HAL-9 plan v1.7 (connector calls from outside a run, found in the HAL-64 reviews), HAL-186 step 7(b) (HAL-1531). This is the check in `core/app`; the host enforces it in phase 4 as `server.outside-run-connector-gate`.

When a connector tool is called from outside a run, the app shall apply the connector's `allow` and `approve` lists, its "allow sending" setting and `checkToolCall`, and shall answer only "run" or "refused" with a reason. It shall refuse a tool the `allow` list leaves out and every call that would need a person's approval: a tool under `approve`, every tool labelled `send` and every other tool whose risk isn't `read`, as well as any call `checkToolCall` refuses. For a `send` tool while sending is off for the connector, the reason shall say that sending is off, before any other reason about approval. The gate shall get only the read side of the connection settings, so it can't change them.

Rationale: outside a run nobody can approve a call, so letting such a call run would make chat a way around the check every run applies. This is stricter than old Studio, whose chat let `write` tools run when they weren't under `approve`; that gap is accepted on purpose (decided on HAL-1616). It can be closed later by an approval shown inline in chat, which loosens the gate without breaking anything.

## Examples

- Given a tool with risk `read` that both lists allow,
  when it is called with arguments its parameters declare,
  then it runs.
- Given an `allow` list without `search`,
  when `search` is called,
  then it is refused because it isn't in the allow list.
- Given `approve: [archive]`,
  when `archive` is called, even with risk `read`,
  then it is refused because it needs a person's approval.
- Given a `send` tool and no settings for the connector,
  when it is called,
  then it is refused with `sending is off for the connector "mail"`, not with the reason about approval.
- Given a `send` tool and sending switched on,
  when it is called,
  then it is still refused, because a `send` tool needs approval, which only a run can give.
- Given a `write` tool that isn't under `approve`,
  when it is called,
  then it is refused, because `checkToolCall` would ask a person first.
- Given a `read` tool,
  when it is called with an argument its parameters don't name,
  then it is refused with `checkToolCall`'s reason.
- Given a listed tool offered as `notes__lookup` and `allow: [lookup]`,
  when it is called,
  then the lists are matched against `lookup`, the name its server lists it under.
- Given the gate's parameters,
  when their types are read,
  then the settings it gets have only `checkSending`, and no way to switch sending on.
