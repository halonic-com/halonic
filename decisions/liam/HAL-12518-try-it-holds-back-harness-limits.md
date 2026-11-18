# Decision: Try it holds back an agent's harness limits

- Approval: HAL-12518, follow-up from HAL-12481 (Halonic Code first slice, HAL-12473)
- Kind: user-visible

`app.review-try-it-holds-back` lists the parts of an agent that give it more
reach, and Try it takes the baseline's value for them until the person
accepts the change. The new `harnessLimits` block bounds one harness step,
so raising or removing it gives the agent more reach, like its `maxSteps`.
The requirement's permissions group now names an agent's harness limits
too. Nothing it held back before is used now: the list only grows.

## Covers

- app.review-try-it-holds-back
