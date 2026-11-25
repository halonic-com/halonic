# messenger.channel-create

- Status: active
- Since: unreleased
- Source: Sofia's flows HAL-17509 (flows G and H); Noah's wording table HAL-17514; the phase 2 card approved by the board on HAL-17544 (24 Nov); HAL-18124.

The Messenger shall offer **New ▾** above its list, with New channel and Browse channels. New channel shall take a name, 2 to 8 agents of one source and a lead, and **Create channel** shall stay off, with a line that says why, while fewer than 2 agents are picked ("Pick at least 2 agents."), while the source is offline ("You can make a channel when Paperclip · Acme answers again."), and while another channel of the source has the name ("There's already a channel called Engineering."). With 8 picked, the other agents can't be picked and it says "A channel can have up to 8 agents. · 8 of 8 picked". A channel it made opens in the list. Browse channels shall list each source's channels the person isn't in, each with **Join**, and say "No other channels in Paperclip · Acme." when there are none; a joined channel opens in the list.

## Examples

- Given Acme with Chief, Liam and Elena,
  when the person opens New channel and picks only Chief,
  then **Create channel** can't be pressed and the dialog says "Pick at least 2 agents.".
- Given Acme with 9 agents,
  when the person picks 8 of them,
  then the ninth can't be picked, **Create channel** can be pressed, and the dialog says "A channel can have up to 8 agents. · 8 of 8 picked".
- Given Acme with a channel "Engineering" the person isn't in and a channel "Design" they are in,
  when the person opens Browse channels,
  then it lists Engineering and not Design, and after **Join** Engineering is in the Messenger's list.
