# settings.sandbox-choice-view

- Status: active
- Since: 0.1.0
- Source: HAL-5405 (PR 1); HAL-3777 (plan) S1 and S2; HAL-3777 (wording, final)

The Studio shall turn the engine's typed sandbox choice into the cards of the first screen and of Other options, for the computer it runs on, and decide nothing itself. The recommended card shall be Sandbox in WSL on Windows and Sandbox on macOS and Linux, and shall carry the badge **Recommended**; a recommended backend that can't run shall not be the recommended card, and is listed in Other options with its reason and no badge. Sandbox for Windows (native) shall be a card in Other options with the badge **Experimental** and the network caveat. A backend the computer doesn't offer shall not show. A backend that can't run shall show disabled with a plain sentence for its reason, and one whose safety test failed shall show disabled and say so. The backend in use shall show **In use**. Cloud shall carry its upload warning always, and shall need an explicit confirmation. Studio shall ask the host for the latest choice, and for it again after the sandbox setting changed, through the `SandboxChoiceHost` service; the window shall change nothing else.

## Examples

- Given Windows and the engine offers srt-wsl and srt,
  when the cards are made,
  then the recommended card is Sandbox in WSL with **Recommended**, and Sandbox for Windows is listed second with **Experimental**.
- Given Linux and bubblewrap is missing for srt,
  when the cards are made,
  then the Sandbox card is selectable (its setup shows the fix) and reads "You may need to run one command"
- Given Docker Sandboxes can't run because virtualisation is off,
  when the cards are made,
  then its card is disabled with "Virtualisation is turned off on this computer."
- Given the engine doesn't offer MXC,
  when the cards are made,
  then no MXC card is in the list.
