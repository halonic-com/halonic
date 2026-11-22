# Decision: C591's wording fixes for an unavailable button's tooltip and the CLI's file problems

- Approval: the wording is a team decision on approved screens and command output (HAL-2282), from words check C591 on HAL-15531, routed in HAL-15548
- Kind: user-visible

Two active requirements change their words. Nothing else they say changes.

- `kit.button-unavailable-tooltip`: when the reason's first line ends in ":" and has more than one sentence, the tooltip leaves out that last sentence, which leads into a command the tooltip doesn't show. "Studio can't check these again yet. To check them, sign in again in a terminal:" becomes "Studio can't check these again yet." One example is added for Google setup's Check again. A one-sentence line keeps its colon, since it is all the reason there is.
- `cli.workspace-file-problems`: line 2 of the refusal says "See it with: halonic validate" for one problem and keeps "See them with: halonic validate" for more. The examples with one problem now read "See it with", and the three-problem example says "See them with". Their tests' expected lines change to match, and the three-problem test now also checks line 2.

## Covers

- kit.button-unavailable-tooltip
- cli.workspace-file-problems
