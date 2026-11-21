# Decision: the run page words Studio's two refusals of a sandboxed agent's key

- Approval: Noah's C503 M2 and M3 on HAL-14914, "fix now", wording on approved screens decided by the team with Noah (HAL-2282); the package owner (Liam) approves this note in review
- Kind: user-visible

## What changes

#4267 stopped a sandboxed harness agent's run before its bridge opened when the key's secret holds
no value, or when the provider has its own Base URL. Both refusals were plain errors, so the run
page showed "Support reply failed in the step Draft. Halonic can't tell the cause yet." and their
words went only into Copy details (C503 M2 and M3). Now each refusal carries a typed cause, which
the engine logs on `run.failed` (`engine.run-failure-cause-of`), and the run page words it.

- `ProviderKeyServices` throws `MissingKeyError`, with the cause `harness-host.no-key` and the
  provider, the secret's name, the agent and its harness: never a value. The CLI and Studio both get
  it; the CLI's lines don't change, since `setupFailureOf` doesn't read this code.
- The host's refusal wrapper keeps the `failureCause` of the app's check, so Studio's
  `studio.harness-base-url` (and a model call's own `models.*` cause) still reaches the run log.
- The run page reads both causes in `harness-key-banners.ts`, before the general banner.

## Wording decided by the team

Noah's suggested sentences from C503, on the approved 15.3 (R1) and 9.6 (R17) shapes:

- No key, R1's agent form: *Anthropic has no API key on this computer, and Writer needs one to run
  in Claude Code.* · **Add key** · **Run again**. On a phone: *Fix this on your computer: Models*.
  The provider by its file's name, the button rather than "Settings › Models".
- Base URL, R17's shape: *Writer didn't start: Studio can't send its model calls to Z.ai's Base URL
  yet. Nothing ran.* · *To run it, run this in a terminal:* · `halonic run support-reply` ·
  **Copy command**, and no **Run again**, since Studio would stop it the same way. On a phone:
  *Run it from the command line on your computer.*

The command names the workflow by the id the run's summary gives. Refusing before the run, with **Run** unavailable (C503 N5), is left for HAL-13798, which
makes the Base URL work instead.

## Covers

- studio.harness-provider-key
- harness-host.provider-key-services
- runs.run-view.failure-banners
