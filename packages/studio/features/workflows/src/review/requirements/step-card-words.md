# workflows.review.step-card-words

- Status: active
- Since: unreleased
- Source: HAL-18077 (a11y check RV3, HAL-18044); AI changes 1.2 (HAL-3228)

Where the assistant added or changed a step on the workflow's canvas, the step's card shall say so in its description as well as by its edge's colour: "Added by the assistant, to review" for an added step, "Changed by the assistant, to review" for a changed one. A card the assistant didn't change shall say neither.

## Examples

- Given the assistant changed the agent of step Write,
  when a screen reader reaches Write's card,
  then its description contains "Changed by the assistant, to review".
- Given the assistant added step Write,
  when a screen reader reaches Write's card,
  then its description contains "Added by the assistant, to review".
