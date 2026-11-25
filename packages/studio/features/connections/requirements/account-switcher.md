# connections.account-switcher

- Status: active
- Since: unreleased
- Source: HAL-18672; plan approved on HAL-18710

The Studio shall show an account switcher at the sidebar's bottom left while a Paperclip account is linked: a menu of the linked accounts by the user each is signed in as, with the one the Inbox and Messenger show marked, and **Settings › Connections**. Picking an account shall make the Inbox and Messenger show it, and the menu shall draw nothing while no account is linked.

## Examples

- Given accounts "Ada" and "Bo" linked and none picked,
  when the menu opens,
  then it lists Ada marked as showing now, and Bo.
- Given the menu is open,
  when "Bo" is picked,
  then the active account is Bo's connection and the menu marks Bo.
- Given no account is linked,
  when the sidebar is drawn,
  then the switcher draws nothing.
