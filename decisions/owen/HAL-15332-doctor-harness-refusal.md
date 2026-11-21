# Decision: doctor names the model refusal a harness agent's run stops on, and warns about web search only where the harness can call the provider

- Approval: Paperclip task HAL-15332 (finding 3 of Iris's flow check C561 on HAL-15313); Liam approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:4OKwyV7w5OqugHd4O+f3rpn+D/WYeHfPNrbXoh28AEnzqttaXOOyCwkwpkqIutE45zXzARSk7+w7j1dM1MMnBw==

With a Claude Code agent whose model alias points at an `openai-compatible` provider, `halonic doctor` asked for a Claude Code sign-in and warned that the model searches the web, while `halonic run` stops on the refusal that Claude Code can't call that provider. Both lines pointed the wrong way.

- `app.doctor-agent-sign-in` gains a sentence and an example: an agent whose run would stop on its model alias isn't asked about its sign-in; the Harnesses line names the agent and the alias with the refusal and its fix. A workspace or provider address that isn't trusted yet doesn't count, as `run` asks for trust first.
- `app.doctor-harness-web-search` counts an agent only when its harness calls the provider's type, the same check `harnessModelAccess` makes. Its first example moves from Claude Code to Codex, which can call OpenRouter, and a new example says a Claude Code agent with that alias isn't named.

## Covers

- app.doctor-agent-sign-in
- app.doctor-harness-web-search
