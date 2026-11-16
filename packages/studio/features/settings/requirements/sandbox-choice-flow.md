# settings.sandbox-choice-flow

- Status: active
- Since: 0.1.0
- Source: HAL-5405 (PR 2); HAL-3777 (plan) modal layout, S1, S2, S6; HAL-3777 (wording, final)

The Studio shall show the first-start sandbox choice as one card centred on the app frame, with the frame's halo behind it and no dimming scrim over it. The halo shall be decoration only: hidden from assistive technology, carrying no text and taking no pointer events. The card shall be 440 px wide at most and about 60% of the window high at most. Its header shall read "Step 2 of 3" and the title. The first screen shall show one sentence, the recommended card with one **Set up** button, **Other options**, **More info** and **Continue without sandbox**. More info and Other options shall open as second steps in the same card with a **Back** link. Other options shall list every offered backend, with one that can't run shown unavailable and saying why, and shall keep **Set up** off for Cloud until its warning is shown and its box is ticked. **Continue without sandbox** shall first show the confirmation, whose primary button is **Set up a sandbox**. While the host checks the computer, the screen shall say so, and when it couldn't check, it shall say that and keep Other options and Continue without sandbox. The screens shall only report what the person picked; they shall decide and save nothing.

## Examples

- Given Windows and the engine offers srt-wsl and srt,
  when the first screen shows,
  then the card is Sandbox in WSL with **Recommended**, and pressing **Set up** reports `srt-wsl`.
- Given Cloud is picked in Other options,
  when its box isn't ticked,
  then pressing **Set up Cloud sandbox** reports nothing.
- Given the person presses **Continue without sandbox**,
  when the confirmation shows,
  then nothing is reported until they press **Continue without sandbox** there.
