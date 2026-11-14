# Attack cases A1 to A40 and their tests

This is a map, not a requirement: it says where each attack case of the I5
design (HAL-958, section 6) is tested, so section 6 can be traced to code.
Each test names its case in its title, such as `(A30)`; search for the tag.
Paths start at `packages/`. The A-numbers here are the I5 design's; `core/app` tests use A2 to A12
for a different list (the listed-tool approval attacks), so a tag there is not a case in this map.
One difference from the design: A30 on plain `http` is refused as `scheme-not-allowed`, not
`host-not-allowed` (section 6), because the scheme is checked first; the real behaviour is kept.
"Fence" tests run with `pnpm test:fence` in
`adapters/integration-runner` and need the OS fence; the rest run in `pnpm test`.

| Case | What it tries | Tested in |
| --- | --- | --- |
| A1 | an undeclared host | `adapters/integration-kit/src/limited-http.test.ts` |
| A2 | a look-alike host; Studio shows it with its main domain clear, no path | `adapters/integration-kit/src/limited-http.test.ts`, `studio/features/runs/src/run-view/blocked-sites.test.tsx` |
| A3 | a redirect to an undeclared host | `adapters/integration-kit/src/limited-http.test.ts` |
| A4 | going around the kit | fence: `adapters/integration-runner/fence/runner-attacks.test.ts`, `runner-attacks.windows.test.ts` |
| A5 | a host check before any lookup | `adapters/http-node/src/address-check.test.ts` |
| A6 | DNS from inside the fence | fence: `runner-attacks.test.ts`, `runner-attacks.windows.test.ts` |
| A7 | a public host whose answer is a private address | `adapters/http-node/src/address-check.test.ts`, `adapters/http-kit/src/address-class.test.ts` |
| A8 | DNS rebinding | `adapters/http-node/src/address-check.test.ts` |
| A9 | a home-network host whose answer is public or link-local | `adapters/http-node/src/address-check.test.ts`, `adapters/http-kit/src/address-class.test.ts` |
| A10 | Halonic's own ports on this computer | `adapters/http-node/src/own-ports.test.ts` |
| A11 | IP literals in odd spellings | `adapters/http-kit/src/ip-address.test.ts` |
| A12 | reading files, also through a link | fence: `runner-attacks.test.ts`, `runner-attacks.windows.test.ts`; `adapters/integration-runner/src/halonic/local-integration.test.ts`; `core/app/src/integration-folder.test.ts` |
| A13 | writing files, replacing its own code | fence: `runner-attacks.test.ts`, `runner-attacks.windows.test.ts` |
| A14 | starting a process | fence: `runner-attacks.test.ts`, `runner-attacks.windows.test.ts` |
| A15 | a worker, add-on, WASI or the inspector | fence: `runner-attacks.test.ts`, `runner-attacks.windows.test.ts` |
| A16 | signalling Halonic or another process | fence: `runner-attacks.test.ts`; native Windows is a recorded gap |
| A17 | reading a key from the environment | fence: `runner-attacks.test.ts`; native Windows is a recorded gap |
| A18 | an undeclared secret, or one on another host | `adapters/integration-runner/src/halonic/kit-attacks.test.ts` |
| A19 | a key echoed back by a server | `adapters/integration-kit/src/secret-filter.test.ts`, `adapters/integration-runner/src/halonic/kit-attacks.test.ts`, `call-limits.test.ts` |
| A20 | a key in the URL, an error or the log | `adapters/integration-kit/src/limited-http.test.ts` (the request log), `adapters/integration-runner/src/halonic/call-limits.test.ts` (errors and stderr on the bridge) |
| A21 | flooding the bridge | `adapters/integration-runner/src/halonic/attacks.test.ts`, `call-limits.test.ts`, `request-size.test.ts`, `src/bridge.refusals.test.ts` |
| A22 | lying about the fence | `adapters/integration-runner/src/halonic/attacks.test.ts`, `start-runner.test.ts`, `src/host-runner.test.ts` |
| A23 | breaking the fence on purpose | `adapters/sandbox-mxc/src/mxc-session.mid-run.test.ts` (MXC fails after the proof: nothing starts unfenced; a kill that fails is reported); `adapters/integration-runner/src/halonic/start-runner.test.ts` covers a failed fence proof |
| A24 | unbounded memory | `adapters/integration-runner/src/runner-file.test.ts` (heap), `src/halonic/runner-profile.test.ts` (`prlimit`); open on macOS, Windows and Linux without `prlimit` |
| A25 | carrying a key out | `adapters/integration-kit/src/secret-in-request.test.ts`, `adapters/integration-runner/src/halonic/kit-attacks.test.ts` |
| A26 | a second or late `ready` | `adapters/integration-runner/src/halonic/strict-protocol.test.ts`, `attacks.test.ts` |
| A27 | a request body over 720 KiB | `adapters/integration-kit/src/request-body.test.ts`, `adapters/integration-runner/src/bridge.requests.test.ts`, `kit-attacks.test.ts` |
| A28 | a mixed public and private answer | `adapters/http-node/src/address-check.test.ts`, `adapters/http-kit/src/address-class.test.ts` |
| A29 | a redirect to a private answer | `adapters/http-node/src/redirect-hops.test.ts` |
| A30 | a home-network or loopback host built in code | `adapters/integration-kit/src/limited-http.test.ts` |
| A31 | a key to a home-network host over plain `http` | `adapters/integration-kit/src/limited-http.test.ts` |
| A32 | tokens in the runner | `adapters/integration-kit/src/loader.test.ts` |
| A33 | frames outside the protocol | `adapters/integration-runner/src/halonic/strict-protocol.test.ts`, `attacks.test.ts` |
| A34 | loading code around the static checks | `adapters/integration-runner/src/runner-file.test.ts` |
| A35 | Unix sockets on disk | fence: `runner-attacks.test.ts`, `runner-attacks.windows.test.ts` |
| A36 | the OS key store | fence: `runner-attacks.test.ts`, `runner-attacks.windows.test.ts`, `adapters/sandbox-srt/fence/srt-keychain.test.ts` |
| A37 | work outside a call | `adapters/integration-runner/src/bridge.refusals.test.ts`, `src/halonic/call-limits.test.ts`, `call-requests.test.ts`, `attacks.test.ts` |
| A38 | replaying a fence proof | `adapters/integration-runner/src/halonic/attacks.test.ts`, `strict-protocol.test.ts` |
| A39 | ending Halonic's host on native Windows | fence: `runner-attacks.windows.test.ts`; a recorded gap |
| A40 | a secret placed another way than the sheet says | `adapters/integration-kit/src/secret-placement.test.ts`, `testing/integration/src/fixtures/attacks.ts` |

## The limit of the MXC network proof

The runner's MXC profile has no bridge, so the box has no network control of its own: MXC refuses
a process in the box a listener on its own loopback. The fence proof therefore counts a timed-out
probe as blocked only after a control box (the same policy with a dead-end bridge, run on the same
computer right before) reached its bridge and was blocked from every address outside. The network
control runs in a twin box, not in the runner's box (HAL-9342).
