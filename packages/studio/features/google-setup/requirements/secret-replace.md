# google-setup.secret-replace

- Status: active
- Since: 0.1.0
- Source: HAL-713 (C3); google-setup-flow (HAL-621) section 4.3; ux-checklists (HAL-1019) section 3.2; security review (HAL-705) A7

Once the client secret is saved, the Google setup view shall offer **Replace secret**, with a link to the client's page in Google Cloud, which opens an empty write-only field with **Save new secret** and **Cancel** and puts focus in it. Under the field it shall say "The saved secret stays in use until Google accepts the new one.", or, when the setup hasn't been signed in yet, "Not signed in yet, so the new secret replaces the old one now. Step 7 checks it.". **Save new secret** shall send the trimmed value to the host's replace, on its own request, and be busy while it runs. When Google accepted it, the field shall close and say "Google accepted the new secret. Halonic deletes the old secret and stops using it. You can disable the old one in Google Cloud once every account using it has the new one.", and when the client is shared it shall add "Used by *x@example.com* and *y@example.com*, both now on the new secret.". When it was replaced straight away it shall say "Saved the new secret. Step 7 checks it.". When Google refused it, the field shall stay open with the typed value and say "Google didn't accept this secret. Your old secret is still saved and in use.". With no network it shall say "Couldn't reach Google to check the new secret. The old one is still in use. Try again when you're online." with **Try again**. When the engine can't do it, the field shall say "Couldn't save the secret. Nothing was saved.". **Cancel** shall empty the field and close it. When Google refused the saved secret (**Needs new secret**), step 6 shall open with the new-secret field already open. No text, console method or edit shall hold the value. The wording shall never say the secret is removed from this computer.

## Examples

- Given a saved secret and a fake new secret typed with spaces around it,
  when you choose **Save new secret** and Google accepts it,
  then the host's replace gets the trimmed value, the input is gone and "Google accepted the new secret." shows.
- Given Google refuses the new secret,
  when you choose **Save new secret**,
  then the input keeps the value and says "Google didn't accept this secret. Your old secret is still saved and in use.".
- Given a setup that hasn't been signed in yet,
  when you choose **Replace secret**,
  then the field says "Not signed in yet, so the new secret replaces the old one now. Step 7 checks it.".
- Given an account whose saved secret Google refused,
  when step 6 opens,
  then the new-secret field is open.
