# Decision: at a compatible provider, the bridge sends only the request fields and tools it knows

- Approval: Paperclip task HAL-12707 (Julian's major on #3639, from his security review on HAL-12702); Liam signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:++NOruP3cMBox1IPNwHrBGngXRysBdIGLf749qehVMjQ+8JcwtdBlIgnLSyFj3CL4wJtfAlVPtTFQqdGeP6cBA==

`harness-bridge.provider-base-url` sent a keyed agent's calls to its compatible provider under the same rules as at Anthropic and OpenAI, which remove only the web tools those two name. A compatible provider has its own ways to reach the network from its side, such as OpenRouter's `plugins: [{ "id": "web" }]` and its `:online` model suffix, which passed straight through. The requirement now also says that such calls get only the fields and tools the bridge knows, as the new requirement `harness-bridge.compatible-request` lists them; nothing else in it changes. This makes the requirement stricter, not weaker: a call it allowed before may now be refused, never the other way round.

## Covers

- harness-bridge.provider-base-url
