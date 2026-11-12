# Decision: write the run page requirement's short run ids in lowercase

- Task: HAL-7006
- Approval: Liam asked for this in his review of #2063 on [HAL-6999](/HAL/issues/HAL-6999); he approves this note in review on [HAL-7006](/HAL/issues/HAL-7006)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:R1mSS5ZuLVLnlpkJLmxpoCMptEfPuQNucsO8PuLFJRIoAuxTLydqHrmtGYq5DqnBNgqSVYEH0PYkQp8csfvMDQ==

## What changes

Examples 1 and 3 of `packages/studio/features/runs/requirements/run-page.md` write the short run ids as the page shows them: "Run 01jd8q", "child run 7k2m9p" and "Open run 7k2m9p" instead of "Run 01JD8Q", "7K2M9P" and "Open run 7K2M9P". The requirement's rule text doesn't change, and no test or code does: two doc comments in `run-page-model.ts` get the same fix.

## Why

`shortRunId` keeps an id as it's stored and never uppercases it (microcopy W4), and the run page's tests already check "Run 7k2m9p". The examples were the only place that said otherwise.

## Tests

No test changes.

## Covers

- runs.run-page
