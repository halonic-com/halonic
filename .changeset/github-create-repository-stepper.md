---
"@halonicjs/app-studio": patch
---

A new action stepper creates a GitHub repository the way ours are set up: private first, with squash merging, auto-merge and our label, then an environment with its protection, the ruleset, one Actions secret, the agents' access, and making it public if asked, and at the end it reads the settings back next to our defaults. You type the repository's full name before each change is sent. A second small stepper adds the repository to a Paperclip project.
