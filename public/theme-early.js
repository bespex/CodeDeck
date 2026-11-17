// Runs before the app: puts the theme last used on the page, so that the first picture is already in it
// (src/theme.ts keeps it in localStorage and checks it against the machine settings once it runs).
// A separate file, because the content security policy allows no inline script.
try {
  var saved = JSON.parse(localStorage.getItem("codedeck.theme") || "null");
  if (saved && saved.vars) {
    var root = document.documentElement;
    for (var name in saved.vars) if (name.indexOf("--t-") === 0) root.style.setProperty(name, saved.vars[name]);
    (saved.classes || []).forEach(function (c) { root.classList.add(c); });
  }
} catch (e) {}
