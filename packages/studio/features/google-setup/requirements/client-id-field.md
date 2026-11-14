# google-setup.client-id-field

- Status: active
- Since: 0.1.0
- Source: HAL-713 (C3); google-setup-flow (HAL-621) sections 4.1 and 5.1; ux-checklists (HAL-1019) section 3.1

The Google setup view shall show a "Client ID" field in step 5 and in step 6, for the same saved value. While typing continues it shall show no shape error; once typing has paused for 700 ms, or the field is left, a client ID that `isClientId` refuses shall show "A client ID ends in .apps.googleusercontent.com. Copy it from the client's page." as the reason **Save client ID** is `aria-disabled`, and a screen reader shall be told only when the field is left. When the text holds a Google client secret (`looksLikeGoogleClientSecret`), the field shall be emptied at once without keeping the text, shall say "That's the client secret. It goes in the field below.", and focus shall move to the secret field. **Save client ID** shall save a `client-id` edit and then mark step 5 done, and also step 6 when the secret is already saved; a step already done shall not be marked again. A saved client ID shall be shown in full, with **Copy** and **Change client ID**. When saving the ID fails, the field shall say "Couldn't save the client ID" with the reason and keep what was typed. When the ID is saved and only a step can't be ticked, the field shall empty and the checklist shall show "Couldn't save your progress" with the reason.

## Examples

- Given the text "1234-abc.apps.googleusercontent.com" typed,
  when you choose **Save client ID**,
  then "client-id" and then "step-done" for step 5 are saved.
- Given "1234-abc" typed and 700 ms of quiet,
  then the shape sentence is the reason **Save client ID** is `aria-disabled`.
- Given "GOCSPX-fake" pasted into the field,
  then the field is empty, the client secret sentence shows, and the secret field has focus.
- Given a client ID and a secret both saved earlier and step 6 not done,
  when you save a client ID,
  then step 5 and step 6 are marked done.
