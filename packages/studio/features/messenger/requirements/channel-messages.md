# messenger.channel-messages

- Status: active
- Since: unreleased
- Source: Sofia's flows HAL-17509 (flows I and J, choices K2 and K3); Noah's wording table HAL-17514; the phase 2 card approved by the board on HAL-17544 (24 Nov); HAL-17631.

Where a conversation is a channel, the Messenger shall say above the box who a message goes to before it is sent: "To Chief (lead) · Type @ to ask someone else" while nobody is named, and "To Elena" or "To Elena and Liam" once the person names agents. Typing `@` shall open a picker of the channel's members, and a picked member shall show as a chip that can be removed. Under each of the person's messages it shall show one work line per agent the message went to, each with a symbol and words: "◔ Elena · starting…", "◔ Elena · working · 4 min", "✓ Elena answered", "! Elena asks you: …", "✕ Elena's task was closed without an answer." and "→ Chief passed this to Liam", and "Stopped after 3 hand-offs. Name who should answer." once a message was passed on 3 times.

## Examples

- Given a channel "Engineering" with Chief as its lead and nobody named,
  when the person opens it,
  then the box says "To Chief (lead) · Type @ to ask someone else".
- Given the same channel,
  when the person names Elena and then Liam,
  then the box says "To Elena and Liam", and removing both chips brings back "To Chief (lead) · Type @ to ask someone else".
- Given a message of the person's whose work is starting for Elena, working for 4 minutes for Liam, answered by Owen, asking the person "Which hostname?" from Chief, closed for Writer and passed on from Chief to Liam,
  when the channel shows it,
  then each of the six lines shows with its symbol and words.
