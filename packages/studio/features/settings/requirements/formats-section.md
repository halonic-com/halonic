# settings.formats-section

- Status: active
- Since: 0.1.0
- Source: HAL-1294 (T11); flow-settings 5 (HAL-646); ux-checklists-t4-t5-t11 3.10 (HAL-1185)

The Studio shall show Settings → Formats with one Format choice, listing the options of `settings.formats-format`, and an example of a number and a date in the chosen format under it. A pick shall be saved by itself, and shall change the example at once. When a save fails, the Studio shall put the format from before back, say "Couldn't save the format on this computer." under the choice, and say it in the dialog with what the format is back to, never in a toast.

## Examples

- Given the stored format is "follow" and the browser's language is `en-GB`,
  when Formats shows,
  then the choice reads "Follow this browser: English (United Kingdom)" in a browser
  and the example reads "45.00 · Mon 9 Nov, 08:00".
- Given Formats shows,
  when "Dutch (Netherlands)" is picked,
  then `nl-NL` is saved and the example reads "45,00 · ma 9 nov, 08:00".
- Given saving fails,
  when a format is picked,
  then the dialog says "Couldn't save the format on this computer. Format is back to …".
