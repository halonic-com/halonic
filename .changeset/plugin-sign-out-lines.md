---
"@halonicjs/app-studio": patch
---

`halonic trust --plugin <id> --remove` and `halonic plugin remove` now say which of the plugin's sign-ins they signed you out of, and warn when the provider didn't confirm, because the token may still work there until it expires.
