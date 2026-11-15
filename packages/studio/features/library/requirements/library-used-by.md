# library.library-used-by

- Status: active
- Since: 0.1.0
- Source: HAL-1303 (T10, P4a); flow-library 3.1

The right side of a Library row shall name the agent when exactly one agent uses the item and nothing else does, shall otherwise count the agents, routines and collections that use it ("Used by 2 agents", "Used by 1 agent and 1 collection"), joined with commas and a final "and" when there are three parts, and shall say "Not used yet" when nothing does. The hubs that take a shared item shall not be counted.

## Examples

- Given the skill "Tone of voice" used by the agent "Support",
  when its row shows,
  then it ends with "Used by Support".
- Given a skill used by two agents,
  when its row shows,
  then it ends with "Used by 2 agents".
- Given a collection used by one agent and one other collection,
  when its row shows,
  then it ends with "Used by 1 agent and 1 collection".
- Given a skill used by one agent, one routine and one collection,
  when its row shows,
  then it ends with "Used by 1 agent, 1 routine and 1 collection".
- Given a skill nobody uses,
  when its row shows,
  then it ends with "Not used yet".
- Given a shared skill that only a hub takes,
  when its row shows,
  then it ends with "Not used yet".
