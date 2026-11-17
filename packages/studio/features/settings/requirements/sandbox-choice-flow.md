# settings.sandbox-choice-flow

- Status: active
- Since: unreleased
- Source: HAL-5405 (PR 2); HAL-3777 (plan) modal layout, S1, S2, S6; HAL-3777 (wording, final)

The Studio shall show the first-start sandbox choice as one card centred on the app frame, with the frame's halo behind it and no dimming scrim over it. The halo shall be decoration only: hidden from assistive technology, carrying no text and taking no pointer events. The card shall be 440 px wide at most and 85% of the window high at most (90% when the window is 560 px high or less); it shall grow with its content up to that height, and past it the body shall scroll inside the card with a fade at the cut while there is more below, with the action row kept whole beneath it. Its header shall read "Step 2 of 3" and the title. The first screen shall show one sentence, the recommended card (never one that can't run) with one **Set up** button, **Other options**, **More info** and **Continue without sandbox**. More info and Other options shall open as second steps in the same card with a **Back** link, and focus shall move to the new screen's title. Other options shall list every offered backend, with one that can't run shown unavailable and saying why, and the network caveat of the picked one, and shall keep **Set up** off for Cloud until its warning is shown and its box is ticked. **Continue without sandbox** shall first show the confirmation, whose primary button is **Set up a sandbox**, and whose sentence that Halonic still asks before an agent runs a command shall show only when the host says it really does. While the host checks the computer, the screen shall say so, and when it couldn't check, it shall say that and keep Continue without sandbox, with no Other options, since there is nothing to list. The screens shall only report what the person picked; they shall decide and save nothing.

## Examples

- Given Windows and WSL can't run because virtualisation is off,
  when the first screen shows,
  then it shows no recommended card, and Other options lists Sandbox in WSL unavailable with its reason.

- Given Windows and the engine offers srt-wsl and srt,
  when the first screen shows,
  then the card is Sandbox in WSL with **Recommended**, and pressing **Set up** reports `srt-wsl`.
- Given Cloud is picked in Other options,
  when its box isn't ticked,
  then pressing **Set up Cloud sandbox** reports nothing.
- Given the person presses **Continue without sandbox**,
  when the confirmation shows,
  then nothing is reported until they press **Continue without sandbox** there.
