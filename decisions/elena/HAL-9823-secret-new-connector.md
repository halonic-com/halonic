# Decision: Go to the secret field opens New connector when no Google account is waiting

- Task: HAL-9823 (follow-up to HAL-716, HAL-9810)
- Approval: Paperclip task HAL-9823 (it follows the approved P8 design and adds no new wording)
- Kind: user-visible

With no Google account waiting for setup, **Go to the secret field** now opens New connector in
the Library. Before, it opened the Library and left the person to find where a connector is added.

## What changes

- `inbox.secret-hold`: the sentence "with none, it opens the Library, where a connector is added"
  now reads "with none, it opens New connector in the Library, where the secret is entered". The
  `Source` line adds HAL-9823.
- The Library gets a command, `library.new-connector`, that shows the Connectors tab and opens
  New connector (the P8d request path, nothing filled in). The Inbox runs it by id, as it can't
  import the Library.
- With one or more Google accounts waiting, nothing changes. The note is still kept in the card.

## Why

The Connectors view with New connector now exists (#3144), so the button can take a person to the
place a connector is made instead of the Library's front. Nothing is guessed: no name and no way
is filled in. Every other sentence and example stays, and no test is loosened or deleted; the one
test that expected `openPlace("library")` now expects New connector to be opened.

## Covers

- inbox.secret-hold
