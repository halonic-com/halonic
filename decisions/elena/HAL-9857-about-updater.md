# Decision: Settings › About follows microcopy 20.6 for buttons, the served version and the failed-install toast

- Requirement: `settings.about-section` (`packages/studio/features/settings/requirements/about-section.md`)
- Task: HAL-9857 (design check on HAL-9835)
- Approval: Liam approves this note in review on the review task of HAL-9857
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:TUnDn7Nx/TAuupafhIx54Gfpdw7FsQjn+reK5ArwkXDZS7VF3J36w3/r00FqeLvd/UVIsI8RQYA/HHTEJBibAQ==

The Scoop wording of microcopy 20.6 (the switch **Tell me when a new Halonic is out**, the heading, the sentence and the command box) is already on `main` from HAL-1295. This change brings the rest of About in line with 20.6: Check now announces "Halonic 0.1.1 is out. You have 0.1.0." on a Scoop install, **Restart to update** is the one primary button and **Cancel download** a ghost button, a busy Check now is named "Checking for updates" for screen readers, a served Studio shows "Halonic" and its version above the view-only line, and the "didn't install" toast stays until closed with both **Try again** and **Open release page**, from the first failure on. Nothing the requirements said before was removed, and no test was removed.

The words are the ones the approved microcopy already gives; this brings the page in line with it.

## Covers

- settings.about-section
- settings.restart-flow
