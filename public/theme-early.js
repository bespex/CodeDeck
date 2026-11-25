// Runs before the app: puts the colour theme and style last used on the page, so that the first picture
// is already in them (src/theme.ts keeps them in localStorage and checks them against the machine
// settings once it runs). A separate file, because the content security policy allows no inline script.
try {
  var saved = JSON.parse(localStorage.getItem("codedeck.theme") || "null");
  if (saved && saved.attrs) {
    var root = document.documentElement;
    for (var name in saved.attrs) if (name.indexOf("data-sx-") === 0) root.setAttribute(name, saved.attrs[name]);
    (saved.classes || []).forEach(function (c) { root.classList.add(c); });
  }
} catch (e) {}
