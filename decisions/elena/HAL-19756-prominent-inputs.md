# Decision: the prompt look changes four shipped kit requirements

- Task: HAL-19756
- Approval: the board approved the rounder, prominent style of Sofia's sketches (HAL-19142) for the Messenger box, the Ctrl+K search, Quick ask and the Studio chat on HAL-19132 (https://paperclip.halonic.com/HAL/issues/HAL-19132), 26 Nov 13:24 UTC.
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:Yuso+4327KcvEffykinsOquoBD8rCl0Fma7hIJtv+44pXFHpUDPNtGmz200LAlzjIfQzFCHWajzHaMswNpflCw==

## What changes

The new requirement `kit.prompt-look` draws the boxes where you type to an agent with 24px corners, a soft edge and shadow, and round buttons inside. Four requirements that shipped before it now defer to it:

- `kit.button` names the new `soft` variant and `prompt` size. A `prompt` icon button stays a 36px circle on a phone and under a coarse pointer, with a 48px hit area, instead of growing to 40px or 48px, so the prompt box doesn't grow.
- `kit.input` says an `Input` with `look="prompt"` takes the prompt's focus look (an accent edge and a deeper shadow) instead of the field's ring.
- `kit.palette-box` keeps the Dialog's fill, shadow, overlay and fade, but takes the prompt's corners and edge instead of the Dialog's radius.
- `kit.chat-composer` draws Send and Stop as round icons, so the button is named Send or Stop instead of reading the word. Its test now finds them by name (`aria-label`) instead of `textContent`; no assertion was removed.

## Why

The board asked for these boxes to read as "start here". Form fields keep their clear edge, as the board asked, so the change is limited to the prompt look.

## Covers

- kit.button
- kit.input
- kit.palette-box
- kit.chat-composer
