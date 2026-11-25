# paperclip-client.channels

- Status: active
- Since: unreleased
- Source: phase 2 architecture note (HAL-17511, section 1.2, K1 as the board approved it on HAL-17544), Julian's security notes (HAL-17513, HAL-17540); task HAL-17637

The Paperclip provider shall list as a channel only an open task that carries the `channel` tag, was made by a person and not by an agent (by the key's own user, when the provider knows it), and holds the provider's members line of 2 to 8 agents, none twice, the lead among them. When the person sends a message in a channel, the provider shall post it as a comment on that parent task and then make exactly one child task for each agent in `to`, or for the lead when `to` is empty, assigned to that agent with status `todo`, whose description is the person's text quoted and labelled as the board's. It shall wake agents only through those assignments: it shall never read an agent's name out of the text. The child task shall be made through one row of the fixed request list that pins its body to exactly a title, a description, the parent, the agent and status `todo`. A `to` naming anyone outside the channel, or a channel that isn't one of the connection's company, shall be refused with `not-found`, and nothing sent; offline, a message is refused with `offline` and never queued.

## Examples

- Given the provider's request list,
  when its channel rows are read,
  then they are exactly a comment on a task and a task create pinned to title, description, parent, agent and status `todo`.
- Given the channel Engineering with Ada as lead and Bo as a member,
  when the person sends "Check the build" with `to: [Bo]`,
  then the provider comments it on Engineering's task and makes exactly one child task, assigned to Bo, whose description starts "The board wrote in the channel Engineering:" and quotes the text.
- Given the same channel,
  when the person sends "@Bo do X" with an empty `to`,
  then exactly one child task is made, for Ada, and no request names Bo.
- Given a task with the `channel` tag that an agent made,
  when conversations are listed,
  then it isn't a channel.
