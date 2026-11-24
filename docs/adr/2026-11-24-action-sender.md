# Only the user runs action steppers, through an `ActionSender` bound to reviewed steps

- **Status:** Proposed
- **Date:** 2026-11-24

## Context

Some things an agent needs can only be done with a person's own rights on a
service: approving a deployment to a protected environment, approving a
workflow run, changing a ruleset, purging a zone's cache. The board decided
(HAL-17488, on HAL-10, 24 Nov) that these are **user-only actions**: never an
agent tool, and never "the agent runs it after approval". An agent may only
file a request. The user reviews it in Studio and runs it step by step, with
their own sign-in to the service. Any Halonic user gets the same mechanism.

The architecture note on HAL-17491 compared where the call is made. Option B,
the Studio page with the token from `token_get` as plugin secrets work today,
puts an admin token in the webview's memory. Option A, the desktop shell
making the call with the token from the OS keychain, keeps the token out of
the page. The security review added that keeping the token's *value* out of
the page isn't enough: a shell that sends any request to the service's
origin still lends the token's *power* to any script in the page. The calls
have to be bound to steps someone reviewed.

## Decision

**A stepper is reviewed code; a request is data.** Each stepper is a
versioned definition in a core action catalog (later pull requests): its
service, its parameters as a strict schema, its steps (each a method, a path
template on the service's fixed origin, a body built by the definition's
code and the answer fields to keep) and a plain-language preview. A request
names a definition and version and fills its parameters. It can't carry a
step, a method, an address, a header or a body. Agents never write
definitions.

**`ActionSender`** (`ports.action-sender`) is the port that sends one step.
It has four calls: `account` (who is signed in to a service, by name),
`signIn`, `signOut` and `send`. A send names a step by definition, version
and step number, with one value per placeholder and an optional body. The
sender takes the method, the path, the body's top-level fields and the
fields to keep from its own
allow-list of catalog steps, which is generated from the catalog at build
time. It refuses anything not on the list (`not-in-catalog`), any value that
could change the route (`bad-value`: missing, extra, empty, `.`, `..`, or
holding `/`, `\`, `?` or `#`) or a body with a field not on the step's list
(also `bad-value`), and a step whose service has no sign-in
(`signed-out`), all before anything leaves the computer. It fills each
placeholder with one percent-encoded segment, sends to the service's fixed
origin, follows no redirect, and hands back the status, only the kept
fields that hold plain values, and for a failed status the service's error
message cut to 500 characters. No call takes or gives a token.

**Only the user's client has a sender.** In the first version that is the
Studio desktop shell: its `action_*` commands hold the token in the OS
keychain and the generated allow-list in Rust, and an adapter wraps them as
an `ActionSender` for `studio/services`. The engine, the agent host,
`adapters/harness-bridge`, integrations and agents never get an
`ActionSender` in their dependencies: an agent's only way in is the
engine's call that files a request. A later pull request adds a check that
pins this. Browser Studio, the CLI and the Messenger can show and decline a
request, and say "Open it in the desktop app to run it".

**Sign-in starts only from the user's click** in the stepper, never from a
request. For GitHub it is a Halonic GitHub App's device flow, with "expire
user tokens" kept on and no refresh; for Cloudflare, an API token the user
pastes and the shell verifies.

**Events** (`events.action-events`) are `action.requested`,
`action.reviewed`, `action.signed-in`, `action.step.started`,
`action.step.succeeded`, `action.step.failed`, `action.step.skipped` and
`action.finished`. Each kind has a strict allow-list of fields
(`checkActionEvent` in `core/events`): parameters and kept fields are flat
records of plain values, a requester carries only its kind's fields, and the
service's error text is capped and shown as untrusted. Writers check an
event before writing it, and readers check every line they read. So no
event can hold a token, a header, a value typed into an `input` step or a
whole answer body. They are a separate union, not run events, so the run
timeline and summaries don't change. `action.requested` joins the run log
when the engine's filing lands. The other events go into the request's
record in the app data folder, outside every workspace and readable only by
the user, since they name private repositories and accounts. The requesting
agent reads the folded result back through the engine, by request id.

**Provider endpoints in a core package.** The catalog is data and pure code
with no SDK, and Studio's features can't import adapters, so service
addresses in a core package are fine here.

## Threat model

| Threat | Mitigation |
| --- | --- |
| An agent runs a step itself | Nothing on the agent side has an `ActionSender`. An agent can only file a request, which is data |
| A request smuggles a different call | A request carries no method, address, header or body. Parameters pass the definition's strict schema in the user's client, and each value fills one path segment or is refused |
| Script injected into the page sends any call with the user's admin token | The sender sends only steps on its build-time allow-list, with the method and path from the list, and hands back only kept fields. The token never reaches the page |
| A value turns one route into another (`app/../../user`) | Each value must be one segment: `/`, `\`, `?`, `#`, `.`, `..` and empty values are refused, and the rest is percent-encoded |
| A redirect sends the token elsewhere | The sender follows no redirect, to any host |
| A token, header, typed secret or answer body lands in a log | Every event kind has a field allow-list, checked on write and on read, with a test that fails on any extra field |
| An answer echoes submitted values or holds a credential | Only the definition's kept fields that hold plain values come back. Error text is capped and shown quoted |
| A request starts a sign-in the user didn't mean | Sign-in starts only from the user's click in the stepper |

Accepted for the first version: the page still builds a step's body from the
definition's code, so injected script could send a different body to a
reviewed route. The sender refuses any top-level field not on the step's
list, and the preview shows the exact call. A later version can have the
shell build the body itself.

## Consequences

- The stepper, the catalog and the screen can be built now against
  `FakeActionSender` and the `contracts.action-sender` suite. The shell's
  sender must pass the same suite.
- Order of the pull requests: this port with its fake and suite; then the
  pure stepper and the catalog in core; then the shell's `action_*`
  commands (a security pull request, with a Rust test that an off-list path
  is refused); then the Studio feature.
- A new or changed definition widens what a user can be asked to run, so it
  is reviewed as a security change. Adding a service needs a security
  review too.
- Requests reach the Inbox as an item kind of `AgentMessaging`, in a later
  version of that port, not through a second path.
