# settings.sandbox-commands

- Status: active
- Since: 0.1.0
- Source: HAL-9385 (B13); microcopy 13.1 and 15.3

Where the app has a sandbox host that can set the sandbox up, Ctrl K shall list **Set up the agent sandbox**. Choosing it is the press: Windows asks for administrator rights, and nothing starts before. When the setup and its check pass, a success toast shall say "The agent sandbox is set up". When it doesn't, an error toast shall say "The agent sandbox isn't set up: *cause*", with the cause as a phrase (Windows didn't give Halonic administrator rights, the time limit, the host's reason, or that Windows must restart), and **Open Settings**, which opens Settings on Agent sandbox. A build without the sandbox, and served Studio, shall list no command.

## Examples

- Given the app has a sandbox host that can run,
  when the person opens Ctrl K,
  then it lists "Set up the agent sandbox".
- Given Windows refuses the administrator prompt,
  when the command ends,
  then an error toast reads "The agent sandbox isn't set up: Windows didn't give Halonic administrator rights." with **Open Settings**.
- Given the setup and its check pass,
  when the command ends,
  then a success toast reads "The agent sandbox is set up".
