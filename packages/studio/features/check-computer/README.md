# @halonicjs/studio-feature-check-computer

The Check this computer feature of the Studio: `halonic doctor`'s checks for the open workspace,
with the lines only Studio knows (the engine, the models' keys and last tests, Default model,
Last run, Google), and the plain-text report a person can copy (first-run-progress section 4 on
HAL-7986).

- **Layer:** studio
- **Owner:** noah
- **Public API:** `@halonicjs/studio-feature-check-computer` (the feature) and `@halonicjs/studio-feature-check-computer/api`

## The report is an allow-list

`checkReport` builds the report from named fields only (`src/report/`), never from the screen's
sentences, which can hold the workspace's name, agent and secret names or a program's error
text. A provider is named only when it is Anthropic, OpenAI, Ollama or LM Studio, and an address
only on this computer. `check-report.leak.test.ts` fills every field with a key-shaped string, an
email address, a step name, a workspace name and a home folder's path, and fails if any of them
gets in (requirement `check-computer.report`).

## Example

```ts
checkReport(facts, { about: "Halonic 0.1.0 · macOS arm64", at: new Date(), demo: true });
// Check this computer
// Halonic 0.1.0 · macOS arm64
// 2026-11-19 10:44
// 1 problem
//
// ✓ Engine          running
// ✓ Workspace       demo · can open · trusted
// ✕ Models          Anthropic: key accepted, account has no credit, 10:42
//                   Fix: add credit on Anthropic's site, then test again.
// – Default model   points at Anthropic · not checked until Models works
// – Last run        failed at step 2 of 3 · because of Models
// – Not checked     sandbox, harnesses · not used here
```
