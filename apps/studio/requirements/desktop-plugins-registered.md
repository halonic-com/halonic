# studio.desktop-plugins-registered

- Status: active
- Since: 0.1.0
- Source: HAL-9377 (design check A4, HAL-9316)

The desktop app shall register the plugins feature and give each open folder the plugins host, so the plugins' settings, commands, Home cards and panels show in the app. Tool calls shall go through the agent host, never through code in the page. The host shall read the plugins folder again whenever the window comes to the front.

## Examples

- Given the desktop app's features,
  when the shell is created,
  then the plugins feature is registered.
- Given a desktop folder that is opened,
  when its services are built,
  then it has the plugins host.
- Given a window that has opened a folder,
  when the window comes to the front,
  then the plugins folder is read again, and a failed read is reported.
- Given a window that has opened two folders,
  when the second one gets its services,
  then it shares the first one's host and the window has one focus listener.
- Given a page without the agent host's transport,
  when a folder gets its services,
  then no plugins host is provided.
