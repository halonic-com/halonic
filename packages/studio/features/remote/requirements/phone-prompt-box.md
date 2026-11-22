# remote.phone-prompt-box

- Status: draft
- Since: unreleased
- Source: HAL-12248 (tunnel design on HAL-12206, decision 6 and `s-m3`; strings table on HAL-12233, `phone.stale.promptReason`; D7 design on HAL-15159, section 2)

While the phone can't answer because it isn't connected, its prompt box shall be off with "Reconnect to send a prompt." in it. While it is connected, the prompt box shall show for the agent in view and send it a prompt that isn't blank and is at most 10,000 characters, once. A longer prompt shall keep Send off and say the limit. After a prompt the computer took, the box shall empty and say "Prompt sent."; after one it refused, didn't get or may not have got, the text shall stay and a line shall say what happened, without sending it again. After an answer to an approval the computer refused or may not have got, a line under Approve and Deny shall say so, without sending it again.

## Examples

- Given the phone can't reach the computer,
  when the Agents screen shows,
  then the prompt box is off with "Reconnect to send a prompt." in it.
- Given the phone is connected and Sorter is in view,
  when the person sends "Only the urgent ones",
  then the computer gets that prompt once, and the box empties and says "Prompt sent.".
- Given the connection dropped after an answer was sent and before the computer confirmed it,
  when the answer's outcome arrives,
  then the line under the buttons says the connection dropped and that the approval will show whether the answer arrived.
