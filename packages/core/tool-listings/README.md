# @halonicjs/tool-listings

Reads a tool listing from a server the workspace chose, the way requirement
[`ports.untrusted-tool-listings`](../ports/requirements/untrusted-tool-listings.md)
says: it rebuilds each listed tool's parameters from an allow-list, checks the
names the model sends back, and marks every text it keeps as untrusted. It is
a pure step with no I/O; tool assembly in the engine calls it and renders the
fence.

- **Layer:** core
- **Owner:** ravi
- **Public API:** `@halonicjs/tool-listings`

## Example

```ts
import { rebuildParameters } from "@halonicjs/tool-listings";

const rebuilt = rebuildParameters({
  type: "object",
  properties: { q: { type: "string", description: "Search text", pattern: "^a" } },
});
if (rebuilt.ok) {
  // rebuilt.parameters.properties.q has no `pattern`, and its description is an
  // UntrustedText: JSON.stringify throws until tool assembly fences it.
  // rebuilt.dropped says that `pattern` was dropped, and where.
}
```
