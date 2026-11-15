# Decision: a held Google secret gets a Go to the secret field button

- Approval: Paperclip task HAL-1019, UX checklists section 6 (U13 to U15), the user's approved list for HAL-716
- Kind: user-visible

When the Ask for changes dialog holds a note that looks like a Google client secret, a computer now
shows **Go to the secret field** beside **Send anyway**. Before, the held note only said where the
secret belongs.

## What changes

- The button opens the Google setup item at step 6 with the cursor in its empty secret field.
  When Google has refused the saved secret, the cursor goes to the new-secret field.
- Which account opens (U13): with one account waiting for setup, that account's item. With several,
  the first that still needs a secret, else the first. With none, the Library, where a connector
  is added.
- The note stays (U14): it is kept in the card's memory, never saved, and is back in the card
  when you return, so the secret can be cut from it. The button shows only when there is
  somewhere to go. A phone shows no button.
- `inbox.secret-hold` gains the button, the account choice and the note's return. Its first example
  now shows the button, where it said the line had no pointer while step 6 had no body. That
  example is replaced because step 6 has its body now (HAL-713). A new example covers the button.

## Why

A person who pastes a secret into a note is told to put it in the Google setup, but has to find the
field alone. The button takes them to the field and keeps their note, so they cut the secret out
of it and send the rest. Apart from the replaced example, every earlier sentence and example of
the requirement stays, and no test is loosened or deleted.

## Covers

- inbox.secret-hold
