# app.run-proposal-accept-reject-change

- Status: active
- Since: 0.1.0
- Source: engine answer 2 on HAL-3267 ("per change through `revertParts`"); Elena's `revertParts` and `describeItemChange` (HAL-3278); AI changes 2; HAL-3248

When the person accepts one change on an item page of a file a run modified (a line `describeItemChange` gives from the saved file to the run's text less what was rejected, with the item paths it covers), the proposal service shall set those paths in the saved file to the run's values, through a write that expects what the saved file held. When the person rejects one change, it shall set those paths in the run's text back to the saved file's values and leave the saved file alone. Both shall keep the rest of each text, its comments and formatting as they are. If the texts changed since the change was shown, or its item paths change nothing, it shall change nothing and say the changes are stale. If the change has no item paths, or a text can't be read as YAML, it shall change nothing and say the change can't be decided on its own. Otherwise it shall behave as for one part.

## Examples

- Given run `01JD8Q` changed the name and the model of agent `clerk`,
  when the person accepts the model change,
  then the saved file has the run's model and its own name, with its comments kept, and the only change left is the name.
- Given the same,
  when the person rejects the model change,
  then the saved file is unchanged and the only change left is the name.
- Given a change with no item paths,
  when the person accepts it,
  then nothing changes and the answer is that it can't be decided on its own.
