# team.pull-request-author-line

- Status: active
- Since: unreleased
- Source: the Messenger changes approved on HAL-19141, points 3 and 4 (each agent keeps one colour; name semibold, the rest muted); Sofia's Studio and Messenger alignment proposal on HAL-19755 (26 Nov), PR 3; built on HAL-19765

A PR's page shall head its body with the kit's author line at the 40px header size: the author's avatar, their name semibold in `fg`, then the PR's task and size, as far as known, muted. Where the author is an agent, the avatar shall take that agent's own tint; where the author is a person, it shall stay neutral.

## Examples

- Given a PR by the agent Ravi with 312 changed lines and no task,
  when its page opens,
  then it reads "Ravi · 312 lines" beside a 40px avatar in Ravi's tint.
- Given a PR by an outside contributor, with no task or size,
  when its page opens,
  then it reads "outside contributor" alone beside a neutral avatar.
