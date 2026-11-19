# remote.settings-section

- Status: active
- Since: unreleased
- Source: HAL-12241; design "Tunnel phase B screens" (HAL-12206), decisions 1, 3, 5, 23 and 25, and the screens "Remote, nothing paired yet" and "When the connection has trouble"

Settings › Remote (scope: this computer) shall say what Remote is under its name: "See your agents, approve and send prompts from your phone. Your code stays on this computer." Its summary line shall be "Off" while remote is off (even with phones paired), and "On · no phone", "On · 1 phone" or "On · 2 phones" while it is on. The section shall show, in one box, the switch "Let phones reach this computer", the Connection line and the switch "Let phones answer risky approvals", each with its line from the design. The Connection line shall say "Nothing reaches this computer" and "Off" while remote is off, and the provider's name and the tunnel's state in a word while it is on. The risky switch shall work while remote is off. With no phone paired, the section shall show "No phones paired", say whether remote is off, and say that shell, files and secrets always stay on this computer. When a switch fails to change, the section shall say so under the box and announce it.

## Examples

- Given remote off and no phone paired,
  when the section shows,
  then the Connection line says "Nothing reaches this computer" and "Off", and the empty state says "Remote is off. Pair a phone to see your agents, approve and send prompts from it."
- Given the same section,
  when the person turns on "Let phones reach this computer",
  then the host turns remote on and the Connection line says "Ready".
- Given remote off,
  when the person turns on "Let phones answer risky approvals",
  then the host's switch is on and remote stays off.
- Given remote on with two phones,
  when the phone's Settings list shows Remote,
  then its line is "On · 2 phones".
