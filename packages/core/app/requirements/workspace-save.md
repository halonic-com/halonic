# app.workspace-save

- Status: active
- Since: 0.1.0
- Source: old `Studio.save`

The kernel shall keep every unsaved change in one map by file path, and reading a file shall give its unsaved text. When the user saves, the kernel shall write each changed file and delete each file marked for deletion through the `DefinitionStore`, then clear the map. If a write fails, then every change shall stay unsaved. If a file is changed again while a save runs, then its new text shall stay unsaved. If a save is asked for while another runs, then it shall wait for that one and then save what is left. If the unsaved changes are discarded while a save runs, then nothing the save wrote shall come back as unsaved. If nothing is unsaved, then saving shall write nothing and send nothing.

## Examples

- Given an unsaved change to `hubs/p/workflows/f.workflow.yaml`,
  when the user saves,
  then the store holds the new text and nothing is unsaved.
- Given a new agent file that was then edited,
  when the user saves,
  then the store holds the edited text.
- Given a file marked for deletion,
  when the user saves,
  then the store no longer has it.
- Given two changed files where writing the second fails,
  when the user saves,
  then the save fails and both changes are still unsaved.
- Given a change and a save in progress,
  when the same file is changed again before the save ends,
  then the second text is still unsaved afterwards.
- Given a save in progress and a change to another file,
  when the user saves again before the first save ends,
  then each file is written once and `files.saved` is sent once per save.
- Given a save in progress of a change to `a.yaml`,
  when the user discards the unsaved changes before the save ends,
  then nothing is unsaved afterwards and the next save writes nothing.
- Given nothing unsaved,
  when the user saves,
  then nothing is written and no event is sent.
