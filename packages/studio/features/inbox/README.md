# @halonicjs/studio-feature-inbox

The Studio Inbox: what waits for you, its count, and your answers. It works from run summaries: one item for each tool call waiting for your OK, and one for each run at a `wait` step, whose title and body core has already filled in (`RunSummary.waitingFor`).

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

The item's `body` and a tool call's `args` can hold model output. Show them as plain text, never as Markdown or HTML.

The screens show those values through `src/plain/`: arguments as readable fields, hidden characters as `⟦U+202E⟧` markers, and long text folded with "Show 38 more lines" (requirements `inbox.plain-values`, `inbox.argument-fields`, `inbox.waiting-time` and `inbox.approval-title`).
