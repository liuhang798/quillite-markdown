// Classic, parser-blocking script: decide layout before the body can paint.
// Keep this independent of the editor bundle and asynchronous preferences.
(() => {
  try {
    const collapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    if (collapsed) document.documentElement.dataset.startupSidebar = 'collapsed';
  } catch {
    // Unavailable storage retains the default expanded layout.
  }
})();
