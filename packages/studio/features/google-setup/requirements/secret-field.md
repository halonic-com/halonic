# google-setup.secret-field

- Status: active
- Since: 0.1.0
- Source: HAL-713 (C3); google-setup-flow (HAL-621) sections 4.1 and 4.2; ux-checklists (HAL-1019) section 3.2; build plan D1 and D6; security review (HAL-705) A7

The Google setup view shall show the client secret as a write-only field. The input shall be masked, with no show button, no copy button, no spell check and no autofill, and its value shall stay in the input only: not in component state, an edit or a record. Spaces around a pasted value shall be dropped, and Enter shall save. The status shall say "Not saved", or "Saved" with the date and nothing else about the value: no preview, length or hash. **Save secret** shall send the value to the host's secret save, on its own request, and while it runs the button shall be busy ("Saving…"), not disabled. When the save succeeds the input shall be emptied, and when the client ID is saved too, step 6 shall be marked done. When it fails the typed value shall stay, the field shall say "Couldn't save the secret. Nothing was saved." with **Try again**, focus shall stay in the field, and no text on the screen shall hold the value. The hint shall say "Kept encrypted on this computer. Halonic can't show it." and, when the host says another computer keeps it, "Kept encrypted on the computer that runs Halonic. Halonic can't show it.". When the host says the page is served over plain http, the first save shall ask first, with **Cancel** focused. Where the host has no field, step 6 shall say "Connecting Google needs the desktop app or `halonic serve`." in the browser demo, and "Save the client secret on the computer that runs Halonic." without a password, with the command line only when the host says the command exists.

## Examples

- Given a fake secret typed with spaces around it,
  when you press Enter,
  then the host's secret save gets the trimmed value, the input is empty and the status says "Saved".
- Given the secret save rejects,
  when you choose **Save secret**,
  then the input keeps the value, "Couldn't save the secret. Nothing was saved." shows, and no text on the screen contains the value.
- Given a saved secret,
  then the field shows "Saved" with the date, "Kept encrypted on this computer. Halonic can't show it.", and no input.
- Given a served Studio over plain http,
  when you choose **Save secret**,
  then a question opens with **Cancel** focused, and nothing is sent until you confirm.
