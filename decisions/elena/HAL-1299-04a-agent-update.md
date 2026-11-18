# Decision: the app's agents host also changes an agent's name, description and instructions

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11705 (Liam approved the T6 plan, whose PR 4 builds the Configuration pages on a host `update` method)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:DAQ7FyebF9tDHwVjG3ogmAz2a69tq5LJQA+zmCAhWMUDDHUDRhr94BOGaU5ZMdLG+2+LCSX0nIWfyT8/US2PBw==

`AgentsHost` gains `settings` and `update`, and `WorkspaceAgents` implements them, so `studio.workspace-agents`
(Source and the requirement sentence) grows by one promise: it changes an agent's name, description or
instructions by editing its file in place, as one undoable change that typing in one field coalesces, and
refuses an empty name or a missing agent without writing. Nothing existing is removed or weakened: the
earlier promises (read, create, `referencesTo`, subscribe) and their tests stay as they were. Two examples
and their tests are added.

## Covers

- studio.workspace-agents
