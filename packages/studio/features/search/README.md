# @halonicjs/studio-feature-search

The Search feature of the Studio.

- **Layer:** studio
- **Owner:** owen
- **Public API:** `@halonicjs/studio-feature-search` (the feature) and `@halonicjs/studio-feature-search/api`

## Example

```tsx
<SearchView store={studio.services.get(SearchService)} onOpen={(hit) => openInItsApp(hit)} />
```

Hits come from `AgentMessaging.search`, grouped by kind and then by source
(requirement `search.across-sources`). An empty query makes no search call.

The feature also gives Ctrl K and the Search page the sources' agents, inbox items and work, such
as a Paperclip's tasks, each opening the place that lists it: the Overview or the Inbox
(requirement `search.palette`). Chats and messages stay in the Search view and Messenger.
