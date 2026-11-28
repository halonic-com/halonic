# Decision: the chat header keeps a line in forced colours

- Approval: Paperclip task HAL-20789, from the post-merge words and accessibility check on HAL-20783; a team decision with no board card
- Kind: user-visible

## What changes

`kit.content-header` gets one more clause: in forced colours, where the browser drops box shadows,
the header shows a 1px line in the system text colour under it instead of its soft shadow. The
Source line now names HAL-20783. No example was removed or weakened, and the header keeps its
shadow and no line everywhere else.

## Why

Since HAL-20728 the header's edge is a shadow, so in Windows contrast themes nothing separated the
chat header from the conversation. Every other part of the new design keeps an edge there
(`SearchField`, `RailButton`), and the requirement has to say so for the header too.

## Covers

- kit.content-header
