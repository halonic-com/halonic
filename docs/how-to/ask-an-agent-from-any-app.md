# Ask an agent from any app

Quick ask is a small box that opens over whatever app you're in, so you can ask
one of your agents something without switching to Halonic. Your question goes
into your chat with that agent in Messenger, so the answer is there later too.

Quick ask needs the Halonic desktop app. It isn't in the Studio a computer
serves to a browser or a phone.

## Open the box

Any of these opens it:

- Press **Ctrl+Alt+Space** (**⌥Space** on a Mac) in any app. Halonic hears these
  keys while it runs, in the tray too, with its window closed.
- In Studio, open **Help** and pick **Quick ask (Ctrl+Alt+Space)**.
- In Studio, press **Ctrl K**, type "Quick ask" and press Enter.
- Pick **Ask…** in Halonic's tray menu.

The first-run card, "Your first run is done.", reminds you of the keys under
**What next?**: "Ask an agent from any app: Ctrl+Alt+Space".

Help, Ctrl K and the first-run card always show the keys that work now. If you
change them, they show the new ones. If the keys don't work on this computer,
Help and Ctrl K show plain **Quick ask**, and the first-run card leaves the line
out.

## Ask

1. Type your question in "Ask {agent} anything".
2. To ask another agent, press **Tab**, or click the agent, and pick one.
3. Press **Enter**.

The answer shows in the box while it's open. You can close it while the agent
works: the answer comes to your chat with that agent in Messenger. **Open in
Messenger** takes you to that chat.

Press **Esc**, or click outside the box, to close it. It keeps the text you
didn't send and the agent you picked.

## Change the keys

1. In Studio, open **Settings › Keyboard**.
2. Next to **Quick ask**, pick **Change** and press the new keys. They need
   Ctrl, Alt or ⌘.

If another app holds those keys, Settings says "{keys} is taken by another app.
Pick another key." and keeps the old ones.

On Linux with Wayland, the desktop doesn't let apps add a shortcut. Add one in
your desktop's settings that runs `halonic-studio --app ask`, or use Help, Ctrl K
or the tray.
