# Decision: a missing knowledge provider is said without "factory"

- Approval: the words check on HAL-4240 (PR #1326) asked for this change on
  [HAL-4250](/HAL/issues/HAL-4250), including the update of `engine.agent-knowledge`; the
  maintainer approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:oJbyoKpXl9Fp8/8DlU/LCDyR8y2Ni1dc4XKyvZy7g2qa8TAwDgXgDz27M6dUsD5e3DSABxXH8tcvc0lYFBJCAg==
- Task: HAL-4250

## What changes

`engine.agent-knowledge` keeps its rule that a source whose provider type no factory builds fails
the turn with an error naming the source and the type. The error now also says what to change: the
provider types the engine has, or, when it has none, to take the source out of the agent's
knowledge. The old example's text is replaced by the new wording, and one example is added for an
engine without knowledge providers.

Old: `The knowledge source "handbook" uses the provider "vector", which this engine has no factory for.`

New: `The knowledge source "handbook" needs the provider "vector", and this engine doesn't have it. Change the source's provider to one it has: "files".`

## Why

"Factory" is a word from the code, and the person reading the error can't act on it. Run failures
carry no separate fix line from the engine (the CLI prints its own fix for each failure reason), so
the fix goes into the message itself.

## Tests

No test was weakened. The test for this error expects the new text, and a new test covers the
engine without knowledge providers.

## Covers

- engine.agent-knowledge
