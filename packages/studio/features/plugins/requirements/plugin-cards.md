# plugins.plugin-cards

- Status: active
- Since: 0.1.0
- Source: HAL-1740; plugin screens design section 8.2 and decision D3 (HAL-1739, HAL-1801); microcopy 24 T15 (HAL-751); UX acceptance checklist 8 (HAL-1952); T16-F22, F23 and F35

The Studio shall add Home's Cards section with every card of every installed plugin, and shall leave the section out while no plugin has a card. Each card shall show the card's title, the footer "From the *name* plugin", and, while its plugin is on, its tool's answer as plain text, sanitised Markdown or a table. While the answer loads, the title and the footer shall already show. When the person presses ↻, named "Refresh *title*", the Studio shall call the card's tool again. If the call fails, then the card shall say "Couldn't get *title*: *reason*." with Try again, and only that line shall be announced. While the plugin isn't trusted, the card shall stay in its place and say "*name* isn't trusted yet, so this card is empty." with Review, and while it can't load, "*name* couldn't load, so this card is empty." with Details.

## Examples

- Given the Weather plugin is on with the card "Today's weather",
  when Home shows and its tool `forecast` answers "Sunny",
  then the Cards section shows "Today's weather", "Sunny" and "From the Weather plugin".
- Given the tool `forecast` hasn't answered yet,
  when the card shows,
  then "Today's weather" and "From the Weather plugin" are there and the answer isn't.
- Given the card shows "Sunny",
  when the person presses "Refresh Today's weather" and the tool answers "Rain",
  then the card shows "Rain".
- Given the tool fails with "the service is busy",
  when the card shows,
  then it says "Couldn't get Today's weather: the service is busy." with Try again.
- Given the Weather plugin changed since it was trusted,
  when Home shows,
  then its card says "Weather isn't trusted yet, so this card is empty." with Review, and no tool is called.
- Given no installed plugin has a card,
  when Home shows,
  then there's no Cards section.
