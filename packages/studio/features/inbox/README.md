# @halonicjs/studio-feature-inbox

The Studio Inbox: what waits for you, its count, and your answers. It works from run summaries: one item for each tool call waiting for your OK (titled with the subagent that asked, when one did), and one for each run at a `wait` step, whose title and body core has already filled in (`RunSummary.waitingFor`).

- **Layer:** studio
- **Owner:** elena
- **Public API:** `@halonicjs/studio-feature-inbox` (the feature) and `@halonicjs/studio-feature-inbox/api`

## Example

```ts
import { inboxDecisions, inboxItems, inboxSignal } from "@halonicjs/studio-feature-inbox/api";

const items = inboxItems(await store.list({ status: ["waiting"] }));
inboxSignal(items); // { mark: "count", value: 1, spoken: "1 waiting" }
await inboxDecisions(executor).approve(items[0]); // sends approve with the item's call id
```

Inside the Studio, read the Inbox through `InboxService`: one `Inbox` per open workspace, built from the `InboxRunsService` the app provides (the waiting runs from `RunHistory.listRuns`, a signal when a run changes, and the executor's `send`). It loads again whenever a run changes, keeps its items and count through a failed load, and takes an item out as soon as you answer it, so the sidebar's count, Home's Needs you and the Inbox page change together (requirement `inbox.live`).

```ts
const inbox = context.services.get(InboxService);
inbox.subscribe(() => show(inbox.state.items, inbox.signal()));
const [first] = inbox.state.items;
if (first !== undefined && isRunItem(first)) await inbox.decisions.approve(first);
```

Setup items aren't tied to a run: an account to set up or fix, such as a Google account to sign in again. A provider's feature adds a setup source to the workspace's Inbox, and each account it lists becomes an item keyed `setup:<provider>:<account>`, first in Needs you, with a **Setup** chip and no Approve or Reject (requirement `inbox.setup-items`). The Inbox knows nothing about the provider. The account is the source's own ref, never an e-mail address.

```ts
const remove = inbox.addSetupSource({
  provider: "google",
  list: async () => [{ account: "acct-1", title: "Set up Google for x@example.com", progress: "Step 4 of 7 · Scopes", changedAt }],
  subscribe: (listener) => watchSetups(listener),
});
```

The item's `body` and a tool call's `args` can hold model output. Show them as plain text, never as Markdown or HTML.

The screens show those values through `src/plain/`: arguments as readable fields, hidden characters as `⟦U+202E⟧` markers, and long text folded with "Show 38 more lines" (requirements `inbox.plain-values`, `inbox.argument-fields`, `inbox.waiting-time` and `inbox.approval-title`).

The cards live in `src/ui/`: `ApprovalCard` for a tool call, with its Ask for changes dialog, and `WaitCard` for a `wait` step, which has a button for each answer the step takes (requirements `inbox.approval-card` and `inbox.wait-card`). Both report your decision, never what the run did next.

The feature adds the sidebar's Inbox place: its count is the workspace Inbox's, and its page, `InboxPage` in `src/ui/inbox-page.tsx`, shows Needs you beside the open item's card (requirement `inbox.page`). It also adds Home's Needs you, `NeedsYouCard` in `src/ui/needs-you-card.tsx`: the same rows and count, and a row opens its card in the Inbox (requirement `inbox.home`). The workspace's `ServiceRegistry` disposes the Inbox when the workspace closes, and it loads nothing after that.
