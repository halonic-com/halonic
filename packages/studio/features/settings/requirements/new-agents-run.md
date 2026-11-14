# settings.new-agents-run

- Status: active
- Since: 0.1.0
- Source: HAL-9451 (HAL-9385 B12); flow-settings 9.1 (HAL-646); ux-checklists-t4-t5-t11 3.15 and 3.16 (HAL-1185)

The Settings feature shall show, in Agent sandbox, the first line "Agents run in a sandbox unless you choose otherwise. There they can only write to their working folder, and the network is off." and under the status a Select **New agents run** with **In a sandbox (recommended)** and **On this computer**, saved at once as the host setting `sandbox.new-agents`, with the hint "Each agent can be changed on its Harness page. This applies on this computer only.". A value that can't be read shall read as the sandbox. Picking **On this computer** shall save nothing and open the dialog "Run new agents on this computer?" with **Cancel** focused and **Run new agents on this computer** in `danger`; **Cancel** or Escape shall close it, keep the Select on its saved value and return focus to the Select; confirming shall save the choice. When the save fails, the Select shall keep its value and say "Couldn't save where new agents run on this computer.". In served Studio the Select shall be unavailable and the hint shall read "View only here. Change where agents run on the computer running Halonic.". Agents that already exist shall keep their setting.

## Examples

- Given nothing is saved,
  when the section opens,
  then **New agents run** reads "In a sandbox (recommended)".
- Given the person picks **On this computer**,
  when the dialog opens,
  then nothing is saved until **Run new agents on this computer** is pressed, and **Cancel** leaves the Select on "In a sandbox (recommended)".
- Given the saved value is "elsewhere",
  when the section opens,
  then **New agents run** reads "In a sandbox (recommended)".
- Given Studio is served to another device,
  when the section opens,
  then the Select is unavailable and the view-only hint shows.
