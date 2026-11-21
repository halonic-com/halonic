# Decision: an unreachable proxy is said once in the run banner

- Task: HAL-13770
- Approval: decided by the team on HAL-13770 (Sofia, a wording detail of the banner approved on HAL-13725, HAL-2282 rule; from her check HAL-13765 of #4020). Liam signs on review.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:sZ6s/NOLBJM1BJcQIXSocAqB51wAy0lorCrGBdRXLETO4ur78StkB5D106VbdXbv2RxPAf1oxcmsDblM5pTSDg==

For the shell's `proxy` refusal (`proxy.unreachable`), the run page's `model-unreachable`
banner said the same fact twice, with two colons: "Halonic couldn't reach *Claude* at
api.anthropic.com through your proxy: couldn't reach the host through the proxy: check
HTTPS_PROXY and the proxy."

When the shell's sentence starts with "couldn't reach the host through the proxy", the banner now
leaves that part out and gives what follows the colon as a sentence of its own, with a capital:
"Halonic couldn't reach *Claude* at api.anthropic.com through your proxy. Check HTTPS_PROXY and
the proxy."

The requirement `runs.run-view.failure-banners` says this, and its example for
`proxy.unreachable` changes to the new line. One example is added for `proxy.setting`, which keeps
the colon form. Nothing else is removed or loosened: the other refusals, "…through your proxy."
without a sentence, and every other `model-unreachable` run read as before. The shell's sentence
itself doesn't change, since other callers of `http_fetch` show it on its own.

The proxy cases of `failure-banner.test.ts` move, unchanged, into `proxy-banner.test.ts`, which
keeps the first file under the 500-line limit. That file runs fewer tests than on `main`, so it
is listed below.

## Covers

- runs.run-view.failure-banners
- packages/studio/features/runs/src/run-view/failure-banner.test.ts
