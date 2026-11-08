// Checks GitHub Releases for a newer version and badges the toolbar icon.
// (Sideloaded extensions can't auto-update; the popup links to the release to download.)
const REPO = 'user-is-surya/meet-memes';
const CHECK_EVERY_MIN = 360;

function newer(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

async function checkForUpdate() {
  const current = chrome.runtime.getManifest().version;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const rel = await res.json();
    const latest = String(rel.tag_name || '').replace(/^v/, '');
    const asset = (rel.assets || []).find((a) => a.name.endsWith('.zip'));
    const update = {
      current,
      latest,
      available: !!latest && newer(latest, current),
      url: rel.html_url,
      zip: asset ? asset.browser_download_url : rel.html_url,
      checkedAt: Date.now(),
    };
    await chrome.storage.local.set({ update });
    await chrome.action.setBadgeText({ text: update.available ? 'NEW' : '' });
    await chrome.action.setBadgeBackgroundColor({ color: '#8b5cf6' });
    return update;
  } catch (err) {
    const update = { current, available: false, error: String(err.message || err), checkedAt: Date.now() };
    await chrome.storage.local.set({ update });
    return update;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('update-check', { periodInMinutes: CHECK_EVERY_MIN });
  checkForUpdate();
});
chrome.runtime.onStartup.addListener(checkForUpdate);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'update-check') checkForUpdate();
});
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'open-guide') {
    chrome.tabs.create({ url: chrome.runtime.getURL('guide/guide.html' + (msg.hash || '')) });
    return false;
  }
  if (msg && msg.type === 'check-update') {
    checkForUpdate().then(sendResponse);
    return true;
  }
  return false;
});
