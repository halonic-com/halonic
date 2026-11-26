# messenger.card-web-link

- Status: active
- Since: unreleased
- Source: board report on HAL-10 via HAL-19362 ("Approval cards should have shadow and I should be able to open the link to it"); plan approved by Liam on HAL-19367

When an open card in a chat has a `webLink`, the Messenger shall show one link under it, "Open in _site_", that opens outside the app through the shell's external-link opener. The link shall go to the card's `answerElsewhere` link when it has one, else to its `webLink`, so a card never shows two page links. A card without a `webLink` shall show no such link. Every card shown in a chat, including one that asks several questions, shall carry the kit's `shadow-1` elevation.

## Examples

- Given Chief's open card "Merge #12?" with the `webLink` `https://paperclip.acme.test/ACME/issues/ACME-7` and the site "Paperclip",
  when the chat is opened,
  then the card has one link "Open in Paperclip" to that page, and the card has `shadow-1`.
- Given a card with both `answerElsewhere` and `webLink`,
  when the chat is opened,
  then its one "Open in Paperclip" link goes to the `answerElsewhere` page.
- Given a card without a `webLink`,
  when the chat is opened,
  then it has no "Open in" link.
