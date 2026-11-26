# remote.phone-saved-messaging

- Status: draft
- Since: unreleased
- Source: HAL-18901 (phase 2 G3b, architecture note on HAL-17511, section 2.4)

The phone shall save, for each paired computer, the last sources, inbox items and conversations it read, the newest 200 messages of each conversation it opened and the person's drafts, with the time it last saw them, so it can show them while the computer is away. It shall save nothing else: no agent's activity, no team status, no key and no session. It shall keep the saved text within 20 MB in UTF-8 by dropping the oldest conversations first, a conversation's age being when its last message came. It shall delete everything saved for a computer on Forget and when the computer removes the phone, and, for one source, everything saved of it when that source leaves the computer's list of sources. It shall delete saved text it can't read.

## Examples

- Given a phone that read the inbox of a computer,
  when the person forgets that computer,
  then nothing is saved for it any more.
- Given saved conversations of two sources,
  when the computer lists only one of them,
  then only that source's lists, messages and drafts stay saved.
- Given saved conversations that fill more than 20 MB,
  when one more conversation is saved,
  then the oldest conversations are dropped first and the text fits 20 MB.
- Given a conversation with 250 messages,
  when the phone saves it,
  then it keeps the newest 200.
