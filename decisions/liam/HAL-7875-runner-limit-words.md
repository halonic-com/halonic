# Decision: the runner memory limit and open-folder requirements say only what holds today

- Task: HAL-7875
- Approval: Elena reviews it on [HAL-7887](/HAL/issues/HAL-7887), Liam signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:yXKfomaldpcTAEc9lNJHbC9lyi1NzWunTcL03SozDNbSK8+YmFbbq57/UJU8CxrGQvE9Qq4ltSxnRFezt/bwBQ==

## What changes

Wording only, from the words check on HAL-7873. No behaviour or test changes.

- `integration-runner.heap-limit`: the missing-`prlimit` sentence goes out through `onNotice`
  only when the caller passes one, and no product code calls `startRunner` yet, so the text and
  the example say "reports it once through `onNotice`, if the caller passes one" instead of
  "Halonic says so once". The typed-array example now says what its test checks: the
  `RangeError` comes before the integration has kept 1152 MiB, the whole data limit, not "before
  a gigabyte". macOS and Windows are described as having no such limit here, without the
  untested reason about `mmap`. The README and the comment in `runner-command.ts` match.
- `studio.open-folder`: the long sentence is split, "workspace scope" becomes "workspace", and
  it says what untrusted means for the assistant: it may change only Halonic items, which
  `app.assistant-untrusted-items-only` already requires and tests.

## Covers

- integration-runner.heap-limit
- studio.open-folder
