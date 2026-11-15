import { defaultSettings, isSpotify, matchingHost, siteRule, validId } from "./activity.js";
import { byId, getRules, setRule } from "./preferences.js";

const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
const url = tab?.url ? new URL(tab.url) : null;
const origin = url?.protocol === "file:" ? "file:///*"
  : ["http:", "https:"].includes(url?.protocol) ? `${url.protocol}//${url.hostname}/*` : "";
const host = origin ? url.hostname || "file:" : "";
const currentRule = host === "file:" ? host : siteRule(host);
const enabled = byId("enabled");
const notice = byId("notice");
const allow = byId("allow-site");

byId("current-site").hidden = !currentRule;
byId("site-name").textContent = host === "file:" ? "Local files" : host;
byId("settings").onclick = byId("setup-row").onclick = () => chrome.runtime.openOptionsPage();
enabled.onchange = () => chrome.storage.local.set({ enabled: enabled.checked });

const stateText = {
  idle: "Waiting for playback",
  connecting: "Connecting to Discord…",
  published: "Sharing on Discord",
  rejected: "Discord rejected the activity",
  unavailable: "Native bridge unavailable"
};

async function refresh() {
  const [reply, config, paused] = await Promise.all([
    chrome.runtime.sendMessage({ type: "status" }),
    chrome.storage.local.get(defaultSettings),
    getRules("session")
  ]);
  const excludedBy = matchingHost(host, config.blockedHosts);
  const pausedBy = matchingHost(host, paused);
  enabled.checked = config.enabled;
  byId("setup-row").hidden = validId(config.applicationId);
  byId("status").textContent = !validId(config.applicationId) ? "Connect Discord to get started"
    : !config.enabled ? "Sharing is off"
    : isSpotify(host) ? "Spotify uses Discord’s own connection"
    : excludedBy ? "This site is excluded"
    : pausedBy ? "This site is paused"
    : stateText[reply?.connection] ?? stateText.idle;
  byId("video").textContent = reply?.activity?.title ?? "";
  byId("timing").textContent = reply?.activity?.detail ?? "";
  if (!currentRule) return;
  if (isSpotify(host)) {
    byId("site-state").textContent = "Spotify is handled by Discord";
    for (const control of [allow, byId("pause-site"), byId("block-site"), byId("resume-site")]) control.hidden = true;
    return;
  }

  const granted = await chrome.permissions.contains({ origins: [origin] });
  byId("site-state").textContent = excludedBy ? `Excluded by ${excludedBy}`
    : pausedBy ? "Paused until Chrome restarts"
    : granted ? "Access allowed" : "Site access needed";
  allow.hidden = granted || Boolean(excludedBy || pausedBy);
  byId("pause-site").hidden = !granted || Boolean(excludedBy || pausedBy);
  byId("block-site").hidden = Boolean(excludedBy);
  const resume = byId("resume-site");
  resume.hidden = !excludedBy && !pausedBy;
  resume.textContent = excludedBy ? "Remove exclusion" : "Resume tracking";
  resume.onclick = () => excludedBy
    ? changeRule("permanent", excludedBy, false)
    : changeRule("session", pausedBy, false);
}

async function changeRule(kind, rule, include) {
  try {
    await setRule(kind, rule, include);
    notice.textContent = "";
    await refresh();
  } catch {
    notice.textContent = "Could not update tracking for this site.";
  }
}

allow.onclick = async () => {
  try {
    const granted = await chrome.permissions.request({ origins: [origin] });
    notice.textContent = granted ? "" : "Site access was declined.";
    await refresh();
  } catch {
    notice.textContent = "Could not grant access. Check the extension’s site access in Chrome.";
  }
};
byId("pause-site").onclick = () => changeRule("session", currentRule, true);
byId("block-site").onclick = () => changeRule("permanent", currentRule, true);
await refresh();
setInterval(refresh, 1000);
