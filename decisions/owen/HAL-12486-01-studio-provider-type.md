# Decision: Studio says how to mend a provider type Halonic can't call, as the CLI does

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12486 (Liam, CTO; asked for in his review on HAL-12342)
- Kind: user-visible
- Task: HAL-12486

Since HAL-12342, a run whose provider file names a type Halonic has no adapter for ends with the
`run.failed` cause `models.unknown-provider-type`, with the provider and the type, and
`halonic run` words it in two lines. Studio's run page still showed "Halonic can't tell the cause
yet" with **Copy details** for a bug report, though the cause is the person's own typo.

The run page now reads that cause and shows the CLI's two lines in the danger banner, with no
**Copy details**:

```
Support reply failed in the step Read the email: provider weird has type carrier-pigeon, which Halonic can't call.
Set type in providers/weird.yaml to one of anthropic, openai, openai-compatible, ollama, lmstudio or mock, then run again.
```

- The words are the CLI's, which the team decided on HAL-12342; this adds no new wording.
- The types come from one list, `providerTypes`, which moves from the models adapter into
  `@halonicjs/format` (next to the provider file's schema), because Studio's features may not
  import an adapter. The models adapter builds providers from it and still exports it, so the CLI
  doesn't change.
- A phone shows the same two lines: the fix is an edit to a file, which the person makes on the
  computer either way.

## Covers

- runs.run-view.failure-banners
