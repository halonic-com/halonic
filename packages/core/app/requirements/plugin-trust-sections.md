# app.plugin-trust-sections

- Status: active
- Since: 0.1.0
- Source: HAL-1739 design, section 5 (the trust check for a plugin), approved by the board; HAL-1741 (P8): `halonic plugin add` and Studio's trust check show the same sections, in the same order, under the same headings, read from one shared model

The app shall give the sections of a plugin's trust check from its trust content, in this order and under these headings: "Tools for agents", "Programs on this computer", "Secrets", "Addresses" and "In Studio". A section shall be given only when it has something in it: a tool, a local program, a secret, a host, or settings, a command, a card or a panel in the plugin's `ui`. Every host that shows a plugin's trust check shall take its sections, their order and their headings from these.

## Examples

- Given the weather plugin with a backend, the local tool `files` and a `ui` with a setting and a command,
  when its sections are read,
  then they are tools, programs, secrets, addresses and In Studio, in that order.
- Given a plugin with only a backend tool that reads, no secrets, no hosts and no `ui`,
  when its sections are read,
  then the only section is tools.
