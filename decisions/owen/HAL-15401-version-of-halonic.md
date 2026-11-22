# Decision: the asks rows say what each app does with the calls today

- Approval: HAL-15401, from words check C571 (HAL-15387), and HAL-15661, from Nina's check C607 (HAL-15650); team wording on an approved screen (HAL-2282), for Liam's review
- Kind: user-visible

The trust check and Studio's trust review say an agent with
`asks: in-sandbox` will edit and run commands in its working folder, inside
the sandbox, and that "this version still asks first".

That clause is no longer true for the CLI: since #4505 (HAL-14992) the CLI
gives the harness host its path resolver, so a fenced CLI run answers the
agent's working-folder calls without a person and logs `harness.allowed`
(`harness-host.sandboxed-asks`). The CLI's rows drop the clause; they now
state what a CLI run does.

Studio's agent host doesn't answer those calls until HAL-15287, so Studio's
row keeps the clause, as "this version of Halonic still asks first": in a
trust review, **version** is the glossary's word for a workspace version
(microcopy 1.2), and the longer form, which microcopy 23.3 and 24.1 already
use, can't be read that way. HAL-15287 drops it.

`docs/security/trust.md` and the format README say the CLI answers the calls
and Studio still asks. The rows still show for the same agents, and each test
only changes the lines it quotes.

## Covers

- cli.trust-check-asks
- studio.trust-review-asks
