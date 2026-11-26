# messenger.activity-panel

- Status: active
- Since: unreleased
- Source: the activity-panel document on HAL-18558 (revision 3), approved by the board on 25 Nov, 13:42 UTC; built on HAL-18567 (PR 2 of 4: wide windows, the working and ended states).

While a direct chat is open in a window at least 1200 px wide and an agent host serves the agents' activity, the Messenger shall show the chat agent's activity panel, "Chief's activity", beside the chat: open by default, then as the person last left it on this computer, and never opened or closed by itself. The chat header's button (**Ctrl+I**) opens and closes it; closing it puts focus back on the button. While the panel is closed and the agent works, the button shows a still dot and the chat's working line offers **Show activity**.

The panel shall show, from the agent's runs since local midnight and the pull requests, read every 15 seconds while it is open and every 30 while it is closed:

- while a run is going: "Working · for 7 min", "Last activity just now" or "Last activity 12 min ago" (in the attention colour after 10 minutes without activity), the task's identifier and title, or "This chat · Answering you" with the chat's title when the run answers this chat, "Started 14:02 · run 3f9c2a", and the pull requests whose branch names the run's task, each with its state;
- while a run is queued: "Starting · queued at 14:02" and the task;
- once the run ended: "Idle · finished 14:09", or "Stopped with an error · 14:09" for a failed run, and under **Last run** the task with Done, Failed or Stopped, "14:02–14:09 · 7 min" and its pull requests;
- with no run today: "Idle".

It shall never show a run's log, output, error text or the agent's own words. When its first read fails it shall say "Couldn't read Chief's activity" with **Try again**; when a later read fails it shall keep what it showed under "The engine isn't answering. Showing what it said last.".

## Examples

- Given Chief started a run on ACME-7 "Ship the site" 7 minutes ago, with pull request #12 approved,
  when the person opens Chief's chat in a wide window,
  then the panel "Chief's activity" shows "Working · for 7 min", "ACME-7", "Ship the site" and "#12 … Approved".
- Given Chief's run answers this chat,
  when the panel shows it,
  then its task card says "This chat" and "Answering you".
- Given the panel is open,
  when the person closes it,
  then it is gone, the header button is focused and not pressed, and while Chief works the button shows its dot and the working line offers **Show activity**.
- Given Chief's last run failed at 14:09,
  when the panel shows it,
  then it says "Stopped with an error · 14:09" and "Failed".
