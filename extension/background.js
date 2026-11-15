import { allowedPage, bestMedia, defaultSettings, toActivity, validId, watchLink, withPageMetadata } from "./activity.js";

const hostName = "com.smilekritik.browser_watchkit";
let settings = defaultSettings;
let pausedHosts = [];
let current = null;
let selectedTabId;
let revision = 0;
let bridge = null;
let connection = "idle";
let retryAt = 0;
let lastPacket = "";
let expiry;
let badgeEnabled;
let toggleSharing = Promise.resolve();
const previousWatch = chrome.storage.session.get("watch").then(({ watch }) => {
  if (watch) return chrome.tabs.sendMessage(watch.id, { type: "stop", token: watch.token }).catch(() => {});
});

async function attach(tab, frame) {
  try {
    const url = new URL(frame.url);
    const origin = url.protocol === "file:" ? "file:///*" : `${url.protocol}//${url.hostname}/*`;
    if (!await chrome.permissions.contains({ origins: [origin] }) || tab !== current) return;
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, documentIds: [frame.documentId] },
      files: ["media.js"]
    });
    if (tab !== current || tab.documents.get(frame.frameId) !== frame.documentId) return;
    await chrome.tabs.sendMessage(tab.id, { type: "watch", token: tab.token }, {
      documentId: frame.documentId
    });
  } catch {
    // The frame may have navigated or Chrome may withhold access to it.
  }
}

function stopTracking() {
  if (!current) return;
  for (const documentId of current.documents.values()) {
    chrome.tabs.sendMessage(current.id, { type: "stop", token: current.token }, { documentId }).catch(() => {});
  }
  current = null;
  clearTimeout(expiry);
}

function clearPresence() {
  const port = bridge;
  bridge = null;
  lastPacket = "";
  retryAt = 0;
  connection = "idle";
  if (port) {
    try {
      port.postMessage({ type: "clear" });
    } catch {
      port.disconnect();
    }
  }
}

function publish(activity) {
  if (!activity) {
    clearPresence();
    return;
  }
  if (!bridge && Date.now() < retryAt) return;
  if (!bridge) {
    const port = chrome.runtime.connectNative(hostName);
    bridge = port;
    connection = "connecting";
    port.onMessage.addListener(message => {
      if (port !== bridge) return;
      if (message.type === "accepted") connection = "published";
      if (message.type === "rejected") connection = "rejected";
    });
    port.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError?.message;
      if (port !== bridge) return;
      bridge = null;
      lastPacket = "";
      retryAt = Date.now() + 15_000;
      connection = error ? "unavailable" : "idle";
    });
  }
  const message = { type: "activity", applicationId: settings.applicationId, ...activity };
  const link = settings.shareLink ? watchLink(current?.url) : "";
  if (link) message.watchUrl = link;
  const packet = JSON.stringify(message);
  if (packet === lastPacket) return;
  try {
    bridge.postMessage(message);
    lastPacket = packet;
  } catch {
    bridge.disconnect();
    bridge = null;
    lastPacket = "";
    retryAt = Date.now() + 15_000;
    connection = "unavailable";
  }
}

function preview() {
  if (!current) return null;
  const media = bestMedia(current.samples.values(), Date.now());
  return toActivity(withPageMetadata(media, current.pageMetadata), settings.image);
}

function updatePresence() {
  clearTimeout(expiry);
  const now = Date.now();
  let next = Infinity;
  for (const [frameId, sample] of current.samples) {
    const expiresAt = sample.seenAt + 16_000;
    if (expiresAt <= now) current.samples.delete(frameId);
    else next = Math.min(next, expiresAt);
  }
  if (Number.isFinite(next)) expiry = setTimeout(updatePresence, next - now);
  publish(preview());
}

async function refresh(force = false) {
  const generation = ++revision;
  await previousWatch;
  const [[tab], stored, session] = await Promise.all([
    chrome.tabs.query({ active: true, lastFocusedWindow: true, windowType: "normal" }),
    chrome.storage.local.get(defaultSettings),
    chrome.storage.session.get({ pausedHosts: [] })
  ]);
  if (generation !== revision) return;
  selectedTabId = tab?.id;
  const changed = stored.applicationId !== settings.applicationId || stored.image !== settings.image;
  settings = stored;
  if (badgeEnabled !== settings.enabled) {
    badgeEnabled = settings.enabled;
    void chrome.action.setBadgeText({ text: badgeEnabled ? "" : "OFF" }).catch(console.error);
  }
  pausedHosts = session.pausedHosts;
  const eligible = settings.enabled && validId(settings.applicationId) && tab?.id != null
    && !tab.incognito && allowedPage(tab.url, [...settings.blockedHosts, ...pausedHosts]);
  if (!eligible || force || changed || current?.id !== tab.id || current.url !== tab.url) {
    stopTracking();
    clearPresence();
  }
  if (!eligible) {
    await chrome.storage.session.remove("watch");
    return;
  }
  if (current) return;

  const target = { id: tab.id, url: tab.url, token: crypto.randomUUID(), documents: new Map(), samples: new Map() };
  current = target;
  await chrome.storage.session.set({ watch: { id: target.id, token: target.token } });
  const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id }).catch(() => null);
  if (current !== target || !frames) return;
  for (const frame of frames) {
    if (target.documents.has(frame.frameId)) continue;
    watchFrame(target, frame);
  }
}

function watchFrame(tab, frame) {
  if (!frame.documentId || frame.documentLifecycle !== "active") return;
  tab.documents.set(frame.frameId, frame.documentId);
  if (allowedPage(frame.url, [...settings.blockedHosts, ...pausedHosts])) void attach(tab, frame);
}

function scheduleRefresh(force) {
  void refresh(force).catch(console.error);
}

chrome.commands.onCommand.addListener(command => {
  if (command !== "toggle-sharing") return;
  toggleSharing = toggleSharing.then(async () => {
    const { enabled } = await chrome.storage.local.get({ enabled: defaultSettings.enabled });
    await chrome.storage.local.set({ enabled: !enabled });
  }).catch(console.error);
});
chrome.tabs.onActivated.addListener(() => scheduleRefresh(false));
chrome.tabs.onUpdated.addListener((id, info) => {
  if (id === selectedTabId && info.url) scheduleRefresh(false);
});
chrome.tabs.onRemoved.addListener(id => {
  if (id !== current?.id) return;
  stopTracking();
  clearPresence();
  scheduleRefresh(false);
});
chrome.windows.onFocusChanged.addListener(id => {
  if (id !== chrome.windows.WINDOW_ID_NONE) scheduleRefresh(false);
});
chrome.webNavigation.onCommitted.addListener(frame => {
  if (frame.tabId !== current?.id) return;
  if (frame.frameId === 0) {
    stopTracking();
    clearPresence();
    scheduleRefresh(false);
    return;
  }
  if (current.samples.delete(frame.frameId)) updatePresence();
  watchFrame(current, frame);
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" || (area === "session" && changes.pausedHosts)) scheduleRefresh(true);
});
chrome.permissions.onAdded.addListener(() => scheduleRefresh(true));
chrome.permissions.onRemoved.addListener(() => scheduleRefresh(true));
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type === "status" && sender.url === chrome.runtime.getURL("popup.html")) {
    reply({ connection, activity: preview() });
    return;
  }
  if (!["media", "page-metadata"].includes(message?.type)) return;
  const matches = current && sender.tab?.id === current.id && message.token === current.token
    && current.documents.get(sender.frameId) === sender.documentId;
  if (!matches) {
    reply({ watching: false });
    return;
  }
  if (message.type === "page-metadata") {
    if (sender.frameId !== 0) return;
    current.pageMetadata = message.page;
    updatePresence();
    return;
  }
  if (message.media) current.samples.set(sender.frameId, { media: message.media, seenAt: Date.now() });
  else current.samples.delete(sender.frameId);
  updatePresence();
  reply({ watching: true });
});

scheduleRefresh(false);
