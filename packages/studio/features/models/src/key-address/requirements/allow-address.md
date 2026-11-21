# models.key-address.allow-address

- Status: draft
- Since: unreleased
- Source: HAL-11873 (PR 3b, HAL-15128); UX checklist on HAL-11873, rows C-1 to C-11, C-15, C-20 and X-1 to X-6; design on HAL-11343

When the open folder's engine asks whether a provider may send a stored key to an address that isn't on the key's list, the models feature shall show "Allow this address?" over any page as an `alertdialog`: the provider and the key's name, the address in the form it is saved in as one selectable line that is never cut, the key's current addresses or "This key has no address yet.", the warning and the scope line, and **Don't allow** before **Allow this address**, with focus on **Don't allow**. **Allow this address** shall save only through the engine's own save, which adds the address the engine was refused, and answer "allowed" only once it is saved; when the save fails, the dialog shall stay open with "Couldn't save this address. The key was not sent. Try again, or add the address on the Models page." **Don't allow**, Escape and closing the dialog shall all answer "not-allowed". Several questions shall show one at a time in the order they came, the title adding "(1 of 2)" only when more are waiting. A question whose wait ends (the run is stopped, or 10 minutes pass) shall go away without an answer. Nothing in the dialog shall time out on its own, and no text in it shall hold the key's value.

## Examples

- Given the engine asks about provider "Gateway", key "gateway-key" and `https://gateway.example.com`, and the key may go to `https://api.example.com`,
  when the dialog shows,
  then it reads "Gateway wants to send the key "gateway-key" to:", then `https://gateway.example.com`, then "This key is currently allowed for https://api.example.com.", and focus is on **Don't allow**.
- Given that dialog, when the person presses Escape, then the engine hears "not-allowed" and nothing is saved.
- Given that dialog, when the person presses **Allow this address** and the save succeeds, then the engine hears "allowed" and the dialog closes.
- Given the save fails, then the dialog stays open with the failure line, the engine hears nothing yet, and **Don't allow** still answers "not-allowed".
- Given two questions waiting, then the title is "Allow this address? (1 of 2)", and the second shows once the first is answered.
