# Decision: drop knowledge hits and documents with a ref over 512 characters

- Approval: [HAL-4188](/HAL/issues/HAL-4188)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:KG5jFGj+OLziwzC8jKBtBc2p/DMLdL7+ex7KOeStiAL1Pc18YrueKue4bpAMLBDkOEsFLH+8OxqyVARvf3o+CQ==

Liam's review of PR #1324 (HAL-4185) found that the ref of a knowledge hit
or document reaches the model unfenced, because the model sends it back to
read the document. A remote source chooses its refs, so a long ref could
carry an instruction. Listed tools already cap their unfenced text at 2,048
characters (threat model 4.3); refs had no cap.

`ports.untrusted-knowledge` now says Halonic drops a hit or a document of an
untrusted provider whose ref is longer than 512 characters, and accepts a ref
of up to 512 characters as a known unfenced channel. `knowledgeHitForModel`
and `knowledgeDocForModel` return `null` for such a hit or document. A
provider with `untrusted: false` is left as it was. The engine's knowledge
tools drop those: `knowledge_search` leaves the hit out before it applies the
limit and answers "No matches." when none is left, and `knowledge_read`
answers "No document with that ref." The existing examples stay; two are
added, with tests in the app helpers and the engine tools.

## Covers

- ports.untrusted-knowledge
