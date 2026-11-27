# engine.request-action

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers, the board's decision on HAL-10, 24 Nov: agents may only request an action, never run it); the architecture note on HAL-17491 (1.1, 4.1, 6.5) with Julian's finding on 6.5; ADR `docs/adr/2026-11-24-action-sender.md`; task HAL-17529, with Liam's decision on HAL-20237 that filing uses the same requester policy as Studio

When the host gives the engine the action catalog, a reader of the user's requester policy and the source it attests for its runs, the engine shall give every run's agent a `request_action` tool that takes a definition id, its major version, parameters, a reason and optional expected state. The tool shall check the request with the same validator Studio runs, against the catalog, and then with `decideRequester` against the policy read from the user's profile, with the host's source as the attested source and the agent's id as the claimed agent. The source's kind shall always be `halonic`, and its id shall come from the host, never from a hub's folder name or anything else in the workspace, because every clone of a workspace has the same folder names. It shall take nothing from the workspace or from the call's other arguments for that decision. So by default an agent may file `routine` requests only, and `admin` and `irreversible` requests need a rule in the profile.

When a request passes, the tool shall write `action.requested` to the run log, with a new request id, the agent and run as its requester, and an expiry 24 hours after filing, after `checkActionEvent` takes it, and shall answer with the request's id. When it doesn't pass, the tool shall fail with every reason, naming the path of a parameter that is wrong or unknown, and shall write nothing.

The tool's dependencies shall hold no `ActionSender` and no `ActionRecords`, and no engine source file shall import either.

## Examples

- Given the default policy,
  when an agent files `acme.restart-app@1` (`routine`) with `app: "web"`,
  then the run log gets one `action.requested` with requester `{ kind: "agent", agent: "ops", run: "run-7" }` and the agent hears the request's id.
- Given parameters `{ app: "web", region: "eu" }` for a definition that has only `app`,
  when the agent files it,
  then the call fails naming `region`, and nothing is written.
- Given the default policy,
  when an agent files an `admin` definition,
  then the call fails with "don't let this agent request `admin` actions".
- Given a profile that allows only the `globex` host,
  when an agent of the `acme` host files an `irreversible` definition with `requester: { kind: "user" }` and its own `policy` in the call,
  then the call fails, and nothing is written.
- Given a profile that allows agent `ops` of the `acme` host,
  when `ops` files an `irreversible` definition,
  then the request is filed.
- Given a profile that allows the source `{ kind: "halonic", id: "default" }`,
  when an agent of the hub in `hubs/default/` files an `irreversible` definition,
  then the call fails, and nothing is written.
