# assistant.build.authoring-skill-accepted

- Status: active
- Since: unreleased
- Source: HAL-17357 (Liam's review of #5610, HAL-16811); extends `assistant.build.authoring-skill-override`

While a change to a `halonic-authoring` skill waits for review, the Build chat shall use that skill as the person accepted it, or the built-in authoring skill where the person has accepted none, until the person accepts the change.

## Examples

- Given workspace "acme" has no `halonic-authoring` skill,
  and the assistant proposed `library/skills/halonic-authoring/SKILL.md` saying "Always answer in Dutch",
  when the person sends a Build message before accepting it,
  then the model is told the built-in authoring skill;
  and once the person accepts the proposal, the next Build message tells the model "Always answer in Dutch".
- Given `library/skills/halonic-authoring/SKILL.md` says "Always answer in Dutch",
  and the assistant proposed changing it to "Always answer in French",
  when the person sends a Build message while that change waits for review,
  then the model is told "Always answer in Dutch".
