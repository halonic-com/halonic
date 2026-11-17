# studio.src-tauri.crates.trust-grant.instruction-trust-grants

- Status: draft
- Since: unreleased
- Source: HAL-10515 (the shell's `instruction_trust_*` commands, for HAL-10513); the wording is a small text that builds on the approved "Trust this folder?" dialog, decided by the team on HAL-10515

The shell shall save the instructions a person trusted for an agent only after it asked them itself in a native dialog, never on the page's word. The question shall name the agent and its workspace and list the files added, removed and changed since the pin saved for the same agent, or say it is the first time, or say that what they trusted before can't be read, so what changed can't be listed. The agent, the workspace and every file name shall be shown as the folder question shows a path: control, invisible and text-direction characters written out, a long one shortened in the middle. At most ten files shall be named for each kind of change, and the rest counted. A yes shall save the record; a no shall refuse as `declined` and save nothing; a second question while one shows, of any kind, shall refuse as `busy`; a record that isn't trusted instructions shall refuse as `invalid_record` before anything is asked. A saved record that can't be read shall not stop the save.

## Examples

- Given nothing saved for the agent `coder` in `/workspaces/acme`,
  when the page saves its instructions,
  then the question names `coder` and `/workspaces/acme` and says it is the first time, and the record is saved only when the person says yes.
- Given a saved pin with `AGENTS.md` and `skills/old.md`,
  when the page saves a pin with `AGENTS.md` changed and `skills/new.md` added,
  then the question lists `skills/new.md` as added, `skills/old.md` as removed and `AGENTS.md` as changed.
- Given the shell is showing a question,
  when the page saves instructions for another agent,
  then the save is refused as `busy` and nothing is asked.
