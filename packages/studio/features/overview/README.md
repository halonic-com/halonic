# @halonicjs/studio-feature-overview

The Overview feature of the Studio.

- **Layer:** studio
- **Owner:** owen
- **Public API:** `@halonicjs/studio-feature-overview` (the feature) and `@halonicjs/studio-feature-overview/api`

## Example

```ts
const store = new OverviewStore(messaging); // any AgentMessaging, such as FakeAgentMessaging
await store.start(); // reads now, then again on every change
// <OverviewView store={store} /> draws each agent with its work, idle agents and blocked work.
```

The feature reads `AgentMessaging` from `OverviewMessagingService`, which `studio/services`
provides. The feature adds the Overview place, under the sidebar's Team heading, which shows
the recap and then the overview (requirement `overview.place`).
