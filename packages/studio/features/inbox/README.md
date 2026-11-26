# @halonicjs/studio-feature-inbox

The Studio Inbox: what waits for you, its count, and your answers. It works from run summaries: one item for each tool call waiting for your OK (titled with the subagent that asked, when one did), and one for each run at a `wait` step, whose title and body core has already filled in (`RunSummary.waitingFor`). Setup items, which a provider's feature adds, come first.

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

Setup items aren't tied to a run: an account to set up or fix, such as a Google account to sign in again. A provider's feature adds a setup source to the workspace's Inbox, and each account it lists becomes an item keyed `setup:<provider>:<account>`, first in Needs you, with a **Setup** chip and no Approve or Reject (requirement `inbox.setup-items`). The Inbox knows nothing about the provider. The account is the source's own ref, never an e-mail address. `inboxItems` makes items from runs alone, so it never lists setup items; `setupKey("google", "acct-1")` gives a setup item's key, and `isRunItem` tells a run's item, which takes an answer, from a setup item.

```ts
const remove = inbox.addSetupSource({
  provider: "google",
  list: async () => [{ account: "acct-1", title: "Set up Google for x@example.com", progress: "Step 4 of 7 · Scopes", changedAt }],
  subscribe: (listener) => watchSetups(listener),
});
```

Another feature can put its own view in a wait card's place once an answer is recorded, such as first-run's "You did it" after the first run's Approve. It adds an answered view whose `claims(item, event, after)` says which answers it takes; `after` is `continues`, `finished` or `ended`. The view loads only when it claims one and gets the item, `close` and `openItem`. An answer no view claims keeps the card's decided bar, and so does a view that can't load (requirement `inbox.answered-view`).

```ts
const remove = inbox.addAnsweredView({
  claims: (item, event, after) => item.runId === firstRunId && event === "approve" && after === "finished",
  view: { view: "YouDidItView", load: () => import("./ui/you-did-it-view.tsx") },
});
```

The item's `body` and a tool call's `args` can hold model output. Show them as plain text, never as Markdown or HTML.

The screens show those values through `src/plain/`: arguments as readable fields, hidden characters as `⟦U+202E⟧` markers, and long text folded with "Show 38 more lines" (requirements `inbox.plain-values`, `inbox.argument-fields`, `inbox.waiting-time` and `inbox.approval-title`).

The cards live in `src/ui/`: `ApprovalCard` for a tool call, with its Ask for changes dialog, and `WaitCard` for a `wait` step, which has a button for each answer the step takes and turns stale once its run is answered somewhere else (requirements `inbox.approval-card` and `inbox.wait-card`). On both, **Try again** gives focus to the answer it sends again (`inbox.retry-focus`). Both report your decision, never what the run did next. `SetupCard` shows a setup item's title and progress line until its source's own view replaces it.

The feature adds the sidebar's Inbox place: its count is how many of the workspace Inbox's waiting items are new, with the name semibold, heard as "Inbox, 3 new, 8 waiting", and nothing while nothing is new (`inboxNewSignal`, requirement `inbox.sidebar-new`); its page, `InboxPage` in `src/ui/inbox-page.tsx`, shows Needs you beside the open item's card (requirement `inbox.page`). It also adds Home's Needs you, `NeedsYouCard` in `src/ui/needs-you-card.tsx`: the same rows and count, without the page's unread mark, and a row opens its card in the Inbox (requirement `inbox.home`). The page marks an item nobody opened as new, with the blue dot and "3 new" in the heading, and its header's ··· menu has **Mark as unread** (requirement `inbox.read-marks`). The marks are kept on the device in `localStorage`, at most the newest 1,000, through `StoredReadMarks` in `src/read-marks.ts`, behind the `ReadMarks` interface a port can take over later; a run's step is marked for one wait (`readKey`), so a step the run comes back to is new again. When the served Studio's sign-in ends, Needs you keeps its rows under the Inbox's "Sign in again to …" line (`SignedOutLine` in `src/ui/load-lines.tsx`). Outside the Inbox, a screen reader hears "Waiting for you: *title*. *N* waiting." when Needs you goes up, or "*K* new in Needs you" for items within 2 s of each other; `NeedsYouNews` in `src/ui/needs-you-news.tsx` says it, through the window's announcer. It stays quiet while the Inbox, the run's own page or a page that noted the run in `inbox.shownRuns` (a workflow page's docked run card) shows, since those say it (requirement `inbox.needs-you-news`). The workspace's `ServiceRegistry` disposes the Inbox when the workspace closes, and it loads nothing after that.

An agent's action item (an `AgentMessaging` item with `action`, a request to run a user-only stepper) lists like any agent item. Opening it checks the request again with the Action Steppers feature's `reviewActionItem`, against the installed catalog (`ActionCatalogService`) and the user's requester policy (`RequesterPolicyService`), and shows that feature's stepper in review mode: what it touches, each step, who asked and why, **Copy instructions** on browser steps and **Decline**, which answers the item as `declined`. In the desktop app, with the `ActionSteps` app service (`actionStepsKey`), the user signs in and runs the steps there, and the item is answered with the stepper's result when it ends (requirement `inbox.agent-action-run`); without it, as in a browser, the stepper says "Open it in the desktop app to run it." A request outside the user's policy says "Blocked by your settings". One Halonic can't read stays the agent's normal card with the reasons and only **Decline** (requirement `inbox.agent-action-items`). Without the two services, nothing is in the catalog and only routine requests are allowed. The Inbox registers no URL scheme for these requests.
