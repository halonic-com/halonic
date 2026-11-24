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
