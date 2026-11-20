# agents.configuration.more-settings

- Status: draft
- Since: unreleased
- Source: HAL-13178 (T6); flow-agents 5.2 ("model settings (temperature, top-p, max tokens, stop, reasoning effort) folded under "More settings""); save model 1.2; UX checklist T6 part 2, 2.5 (T6-F24)

The agents feature shall show, on the Model page after the model call limit, a folded "More settings" row that names the settings the agent's file sets, and that opens Temperature, Top-p, Max tokens, Stop and Reasoning effort. Each shall save by itself with no Save button: a number after a pause in typing and when the person leaves the field, Stop as one sequence per line without the empty lines, and Reasoning effort when it is picked. An empty box, or "Model's default", shall take the setting out of the file. A temperature that isn't a number from 0 to 2, a top-p that isn't a number from 0 to 1, or max tokens that aren't a whole number above 0 shall not be saved, and the field shall say "Enter a number from 0 to 2.", "Enter a number from 0 to 1." or "Enter a whole number above 0.", read once by a screen reader when it shows, even while the person is still in the box, and each such box, or one whose save failed, shall count as a field not saved for the toolbar's "1 field not saved" until it is fixed or saved or the page is left. A box shall keep what was typed while it reads as the saved value.

## Examples

- Given an agent whose file sets the temperature 0.2 and the stop sequence END, then More settings is folded and its row says "Temperature, Stop", and Temperature shows 0.2 when it is opened.
- Given the person types 0.9 in Top-p and 800 in Max tokens and pauses, then both are saved; given they empty Temperature, then the file has no temperature.
- Given the person types 3 in Temperature, 1.5 in Top-p or 2.5 in Max tokens, then nothing is saved and each field says what to enter.
- Given the person types 3 in Temperature and pauses, then a screen reader reads "Temperature: Enter a number from 0 to 2." once, and not again when they leave the box.
- Given the person types 3 in Temperature and 2.5 in Max tokens, then the toolbar says "2 fields not saved"; fixing both brings it back.
- Given the person types 0.50 in Temperature and pauses, then 0.5 is saved and the box still shows 0.50.
- Given the person types END, an empty line and STOP in Stop, then the stop sequences END and STOP are saved.
- Given the person picks High in Reasoning effort, then it is saved at once; picking Model's default takes it out of the file.
