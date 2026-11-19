---
"@halonicjs/app-studio": patch
---

Studio's trust check of a plugin reads whether plugin code runs in the sandbox on this computer when it opens. Outside the sandbox it shows the amber line with the reason and the fix, and asks you to tick "I understand plugins and integrations run without the sandbox on this computer" before **Trust**; the agent host saves that yes for the reason shown, and only then is the plugin trusted.
