# messenger.channel-waiting

- Status: active
- Since: unreleased
- Source: Sofia's flows HAL-17509 (flows G and K); Noah's wording table HAL-17514 (rows k13a and k14a) and HAL-18224 (one working); the phase 2 card approved by the board on HAL-17544 (24 Nov); HAL-18223.

Where a conversation is a channel, the Messenger's list shall show its row as "Engineering · 3 agents", and, while any of its members are working, "2 working · Elena, Liam" (or "1 working · Elena" for one). When an agent asks the person a question in a channel, Waiting for me shall list that channel with the oldest open question, "Elena asks you: Which hostname?", followed by "· +1 more" for each further one. The open channel shall show "2 waiting for you ▾ · Next" above its messages: ▾ lists the questions and **Next** moves to the next one's card. A question's card in a channel shall say "Also in your Inbox, asked in Engineering. Answering here answers it there.".

## Examples

- Given the channel "Engineering" with Chief, Elena and Liam, Elena and Liam working,
  when the person opens the Messenger,
  then its row says "Engineering · 3 agents" and "2 working · Elena, Liam".
- Given a channel where only Elena is working,
  when the person opens the Messenger,
  then its row says "1 working · Elena"; a channel where nobody is working says no working line.
- Given the same channel, where Elena asked "Which hostname?" and Liam then asked "Which port?",
  when the person opens Waiting for me,
  then its row says "Elena asks you: Which hostname? · +1 more".
- Given the same channel,
  when the person opens it,
  then it shows "2 waiting for you ▾ · Next", **Next** puts focus on the first question's card, and each card says "Also in your Inbox, asked in Engineering. Answering here answers it there.".
