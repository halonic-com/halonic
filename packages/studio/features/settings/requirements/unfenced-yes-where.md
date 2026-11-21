# settings.unfenced-yes-where

- Status: active
- Since: unreleased
- Source: flow check C565 row 2 (HAL-15351, HAL-15373); builds on microcopy 24.1 R16 (HAL-751, approved on HAL-1949) and `settings.unfenced-yes-take-back`; the words are a team decision (HAL-2282)

While Settings › Agent sandbox shows "Plugins and integrations" and the host says plugin code needs a yes that isn't saved, the Settings feature shall show under the block's line "You give it with Review on a plugin's page in Plugins." and, where Settings has a Plugins section, an **Open Plugins** button that opens Settings on it. While a yes is saved, and while the host can't say, the Settings feature shall show neither.

## Examples

- Given Halonic runs inside a container and no yes is saved,
  when Settings › Agent sandbox opens,
  then "Plugins and integrations" reads "You give it with Review on a plugin's page in Plugins." with **Open Plugins**, and pressing it shows Settings › Plugins.
- Given a yes is saved,
  when **Take back** is pressed and the host has taken it back,
  then the block reads "You give it with Review on a plugin's page in Plugins." in place of **Take back**.
- Given no feature added a Plugins section,
  when the block needs a yes,
  then it names the place without **Open Plugins**.
