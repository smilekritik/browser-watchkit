import { allowedPage, bridgeAdvice, choosePlayback, defaultSettings, episodeFromUrl, sampleLifetime,
  toActivity, validId, watchLink, withEpisodePage, withPageMetadata } from "./activity.js";

const hostName = "com.smilekritik.browser_watchkit";
let settings = defaultSettings;
let pausedHosts = [];
const watches = new Map();
let selectedTabId;
let publishedTabId;
let revision = 0;
let bridge = null;
let connection = "idle";
let connectionHint = "";
let connectingSince = 0;
let retryAt = 0;
let lastPacket = "";
let expiry;
let badgeEnabled;
let toggleSharing = Promise.resolve();
const previousWatches = chrome.storage.session.get(["watch", "watches"]).then(async ({ watch, watches }) => {
  await Promise.all((watches ?? (watch ? [watch] : [])).map(({ id, token }) =>
    chrome.tabs.sendMessage(id, { type: "stop", token }).catch(() => {})));
  if (watch || watches) await chrome.storage.session.remove(["watch", "watches"]);
}).catch(console.error);

async function attach(tab, frame) {
  try {
    const url = new URL(frame.url);
    const origin = url.protocol === "file:" ? "file:///*" : `${url.protocol}//${url.hostname}/*`;
    if (!await chrome.permissions.contains({ origins: [origin] }) || watches.get(tab.id) !== tab) return;
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, documentIds: [frame.documentId] },
      files: ["media.js"]
    });
    if (watches.get(tab.id) !== tab || tab.documents.get(frame.frameId) !== frame.documentId) return;
    await chrome.tabs.sendMessage(tab.id, {
      type: "watch", token: tab.token, episodePage: frame.frameId === 0 && Boolean(tab.episode)
    }, {
      documentId: frame.documentId
    });
  } catch {
    // The frame may have navigated or Chrome may withhold access to it.
  }
}

function stopTracking(tab) {
  watches.delete(tab.id);
  for (const documentId of tab.documents.values()) {
    chrome.tabs.sendMessage(tab.id, { type: "stop", token: tab.token }, { documentId }).catch(() => {});
  }
}

function clearPresence() {
  const port = bridge;
  bridge = null;
  lastPacket = "";
  retryAt = 0;
  connection = "idle";
  connectionHint = "";
  if (port) {
    try {
      port.postMessage({ type: "clear" });
    } catch {
      port.disconnect();
    }
  }
}

function publish(view) {
  const { activity, url } = view ?? {};
  if (!activity) {
    clearPresence();
    return;
  }
  if (!bridge && Date.now() < retryAt) return;
  if (!bridge) {
    const port = chrome.runtime.connectNative(hostName);
    bridge = port;
    connection = "connecting";
    connectionHint = "";
    connectingSince = Date.now();
    port.onMessage.addListener(message => {
      if (port !== bridge) return;
      if (message.type === "accepted") connection = "published";
      if (message.type === "rejected") connection = "rejected";
      if (message.type === "yielded-to-vlc") connection = "vlc";
      if (message.type === "resuming") {
        connection = "connecting";
        connectingSince = Date.now();
      }
    });
    port.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError?.message;
      if (port !== bridge) return;
      bridge = null;
      lastPacket = "";
      retryAt = Date.now() + 15_000;
      connection = "unavailable";
      connectionHint = bridgeAdvice(error);
    });
  }
  const { linkEpisode, ...presence } = activity;
  const message = { type: "activity", applicationId: settings.applicationId, ...presence };
  const link = settings.shareLink ? watchLink(url, linkEpisode) : "";
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
    connectionHint = bridgeAdvice();
  }
}

function preview() {
  const choice = choosePlayback(watches, selectedTabId, publishedTabId, Date.now());
  if (!choice) return null;
  const { tab, media, background } = choice;
  const custom = withPageMetadata(media, tab.pageMetadata);
  const video = custom !== media ? custom : withEpisodePage(media, tab.episode, tab.pageMetadata?.episodePage);
  const activity = toActivity(video, settings.image, background);
  return { activity, background, url: tab.url, tabId: tab.id };
}

function updatePresence() {
  clearTimeout(expiry);
  const now = Date.now();
  let next = Infinity;
  for (const tab of watches.values()) {
    for (const [frameId, sample] of tab.samples) {
      const expiresAt = sample.seenAt + sampleLifetime;
      if (expiresAt <= now) tab.samples.delete(frameId);
      else next = Math.min(next, expiresAt);
    }
  }
  if (Number.isFinite(next)) expiry = setTimeout(updatePresence, next - now);
  const view = preview();
  publishedTabId = view?.tabId;
  publish(view);
}

async function refresh(force = false) {
  const generation = ++revision;
  await previousWatches;
  const [[selected], stored, session] = await Promise.all([
    chrome.tabs.query({ active: true, lastFocusedWindow: true, windowType: "normal" }),
    chrome.storage.local.get(defaultSettings),
    chrome.storage.session.get({ pausedHosts: [] })
  ]);
  const enabled = stored.enabled && validId(stored.applicationId);
  const background = enabled && stored.backgroundPlayback ? await chrome.tabs.query({ audible: true, windowType: "normal" }) : [];
  if (generation !== revision) return;
  selectedTabId = selected?.id;
  const changedId = stored.applicationId !== settings.applicationId;
  settings = stored;
  if (badgeEnabled !== settings.enabled) {
    badgeEnabled = settings.enabled;
    void chrome.action.setBadgeText({ text: badgeEnabled ? "" : "OFF" }).catch(console.error);
  }
  pausedHosts = session.pausedHosts;
  if (changedId) clearPresence();
  const rules = [...settings.blockedHosts, ...pausedHosts];
  const eligible = new Map();
  if (enabled) {
    for (const tab of [selected, ...background.filter(tab => tab.id !== selectedTabId && !tab.mutedInfo?.muted)]) {
      if (tab?.id != null && !tab.incognito && !tab.discarded && allowedPage(tab.url, rules)) eligible.set(tab.id, tab);
    }
  }
  let changed = false;
  for (const tab of watches.values()) {
    if (force || eligible.get(tab.id)?.url !== tab.url) {
      stopTracking(tab);
      changed = true;
    }
  }
  for (const tab of eligible.values()) {
    let target = watches.get(tab.id);
    if (!target) {
      target = { id: tab.id, url: tab.url, token: crypto.randomUUID(), episode: episodeFromUrl(tab.url),
        documents: new Map(), samples: new Map() };
      watches.set(tab.id, target);
      changed = true;
      void startTracking(target);
    }
    target.audible = tab.audible;
    target.muted = tab.mutedInfo?.muted;
    target.lastAccessed = tab.lastAccessed ?? 0;
  }
  if (changed) void saveWatches();
  updatePresence();
}

function saveWatches() {
  const entries = [...watches.values()].map(({ id, token }) => ({ id, token }));
  return chrome.storage.session.set({ watches: entries }).catch(console.error);
}

async function startTracking(target) {
  const frames = await chrome.webNavigation.getAllFrames({ tabId: target.id }).catch(() => null);
  if (watches.get(target.id) !== target || !frames) return;
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
  const pageChanged = (id === selectedTabId || watches.has(id))
    && (info.url !== undefined || info.discarded !== undefined);
  const audioChanged = (id === selectedTabId || settings.backgroundPlayback)
    && (info.audible !== undefined || info.mutedInfo !== undefined);
  if (pageChanged || audioChanged) scheduleRefresh(false);
});

function tabRemoved(id) {
  const tab = watches.get(id);
  if (tab) {
    stopTracking(tab);
    void saveWatches();
    updatePresence();
  }
  if (!tab && id !== selectedTabId) return;
  scheduleRefresh(false);
}

chrome.tabs.onRemoved.addListener(tabRemoved);
chrome.tabs.onReplaced.addListener((_, removedId) => tabRemoved(removedId));
chrome.windows.onFocusChanged.addListener(id => {
  if (id !== chrome.windows.WINDOW_ID_NONE) scheduleRefresh(false);
});
chrome.webNavigation.onCommitted.addListener(frame => {
  const tab = watches.get(frame.tabId);
  if (!tab) {
    if (frame.frameId === 0 && frame.tabId === selectedTabId) scheduleRefresh(false);
    return;
  }
  if (frame.frameId === 0) {
    tabRemoved(frame.tabId);
    return;
  }
  if (tab.samples.delete(frame.frameId)) updatePresence();
  watchFrame(tab, frame);
});
chrome.webNavigation.onHistoryStateUpdated.addListener(frame => {
  if (frame.frameId === 0 && (frame.tabId === selectedTabId || watches.has(frame.tabId))) scheduleRefresh(false);
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") scheduleRefresh(Boolean(changes.blockedHosts));
  if (area === "session" && changes.pausedHosts) scheduleRefresh(true);
});
chrome.permissions.onAdded.addListener(() => scheduleRefresh(true));
chrome.permissions.onRemoved.addListener(() => scheduleRefresh(true));
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type === "status" && sender.url === chrome.runtime.getURL("popup.html")) {
    const waiting = connection === "connecting" && Date.now() - connectingSince >= 5000;
    const view = preview();
    reply({ connection: waiting ? "waiting" : connection, connectionHint,
      activity: view?.activity, background: view?.background });
    return;
  }
  if (!["media", "page-metadata"].includes(message?.type)) return;
  const tab = watches.get(sender.tab?.id);
  const matches = tab && message.token === tab.token && tab.documents.get(sender.frameId) === sender.documentId;
  if (!matches) {
    reply({ watching: false });
    return;
  }
  if (message.type === "page-metadata") {
    if (sender.frameId !== 0) return;
    tab.pageMetadata = message.page;
    updatePresence();
    return;
  }
  if (message.media) tab.samples.set(sender.frameId, { media: message.media, seenAt: Date.now() });
  else tab.samples.delete(sender.frameId);
  updatePresence();
  reply({ watching: true });
});

scheduleRefresh(false);
