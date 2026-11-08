# @halonicjs/adapter-memory

In-memory implementations of the ports, for tests, the `core/app` kernel tests, the browser demo and the parity harness. They pass the same contract suites (`@halonicjs/testing-contracts`) as every other adapter, so a test that passes in memory means the same thing elsewhere.

- **Layer:** adapters
- **Owner:** julian
- **Public API:** `@halonicjs/adapter-memory`
- **Runtime:** any (`"runtime": "any"` in `package.json`): Web globals only, no Node APIs, so it runs in Node, the browser and `workerd`.

## Example

```ts
import { MemoryBlobStore, MemoryDefinitionStore } from "@halonicjs/adapter-memory";

const definitions = new MemoryDefinitionStore({ "workspace.yaml": "id: acme\n" }, "memory:demo");
await definitions.write("hubs/a/hub.yaml", "id: a\n");
await definitions.list(); // ["hubs/a/hub.yaml", "workspace.yaml"]

const blobs = new MemoryBlobStore();
const ref = await blobs.put(new TextEncoder().encode("hello"), "text/plain");
await blobs.get(ref.hash); // the bytes of "hello"
```
