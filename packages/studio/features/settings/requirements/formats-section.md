# settings.formats-section

- Status: active
- Since: 0.1.0
- Source: HAL-1294 (T11); flow-settings 5 (HAL-646); ux-checklists-t4-t5-t11 3.10 (HAL-1185)

The Studio shall show Settings → Formats with one Format choice, listing the options of `settings.formats-format`, and an example of a number and a date in the chosen format under it. A pick shall be saved by itself, and shall change the example at once. When a save fails, the Studio shall put the format from before back, say "Couldn't save the format on this computer." under the choice, and say it in the dialog with what the format is back to, never in a toast.

On the phone's own Settings page (served Studio, flow-settings 13 and mc 13.2), the first option shall read "Follow this phone: …", the choice shall open the phone's picker sheet, which has a search field for the format names, and a failed save shall put the format from before back and say "Couldn't save the format on this phone." and what the format is back to in a toast, not under the choice.

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
- Given Formats shows on the phone's Settings page,
  when the user taps Format,
  then a picker sheet opens with a search field, and its first option reads "Follow this phone: English (United Kingdom)".
- Given saving fails on the phone's Settings page,
  when a format is picked,
  then a toast says "Couldn't save the format on this phone." with "Format is back to …", and nothing shows under the choice.
