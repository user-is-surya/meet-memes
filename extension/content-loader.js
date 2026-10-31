// Content scripts can't be ES modules, so this classic script loads the real entry point.
(async () => {
  try {
    const { start } = await import(chrome.runtime.getURL('src/content/main.js'));
    await start();
  } catch (err) {
    console.warn('[meet-memes] failed to start', err);
  }
})();
