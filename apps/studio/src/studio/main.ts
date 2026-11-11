import { startStudio } from "./start-studio.ts";

// The Studio page's entry (studio.html). Everything it does is in startStudio, which is tested.
const element = document.getElementById("root");
if (element === null) {
  throw new Error("The Studio page needs its #root element (studio.html).");
}
startStudio({ element, window, userAgent: navigator.userAgent });
