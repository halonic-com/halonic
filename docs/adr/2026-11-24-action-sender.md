# Only the user runs action steppers, through an `ActionSender` bound to reviewed steps

- **Status:** Proposed
- **Date:** 2026-11-24

## Context

Some things an agent needs can only be done with a person's own rights on a
service: approving a deployment to a protected environment, approving a
workflow run, changing a ruleset, setting a secret. The board decided
(HAL-17488, on HAL-10, 24 Nov) that these are **user-only actions**: never an
agent tool, and never "the agent runs it after approval". An agent may only
file a request. The user reviews it in Studio and runs it step by step, with
their own sign-in to the service. Any Halonic user gets the same mechanism.

The architecture note on HAL-17491 (revision 12, with Liam's and Julian's
OK) compared where the call is made. Making it in the Studio page, with the
token from `token_get` as plugin secrets work today, puts an admin token in
the webview's memory. Making it in the desktop shell, with the token in the
OS keychain, keeps the token out of the page. The security review added
that keeping the token's *value* out of the page isn't enough: a shell that
sends any request to the service's origin still lends the token's *power*
to any script in the page. So every call is bound to a step someone
reviewed.

## Decision

**A stepper is reviewed code; a request is data.** Each stepper is a
versioned definition in `core/action-catalog`: its service, its parameters
as a strict schema, its steps (a call with a method, a path template, body
fields and the answer fields to keep; a read-only check; a guided page; a
user input) and a plain-language preview. A request names a definition and
version and fills its parameters. It can't carry a step, a method, an
address, a header or a body. Agents never write definitions. A new or
changed definition widens what a user can be asked to run, so it is reviewed
as a security change.

**A generated route list.** `pnpm discover` writes the route list from the
catalog: for each definition, version and step, the service, the risk
(`routine`, `admin`, `irreversible`), each placeholder's pattern, and either
the method, path, body fields and kept fields of a call, or the web address
of a guided page. GitHub GraphQL query text is a `constant` body field of its
route, so the shell sends its own copy, never the page's. The list is
compiled into the shell, and `pnpm check` fails when it is out of date.

**`ActionSender`** (`ports.action-sender`) is the port the stepper runs
steps through: `account`, `signIn`, `signOut`, `send` and `openGuided`. A
call names a step by definition, version and step number, with one value per
placeholder, and for `send` the step's body fields. The sender takes
everything else from its route list. Before anything leaves the computer it
refuses:

- a step that isn't on the list (`not-in-catalog`);
- a placeholder value that is missing, extra, doesn't match its pattern, is
  empty, `.` or `..`, or holds `/`, `\`, `?`, `#` or `%` (`bad-value`);
- a body field that is missing, extra, of the wrong kind or doesn't match
  its pattern, or a `constant` or `secret-input` field the page sent
  (`bad-value`);
- a step whose service has no sign-in (`signed-out`);
- a second open of a guided page without a new click (`too-often`).

It fills each placeholder with one percent-encoded segment, adds the
route's constants, sends to the service's own origin with the user's token,
and follows no redirect. It hands back the status, only the route's kept
fields that hold plain values, and for a failed status the service's error
text, cut to 300 characters with anything that looks like a token dropped.
A new body field kind is a change to the port.

**Native dialogs.** The sender confirms `admin` and `irreversible` steps in
its own native dialog, with the account, the method, the address it built
and the body; for `irreversible` steps the user types the target's name.
Values the route marks `secret-input` are asked for in the same dialog
during the send, so a secret goes from the dialog into the call and never
through the page, the record or a log. Page script can't draw or click a
native dialog. If the user closes it, the result is `cancelled` and nothing
is sent.

**Only the user's client has a sender.** In the first version that is the
Studio desktop shell: its `action_*` commands hold the token in the OS
keychain, and an adapter wraps them as `ActionSender` and `ActionRecords` for
`studio/services`, the only place that imports it. The engine, the agent
host, `adapters/harness-bridge`, integrations and agents never get either
port in their dependencies. A test in the engine's filing PR pins this. An
agent's only way in is the engine's `fileActionRequest`, which the bridge
exposes as `request_action`. Browser Studio, the CLI and the Messenger show
and decline a request and say "Open it in the desktop app to run it".

**Sign-in starts only from the user's click** in the stepper, never from a
request, and runs only while the stepper is open. For GitHub it is a
Halonic GitHub App's device flow, with "expire user tokens" kept on and no
refresh. For Cloudflare, the user pastes an API token and the shell verifies
it. A service without a fixed origin (Paperclip) takes its origin from the
keychain-stored connection record that holds its key, never from the page;
that origin must be `https`, or loopback for a local server.

**Browser blocks** that an agent writes for a request (note section 7) carry
an address, so they get their own command, `action_open_page`, checked
against a generated list of web origins and path prefixes with a deny list
(OAuth, device-code, app-install and token pages; a repository's or
organisation's access, keys, hooks and installations settings). It is added
to `ActionSender` as an optional method in the pull request that builds
those blocks.

**Records** (`ports.action-records`). `ActionRecords` appends an event to a
request's record and reads a request's events. It is append-only: no call
changes or deletes an event. Records live in Studio's app data folder,
outside every workspace, in files only the user can read, since they name
private repositories and accounts. The shell deletes a finished request's
record 90 days after its `action.finished`. "A request runs at most once" is
page logic read from the record, not a shell guarantee; `admin` and
`irreversible` steps still need the native dialog.

**Events** (`events.action-events`). `action.requested` is written by the
engine when a request is filed. It joins `RunEventBody` in the engine's
filing PR, like `effect.requested`. `action.reviewed` (opened, declined or
blocked by the user's policy), `action.signed-in`, `action.step.started`,
`action.step.succeeded`, `action.step.failed`, `action.step.skipped` and
`action.finished` are the record's events, a separate union, so the run
timeline and summaries don't change. Each kind has a strict allow-list of
fields, checked by `checkActionEvent` on write and on read. Parameters and
kept fields are flat records of plain values, a requester carries only its
kind's fields, and error text is capped at 300 characters and shown as
untrusted plain text. So no event can hold a token, a header, a secret value
or a whole answer body. `action.reviewed` carries the definition's source
hash, computed at build time into a generated file, never at run time.

**Requests reach the Inbox through `AgentMessaging`**, in its next version:
an `action` item kind carrying the definition, parameters, `expect` and
expiry, and an `action-result` answer. That change gets its own pull request
after this one, since it changes the Inbox's port and fake. The answer goes
into the agent's context and the run log, so it holds only the outcome per
step and the kept fields, with error text capped and marked untrusted, and
never the account name, which stays in the record. The same kind of
allow-list test pins it. If the requesting run has already ended, the engine
records the answer as a run event carrying the request id, and the agent
sees it on its next run. The Paperclip provider shows an `action-result`
answer on the card as one comment with the folded result.

**Where a request is read.** On Paperclip, a request is read only from the
card's own pinned `stepper-request` document, written by the card's
creator, never from comments. Its wire format, `halonic.stepper-request/1`,
is registered with `core/format` next to `halonic.recording/1`, with spec
tests; its schema lives in `core/action-steppers`.

**One validator, Studio decides.** `validateStepperRequest(input: unknown,
catalog)` in `core/action-steppers` runs in the engine when a request is
filed, in the Paperclip provider and in Studio. Only Studio's run decides;
the others are early feedback. A request whose definition or version the
user's Studio doesn't have shows "not available in this version". The
requester policy that allows `admin` and `irreversible` requests lives in
the user's profile, keyed on the source the `AgentMessaging` provider
attests, never on the request's own `requester` field. A workspace setting
can only narrow it.

**Packages and order.** `core/action-steppers`, then `core/action-catalog`,
go right after `ports` in `coreOrder`: the catalog's files are
`StepperDefinition` values, and the validator takes the catalog as an
argument, so there is no cycle. Service addresses in a core package are fine
here: the catalog is data and pure code with no SDK, and Studio's features
can't import adapters. For our own board, request shapes are counted on the
Paperclip side, from the cards' documents, by a routine in
`tooling/paperclip`. In v1, Studio only writes the shape into the record.

## Threat model

| Threat | Mitigation |
| --- | --- |
| An agent runs a step itself | Nothing on the agent side has an `ActionSender`, and a test pins that. An agent can only file a request, which is data |
| A request smuggles a different call | A request carries no method, address, header or body. Parameters pass the definition's strict schema in Studio, and the sender checks every placeholder and body field against the route list again |
| Script injected into the page sends any call with the user's admin token | The sender sends only steps on its build-time route list and hands back only kept fields. The token never reaches the page. `admin` and `irreversible` steps need the native dialog |
| A value turns one route into another (`app/../../user`, `app%2Fx`) | Each value must match its pattern and be one segment. `/`, `\`, `?`, `#`, `%`, `.`, `..` and empty values are refused, and the rest is percent-encoded |
| A redirect sends the token elsewhere | The sender follows no redirect, to any host |
| A secret typed by the user leaks | It is typed into the native dialog and goes only into the call or the keychain, never to the page, the record or a log |
| A token, header, secret or answer body lands in a log | Every event kind has a field allow-list, checked on write and on read, with a test that fails on any extra field |
| An answer echoes submitted values or holds a credential | Only the route's kept fields that hold plain values come back. Error text is capped, token shapes are dropped, and it is shown quoted |
| A request starts a sign-in the user didn't mean | Sign-in starts only from the user's click, and only while the stepper is open |
| Page script keeps opening browser tabs | One open per step per click (`too-often`) |

What's left: injected page script could still send a `routine` step of a
shipped definition with valid values, without a native dialog. That's
bounded by the catalog review: routine steps are reads, re-runs and similar.
A `check` step followed by a `PUT` on a ruleset is a race of a few seconds,
which we accept, using a precondition where the service offers one.

## Consequences

- The stepper, the catalog and the screen can be built now against
  `FakeActionSender`, `FakeActionRecords` and the `contracts.action-sender`
  and `contracts.action-records` suites. The shell's adapter must pass the
  same suites, plus its own Rust tests: an off-list path, method or body
  field is refused, a backslash or `%5C` is refused after decoding, no token
  or secret is returned or logged, token shapes are dropped from error text,
  and closing the stepper cancels a sign-in poll.
- Order of the pull requests: these ports with their fakes and suites; the
  `AgentMessaging` version; `core/action-steppers` and `core/action-catalog`;
  the shell's `action_*` commands (a security pull request); then the Studio
  feature and the Inbox change.
- Adding a service, a body field kind or a definition needs a security
  review.
