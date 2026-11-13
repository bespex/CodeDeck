import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// The window with the focus is fully in colour; the others step back (see `.inactive` in index.css)
const focused = () => document.documentElement.classList.toggle("inactive", !document.hasFocus());
window.addEventListener("focus", focused);
window.addEventListener("blur", focused);
focused();

// The right mouse button belongs to CodeDeck (menus on commits and files will come), not to the
// web view's menu with Reload and Inspect. Text fields keep theirs for copy and paste, and so
// does selected text; Shift + right click still opens it, for the developer tools.
document.addEventListener("contextmenu", (e) => {
  const target = e.target as HTMLElement;
  const editable = target.closest("input, textarea, [contenteditable=true]");
  const selection = window.getSelection()?.toString();
  if (!editable && !selection && !e.shiftKey) e.preventDefault();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
