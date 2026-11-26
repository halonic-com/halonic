# @halonicjs/toolscript

The ToolScript header schema, the `UserContext` and `AgentContext` types over a capability registry, and the artifact format. A ToolScript is one `*.tool.ts` file with a `header` and, unless the header has `steps`, a `run` function.

- **Layer:** core
- **Owner:** maya
- **Public API:** `@halonicjs/toolscript`

## Example

```ts
import { checkHeader } from "@halonicjs/toolscript";

const checked = checkHeader(header, {
  riskOf: (reference) => registryRisks[reference],
  hasRun: true,
});
if (!checked.ok) console.error(checked.reasons.join("\n"));
```
