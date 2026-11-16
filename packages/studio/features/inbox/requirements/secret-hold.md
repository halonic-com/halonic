# inbox.secret-hold

- Status: active
- Since: 0.1.0
- Source: HAL-716 (C6); HAL-9823; google-setup-flow (HAL-621) 4.2; ux-checklists (HAL-1019) section 6; `findSecretShape` (HAL-1844)

When a note to the agent looks like a secret, the Ask for changes dialog shall hold it: **Send note** sends nothing, the text and focus stay in the **Note** field, and the field's description says what was found and where it belongs. A Google client secret reads "This looks like a Google client secret. Messages are kept in the run log. Put it in the secret field of the Google setup instead."; any other key reads "This looks like a secret key. Messages are kept in the run log. Put it in Providers instead." On a phone, the pointers end "…of the Google setup on your computer instead." and "…Put it in Providers on your computer instead." The line shall never repeat the text it found. **Send anyway** shall appear with the line and send the note as typed. For a Google client secret on a computer, **Go to the secret field** shall appear beside it and open the Google setup item at step 6 with the cursor in its empty secret field. With one Google account waiting for setup it opens that account's item; with several, the first that still needs a secret, else the first; with none, it opens New connector in the Library, where the secret is entered. The note is kept in memory, never saved, and is back in the card when you return to it, so the secret can be cut from it. A phone shows the line that sends it to its computer and no button. Changing the note clears the line and the button, and a note without a secret sends as before. The held note is kept only in the card's memory, as any note is: nothing saves it as a draft.

## Examples

- Given the Ask for changes dialog,
  when you type a note with a Google client secret in it and press Send note,
  then nothing is sent, the note keeps its text and focus, and the Google line shows with **Go to the secret field** and **Send anyway**.
- Given the same held note and one Google account waiting for setup,
  when you press **Go to the secret field**,
  then that account's item opens at step 6 with the cursor in its empty secret field, and the note is still in the card when you come back to it.
- Given the same held note,
  when you press **Send anyway**,
  then the note is sent as typed.
- Given the same held note,
  when you delete the secret,
  then the line and **Send anyway** are gone, and Send note sends the rest.
- Given a note with an AI provider key in it,
  when you press Send note,
  then the line points to Providers.
- Given the note "We use sk-learn for this",
  when you press Send note,
  then it is sent.
