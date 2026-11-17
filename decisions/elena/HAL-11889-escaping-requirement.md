# Decision: the trust requirement promises escaped workspace text

- Task: HAL-11889
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11889 (a requirement that records what the code already does; a team decision with no board card, HAL-2282 rule)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:SDwlAlyWKXM+G7bAxJhR+gvGTxgdpWteoczVg0tYhHais2KNSCJN5aIPKY8lA5UY6C9xMVcW+fAXjZCxSG5BBg==

The trust command already shows every text that comes from a workspace file with its control and bidi characters as `\u` codes: in the check, the question, the ✓ lines, `--list` and the refusal lines. The requirement didn't say so, so the tests for it were linked to other requirements. This adds the promise, an example and the link between the escaping tests and the requirement. No code behaviour changes. One test moves from the refusals group to a block that names the requirement.

## Covers

- cli.commands.trust.review-and-trust
