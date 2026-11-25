# paperclip-client.channel-membership

- Status: active
- Since: unreleased
- Source: phase 2 architecture note (HAL-17511, section 1.2, K1), Julian's security notes (HAL-17513 M6, HAL-17540), Liam's review of #5920 (HAL-17637); task HAL-18121

When the person starts a channel, the Paperclip provider shall make exactly one parent task, with the person's key, carrying the company's `channel` tag, with status `backlog` and no assignee, so that a comment on it wakes no agent, and whose description holds the members line `readChannel` reads back. It shall refuse fewer than 2 or more than 8 agents, an agent named twice, or a lead outside them with `bad-members` before any request, and agents the company doesn't list with `bad-members` before any write. When the person changes a channel's members, joins it or leaves it, the provider shall rewrite only the members line in the parent's description. Because Paperclip keeps no followers on a task, the members line shall also name the people who follow the channel: a channel the person follows shall be among their conversations, and one they made and don't follow shall be listed by `browseChannels` instead. A channel's title shall be kept to one line of at most 80 characters wherever the provider uses it. The provider shall make these writes only through rows of the fixed request list that read the company's labels, make only the `channel` tag, make a parent pinned to a title, a description, one label and status `backlog`, and update only a parent's description; it shall never add an agent to a company, hire or change an agent. Offline, each of these writes shall be refused with `offline` and never queued.

## Examples

- Given Acme with the agents Ada and Bo,
  when the person starts the channel "Launch plan" with both and Bo as lead,
  then exactly one task is made, with the `channel` tag, status `backlog` and no assignee field, and `readChannel` reads back Ada and Bo with Bo as lead.
- Given the same agents,
  when the person starts a channel with only Ada, with 9 agents, or with a lead outside the members,
  then each is refused with `bad-members` and no request is made.
- Given the channel Engineering that the person follows,
  when the person leaves it,
  then it is no longer among their conversations and `browseChannels` lists it, and joining it moves it back.
- Given the channel Engineering,
  when the person sets its lead to Bo,
  then the only write is the parent's description, with nothing changed but its members line.
