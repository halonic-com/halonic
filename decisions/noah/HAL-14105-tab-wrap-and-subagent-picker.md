# Decision: wrapped phone tabs share their rows evenly, and the agents to pick in "Add a subagent" are List rows

- Task: HAL-14105
- Approval: team decision on the approved Tabs and Subagents page under the HAL-2282 rule (Noah, kit owner, on HAL-14105, from Sofia's C313 notes SG1a and SG1b); the reviewer of the pull request on HAL-14105 signs this note
- Kind: user-visible

## What changes

**Tabs (SG1a).** When the kit's `fill` tabs (on a phone, or with `fill` set) don't fit on one row, every row now holds as many tabs as the others, as near as it can: the agent's Configuration, Behaviour · Model · Harness · Tools · Subagents, is three and two at 320px and 390px instead of four and Subagents alone across a full-width row. A small hook, `useBalancedRows`, counts the rows the tabs take as their words allow, then sets a `--tab-basis` on the track so each row takes the tabs divided by the rows, rounded up. If that would take one more row, because a word is wider than its share (at 195px "Behaviour" doesn't fit in half the track), the tabs keep the rows their words allow: 195px stays two, two and one, as before. Tabs that fit on one row, inline tabs and vertical tabs don't change.

**Add a subagent (SG1b).** The agents to pick were borderless buttons, so they read as a plain list next to the bordered Name box, and in high contrast they had no edge at all. They are now the rows of a kit `List` named "Pick an agent": a bordered box with a line between rows, a fill on hover and press and the List's focus ring, with each agent's whole description under its name. The box stays on a phone too (`flush={false}`), where a List is flush by default, so high contrast keeps its edge. A click, Enter or Space adds the agent, as before.

The `kit.tabs` requirement says so and gains one example; `agents.configuration.subagents` says the agents are the rows of a List. The tab fill test now expects `basis-[var(--tab-basis,0)]` for `basis-0`, and two new tests check the balanced rows and the fallback. The subagents test finds the agents as grid cells instead of `li button`. No test was skipped.

## Why

Found by Sofia's C313 check of #3869 (HAL-14097). A tab alone across a row looks unbalanced and draws the eye to the last page for no reason. Agents that don't look pressable make a person look for another way to pick one. The List is the kit's one look for a choice among items, so the dialog now uses it instead of its own buttons.

## Covers

- kit.tabs
- agents.configuration.subagents
