// Device storage for the installed (home-screen) version.
window.UAIStore = {
  persistent: true,
  get: k => { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { window.localStorage.setItem(k, v); } catch (e) {} }
};
