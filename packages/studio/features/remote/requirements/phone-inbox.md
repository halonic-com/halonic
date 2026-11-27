# remote.phone-inbox

- Status: draft
- Since: unreleased
- Source: HAL-18899 (phase 2 G3d; Sofia's flow B on HAL-17509, choice P2; Noah's wording rows p02a, p03a–p03g and p05c on HAL-17514; HAL-18953; HAL-19086)

The phone's screen of a paired computer shall open on an Inbox tab next to an Agents tab. While the computer speaks message version 4 and the view is live, the Inbox tab shall read the computer's whole Inbox, again each time the host says a source changed, and list the open cards under "Needs you · n waiting", or "Nothing is waiting for you" when none waits. A tapped card shall show its question and its options, or a reply box when it offers none, and send the person's answer once, then say "You chose: <option> · <time>" with Next, or who answered first when it was answered elsewhere. The phone shall send no answer to a `risky` card, showing "Answer this on your computer." with the buttons off, until the computer's last session list says "Let phones answer risky approvals" is on, which it doesn't for a newly paired phone. On a phone whose owner check can't ask, the cards shall stay readable and every answer off, with "Set a screen lock on this phone to answer from it. Reading still works." and Open settings. While the view isn't live because the computer isn't answering, a card's answers shall be off with "You can answer once <computer> answers again. Nothing is sent later." A card that is gone from Paperclip shall say "This card is gone from Paperclip." with Back. Back or Next shall return to the list with the focus on that card's row, or on the list's title once the card has left it or when that row leaves on a later read while it has the focus, and a settled answer shall put the focus on Next. While the computer speaks only version 3, the Inbox tab shall hold only "Update Halonic on <computer>", "Update Halonic on <computer> to use Inbox and Messenger from your phone." and "Agents still works.", read nothing, and the Agents tab shall list the agents without those words.

## Examples

- Given two open cards,
  when the person opens one and picks Today, and the host says it was answered,
  then one `msg-answer` went out with `confirmed: true`, and the card says "You chose: Today" with the time.
- Given a `risky` card and a session list with `answersRisky` false,
  when the person taps an option,
  then nothing is sent and the card says "Answer this on your computer.".
- Given the same card and a list pushed with `answersRisky` true,
  when the person taps an option,
  then one `msg-answer` goes out.
- Given a phone whose owner check can't ask,
  when the person opens a card,
  then its question shows, its answers are off, and Open settings opens the phone's settings.
- Given a computer that speaks only version 3,
  when its screen opens,
  then the Inbox tab holds only the three update lines, and the Agents tab lists the agents.
