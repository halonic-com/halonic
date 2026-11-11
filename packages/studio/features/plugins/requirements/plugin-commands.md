# plugins.plugin-commands

- Status: active
- Since: 0.1.0
- Source: HAL-1740; plugin screens design section 8.1 (HAL-1739); microcopy 24 T14 (HAL-751); UX acceptance checklist 7 and G5 (HAL-1952, HAL-1959)

The Studio shall show a plugin command in a dialog with the command's title, the line "From the *name* plugin · uses the tool *tool*, which reads", the command's form with the kit part for each type, and the buttons Cancel and Run command, whatever the command is called. When the person presses Run command with a required field empty or a value of the wrong kind, the Studio shall say what to do under each such field, focus the first and call nothing. When the tool answers, the Studio shall show its answer as plain text, sanitised Markdown or a table in a Result box with Copy, and the buttons shall become Run again and Close. If the call fails, then the Studio shall say "Couldn't run *title*: *reason*." with Try again and keep what was typed. A command without a form shall run as soon as its dialog opens.

## Examples

- Given the Weather plugin's command "Show the forecast" with the required field Place,
  when the person presses Run command with Place empty,
  then "Fill this in." shows under Place, Place has focus and the tool isn't called.
- Given the person typed "Ghent" in Place,
  when the tool `forecast` answers,
  then the Result box shows its answer and the buttons read Run again and Close.
- Given the tool fails with "the service didn't answer",
  when the person pressed Run command,
  then the dialog says "Couldn't run Show the forecast: the service didn't answer." with Try again, and Place still reads "Ghent".
- Given a command called "Delete everything",
  when its dialog opens,
  then its button reads Run command.
