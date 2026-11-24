# assistant.build.authoring-skill-override

- Status: active
- Since: unreleased
- Source: HAL-10 migration checklist U25 (Now; skill shared with L13); req-assistant revision 5 (HAL-110, HAL-1102); flow-assistant 5.10 (HAL-647); HAL-16811 (T14 PR 19)

Where the workspace has its own `halonic-authoring` skill (`library/skills/halonic-authoring/SKILL.md`, at the root or in a hub), the Build chat shall use that skill's body instead of the built-in authoring skill, and the link under a Build chat's box shall read "edit skill" instead of "customize skill".

## Examples

- Given workspace "acme" has no `halonic-authoring` skill,
  when the person clicks "customize skill" under the Build chat's box,
  then `library/skills/halonic-authoring/SKILL.md` is written with the built-in skill's text as an ordinary change, it opens in the editor in a tab, and the link now reads "edit skill".
- Given `library/skills/halonic-authoring/SKILL.md` says "Always answer in Dutch",
  when the person sends a Build message,
  then the model is told that skill's body before the messages, not the built-in text.
- Given only `hubs/support/library/skills/halonic-authoring/SKILL.md`,
  when the person sends a Build message,
  then the model is told that hub skill's body.
- Given an agent chat,
  then there is no "customize skill" link under its box.
