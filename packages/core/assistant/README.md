# @halonicjs/assistant

The Build chat's tools: what the Assistant may read, check and change in a workspace. It runs
anywhere `ChatService` runs: the desktop app, a served window and later the CLI.

- **Layer:** core
- **Owner:** elena
- **Public API:** `@halonicjs/assistant`

## What is here

- **`toolTexts`**: what the Build chat's tools tell the model as tool results (flow-assistant 3.1
  and 3.7, AI changes 1.11). The tools themselves follow in the next pull request (HAL-16790).

## Example

```ts
import { toolTexts } from "@halonicjs/assistant";

toolTexts.changed("agents/writer.md");
```
