# library.listed-tools-waiting

- Status: active
- Since: 0.1.0
- Source: HAL-9376 (design check A4, HAL-9316); HAL-850 (proposal, step 1); HAL-2213

The Library feature shall show, on a connector's page, how many of its listed tools are waiting for the person's approval, with a **Review tools** button that opens the review of that connector's tools. The line and the button shall not show while the tools are being read, when they could not be read, or when no tool waits. A connector page opened without a listed-tools service shall show neither.

## Examples

- Given a connector with two tools waiting,
  when its page opens,
  then it says "2 tools are waiting for your approval" and offers **Review tools**.
- Given that line,
  when the person asks for **Review tools**,
  then the review of that connector's tools opens.
- Given a connector with no tool waiting,
  when its page opens,
  then it shows no line and no **Review tools** button.
