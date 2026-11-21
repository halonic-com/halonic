# agent-host.remote-settings

- Status: active
- Since: unreleased
- Source: tunnel phase B build plan, decision 12 (HAL-12232); task HAL-12237

The agent host shall keep the person's remote switches, whether remote is on and "Let phones answer risky approvals", in a file in the profile that only the person may read, and both shall be off unless the person turned them on. When a switch changes, the agent host shall hold the change at once and then write it, so turning the risky switch off holds even when the write fails, and shall write nothing when nothing changed. If the file can't be read as the settings it wrote, then the agent host shall count both switches as off and say so on standard error.

## Examples

- Given a new profile, when the host starts, then remote and the risky switch are off.
- Given the risky switch turned on, when the host starts again, then it is still on.
- Given the risky switch on and a disk that refuses writes, when the person turns it off, then the change reports the failure and a phone's risky answer is refused at once.
- Given a settings file that isn't JSON, when the host starts, then both switches are off and the host says the file can't be read.
