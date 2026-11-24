# assistant.build.newer-proposal-replaces-open-one

- Status: active
- Since: unreleased
- Source: HAL-16799 (T14 PR 8b); req-assistant (HAL-110); flow-assistant 3.3 and 4.3 (HAL-647)

When a file still has changes to review from a card and the Build chat changes that file again, so a newer card covers everything still to review in it, the earlier card shall replace its actions with the `neutral` chip **Replaced** and the line "A newer change to this file is below." with **Go to it**, which moves focus to the newer card's Review. When the newer card is in another chat, the line shall be "A newer change to this file is in another chat.", **Go to it** shall open that chat at its card, and the earlier chat's model shall be told "(Another chat changed *path*. Its card now covers these changes.)". When focus wasn't in the earlier card, the change shall be announced. A card already decided shall keep its state.

## Examples

- Given a card with changes to review for `hubs/sales/workflows/triage.workflow.yaml`, when the model changes that file again,
  then the earlier card reads "Replaced" with "A newer change to this file is below." and Go to it.
- Given that card, when the person clicks Go to it, then focus is on the newer card's Review.
- Given an accepted card for that file, when the model changes it again, then the card still reads "Accepted".
