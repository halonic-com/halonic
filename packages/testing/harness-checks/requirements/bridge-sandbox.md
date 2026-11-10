# harness-checks.bridge-sandbox

- Status: active
- Since: 0.1.0
- Source: HAL-4475 (HAL-1710 check 1: "the sandbox allows only the bridge")

The check's setup shall open the run's real bridge with the provider reached by the person's own sign-in, a header tap in front of it, and a sandbox whose only reachable address is the tap, plus the allowed sites the check names (none for the main check). The program shall get the harness adapter's own variables, with the tap as the bridge's address, a home folder inside the check's working folder, and the check's extra variables, and nothing else. A program shall run with its standard input closed, and the setup shall stop it after the check's time limit and say it did.

## Examples

- Given Claude Code's environment, when the sandbox opens, then its only network is the tap's address with no allowed sites, and `ANTHROPIC_BASE_URL` names the tap.
- Given a program that sends a made-up sign-in to `/v1/messages`, when it runs, then Anthropic gets the same sign-in, the tap notes `authorization: present` with status 200, and the bridge records one model call.
- Given a program that never ends and a limit of 50 ms, when it runs, then it is stopped and marked as timed out.
