import { deviceCheck } from "../device-check.ts";

/** Asks a person to try the Windows build on their own computer (inventory part 1, row 7). */
export const definition = deviceCheck({
  id: "device.check-windows-build",
  title: "Try the Windows build",
  summary: "Installs the Windows build on your computer and tells us whether it works.",
  subject: "the Windows installer",
  instructions: [
    "Under **Assets**, download the file that ends in `.msi` or `-setup.exe`.",
    "Run the installer. If Windows asks whether to run it, note what the message says.",
    "Open Halonic from the Start menu and wait for the first screen.",
    "Open the example workspace and run its first workflow.",
    "It works if Halonic installs, opens and finishes that run without an error.",
  ],
  checkedOn: "2026-11-25",
});
