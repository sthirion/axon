/* global window, document */
// Applies the saved or system theme before the first paint (loaded as a blocking script in <head>).
// It must stay a plain classic script (no modules, no build step) and never throw. The rules mirror src/lib/theme.ts (a test keeps them equal).
(function () {
  var dark = false;
  try {
    var stored = window.localStorage.getItem('axon.theme');
    if (stored === 'dark' || stored === 'light') {
      dark = stored === 'dark';
    } else {
      dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
  } catch {
    try {
      dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      dark = false;
    }
  }
  var root = document.documentElement;
  if (dark) {
    root.classList.add('dark');
  }
  root.style.colorScheme = dark ? 'dark' : 'light';
})();
