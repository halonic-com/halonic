# messenger.activity-idle

- Status: active
- Since: unreleased
- Source: the activity-panel document on HAL-18558 (revision 3), approved by the board on 25 Nov, 13:42 UTC; built on HAL-18567 (PR 3), with Julian's review of halonic#6310.

Building on `messenger.activity-panel`, the activity panel shall show under **Next** up to 3 open tasks the chat's agent holds, newest first and without the task its run shows, each with its title and "ACME-9 · To do". Once the agent's run ended, the panel shall say "Idle · finished 14:05" for 10 minutes and "Idle · last run ended 13:41" after that, and list under **Earlier today** up to 3 of the agent's other runs that started today, newest first, each with its outcome dot (a stopped run in the attention colour, its outcome in words for a screen reader), its task, its start and its length.

It shall read out once, in its polite status region, when the agent's run starts ("Liam started: ACME-9 Ship the site") and when it ends ("Liam finished: ACME-9 Ship the site"), never on the panel's first read. **Ctrl+I** shall not open or close the panel while focus is in a text field, such as the message box.

## Examples

- Given Liam's last run ended at 13:41, he ran ACME-5 at 11:02 for 9 minutes, and he holds ACME-9 "Review the pricing page",
  when the person opens Liam's chat at 14:09,
  then the panel says "Idle · last run ended 13:41", lists "Review the pricing page" and "ACME-9 · To do" under **Next**, and "ACME-5 Ship the site" with "11:02 · 9 min" under **Earlier today**.
- Given Liam was idle,
  when his run on ACME-9 starts,
  then "Liam started: ACME-9 Ship the site" is read out once.
- Given the person types in the message box,
  when they press Ctrl+I,
  then the panel stays as it was.
