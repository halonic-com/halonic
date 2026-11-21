# Decision: the run banner gives the CLI's two proxy lines

- Task: HAL-13119
- Approval: decided by the team on HAL-13119 (error text on an approved screen that builds on the CLI's approved `cli.run-failed-proxy` lines, HAL-2282 rule; agreed by Liam in his review on HAL-12606). Liam signs on review.
- Kind: user-visible

A run that failed at the proxy in the CLI carries a typed `proxy.*` cause from the CLI's HTTP
client with the proxy, the variable it came from and the host, but no sentence of its own. The
run page's `model-unreachable` banner then read only "Halonic couldn't reach *Claude* at
api.anthropic.com through your proxy.", which says neither what the proxy did nor what to change.

The banner now gives the CLI's two lines for such a cause, each a sentence of its own: the first
names what the proxy did, the proxy and its variable ("Your proxy http://127.0.0.1:3128 from
HTTPS_PROXY refused to connect to api.anthropic.com."), the second gives the one fix ("Ask
whoever runs your proxy to allow api.anthropic.com, then run again."). A `proxy.` code Studio
doesn't know, or one without the facts its lines need, reads "Halonic couldn't use your proxy
from HTTPS_PROXY to reach *Claude*." and "Check HTTPS_PROXY, then run again." Both keep **Model
calls through a proxy**, on a phone too.

The requirement `runs.run-view.failure-banners` replaces the short "…through your proxy." line
with these two lines and gains an example. Nothing else is loosened: a cause with the desktop
shell's sentence keeps its line, every other `model-unreachable` run reads as before, and the
test for a cause without a sentence now expects the two lines instead of the short one.

## Covers

- runs.run-view.failure-banners
