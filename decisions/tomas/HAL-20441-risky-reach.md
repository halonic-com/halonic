# Decision: a join request's agent defaults give their variable names to `reach`

- Approval: /HAL/issues/HAL-20278 (plan approved by Liam, PR 3; 6.8 decided on HAL-20274, Julian's additions on HAL-20278; stack B on HAL-20441)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:gS95VRjrx3SsWToZaetpecqLZQn0JB1OVHCpHIPPX2R8p+4OTwlGLfmkUHBsVy8Nm4iHxhIkhx7pSmXmuqqgDw==

Condition 2 of section 6.8 of the HAL-17491 note: the desktop shell's own
confirmation of a risky approve names what it reaches. For an agent's join
request that is the agent, its adapter and the environment variables its
adapter defaults set, so the provider now reads the names in
`agentDefaultsPayload.env` and each binding's `type`
(`paperclip-client.risky-reach`).

- `paperclip-client.board-requests` said the provider never reads a join
  request's agent defaults. It now says the provider reads nothing of them
  but those names and binding types. It still reads no value: no binding's
  `value` or `secretId` and no other field of the defaults, such as an
  `apiKey`. Hires and joins read `env` with the same function; a test
  watches each binding and shows only `type` is read, and that a planted
  value and secret ID reach neither the item nor `reach`.

After the security review on HAL-20469, the provider also marks its own
Reject and Request changes options with the port's new `declines` flag
(`paperclip-client.declining-options`), so the next pull request exempts
only those from the confirmation, never a decision's option an agent named
`reject`. `decisions.ts` doesn't change: it never sets the flag. Three tests
of other requirements (`budget-incidents`, `option-notes`, the port's
reads) now expect `declines` on those options; none of them expects less.

After its second round, a confirmation card that carries Paperclip's
`payload.secretProposal` is `risky` too, with a `reach` from that payload,
because its Accept approves the binding (`paperclip-client.risky-reach`).

The user sees nothing different yet: `reach` is shown only by the shell's
confirmation, in the next pull request of this stack.

## Covers

- paperclip-client.board-requests
