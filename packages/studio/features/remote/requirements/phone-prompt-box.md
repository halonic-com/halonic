# remote.phone-prompt-box

- Status: draft
- Since: unreleased
- Source: HAL-12248 (tunnel design on HAL-12206, decision 6 and `s-m3`; strings table on HAL-12233, `phone.stale.promptReason`; D7 design on HAL-15159, section 2; flow check C672 on HAL-16097; readable reason, C673 on HAL-16111)

While the phone can't answer because it isn't connected, its prompt box shall be drawn as off, with "You can send a prompt once your phone reconnects." written under it in readable text, and shall stay focusable and point at that line. While it is connected, the prompt box shall show for the agent in view and send it a prompt that isn't blank and is at most 10,000 characters, once. A longer prompt shall keep Send off and say the limit. After a prompt the computer took, the box shall empty and say "Prompt sent."; after one it refused, didn't get or may not have got, the text shall stay and a line shall say what happened, without sending it again. After an answer to an approval the computer refused or may not have got, a line under Approve and Deny shall say so, without sending it again.

## Examples

- Given the phone can't reach the computer,
  when the Agents screen shows,
  then the prompt box is off with "You can send a prompt once your phone reconnects." under it, and focusing the box reads that line.
- Given the phone is connected and Sorter is in view,
  when the person sends "Only the urgent ones",
  then the computer gets that prompt once, and the box empties and says "Prompt sent.".
- Given the connection dropped after an answer was sent and before the computer confirmed it,
  when the answer's outcome arrives,
  then the line under the buttons says the connection dropped before the computer confirmed the answer, and that once the phone reconnects the person will see whether it arrived.
- Given the connection dropped after a prompt was sent and before the computer confirmed it,
  when the prompt's outcome arrives,
  then the text stays and the line says the connection dropped before the computer confirmed the prompt, that once the phone reconnects the person will see in the agent's messages whether it arrived, and to send it again only if it didn't.
