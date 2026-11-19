# Decision: the agent host runs a plugin without the sandbox with the user's yes

- Task: HAL-3384
- Approval: Liam approved the plan for part 3a on HAL-12520 (https://paperclip.halonic.com/HAL/issues/HAL-12520), with eight conditions, and chose host routes over a Rust command. It builds the board's approved "Runs" line decisions on HAL-1949 (R-D1 A, R-D3 A) and Julian's build conditions in the design on HAL-1873, section 11.
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:iAeRxk41DtkdWB/Ge9kRIrsbmBtTd4LnuIHbSGhGuPD9wsp38n1WOaOtv5rBLRAtsCp8J378pmhT0SahJde7CA==

## What changes

- `agent-host.plugin-routes`: the sentence "If the sandbox that fences the runner isn't available on this computer, then the agent host shall refuse the call with 403 `not_fenced` and start nothing, with no fallback to running without a sandbox." now ends "…start nothing, unless the user's yes saved in the profile is for the reason at this start (`agent-host.unfenced-runs-routes`); then it shall start the runner in the launcher's sandbox, through the same start gate, and register it so Take back stops it. It shall never fall back to running without a sandbox by itself." The example "Given a computer with no sandbox for the runner" now says "and no saved yes for its reason", and one example is added for Windows with a saved yes for `windows`. Every other sentence and example stays. No test of this requirement is removed or weakened: the tests that answer `not_fenced` still run unchanged, and two are added (a start with the yes for the current reason, and none with a yes for another reason).
- `cli.no-unfenced-run-yes` (HAL-12639): its opening "While no host offers the yes to run without the sandbox, the `halonic` command shall start … with no saved yes, as the agent host does" now reads "The `halonic` command offers no yes to run without the sandbox, so it shall start … with no saved yes", and the folder's yes may be one "the agent host saved there (`agent-host.unfenced-runs-routes`) or placed by hand". The CLI's behaviour and tests don't change: it still ignores the yes. Only the claim about the host, which this pull request makes false, goes.

## Why

Until now the host's plugin machine had a store that never held a yes and a launcher that refused to open, because nothing in Studio could ask for the yes. The board approved the trust check's checkbox (HAL-1949), and this pull request adds the routes that save it. The yes is saved only through the start gate, and only for the reason that holds at that moment. The gate reads it again at every start (Julian's condition (a)), and Windows stays `not-fenced` for `windows` (condition (b)). The yes is kept in the profile's `unfenced-runs` folder (`FileUnfencedRunConsentStore`), which HAL-12639 kept for the moment a host offers the yes. Once the host offers it, a file written there by hand counts as a yes in the host, as a trust record written by hand counts as trust: whoever can write the profile already decides what runs. The `halonic` command still offers no yes and keeps ignoring the file (HAL-12639); whether it should honour the host's yes is left for a later decision.

## Covers

- agent-host.plugin-routes
- cli.no-unfenced-run-yes
