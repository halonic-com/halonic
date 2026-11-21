# Decision: the asks rows say "this version of Halonic still asks first"

- Approval: HAL-15401, from words check C571 (HAL-15387); team wording on an approved screen (HAL-2282), for Liam's review
- Kind: user-visible
- Signature:

The trust check and Studio's trust review say an agent with
`asks: in-sandbox` will edit and run commands in its working folder, inside
the sandbox, and that "this version still asks first". In a trust check,
**version** is the glossary's word for a workspace version (microcopy 1.2), so
"this version" can read as this version of the workspace. The rows now say
"this version of Halonic still asks first", the form microcopy 23.3 and 24.1
already use. `docs/security/trust.md` and the format README say the same.

Only the words change: the rows still show for the same agents, and each test
only changes the line it quotes.

## Covers

- cli.trust-check-asks
- studio.trust-review-asks
