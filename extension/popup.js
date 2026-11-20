import { isSpotify, matchingHost, siteRule, validId } from "./activity.js";
import { byId, getRules, getSettings, setRule } from "./preferences.js";

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
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
  waiting: "Waiting for the Discord desktop app",
  published: "Sharing on Discord",
  vlc: "VLC has priority",
  rejected: "Discord rejected the activity",
  unavailable: "WatchKit bridge could not start"
};

async function refresh() {
  const [reply, config, paused] = await Promise.all([
    chrome.runtime.sendMessage({ type: "status" }),
    getSettings(),
    getRules("session")
  ]);
  const excludedBy = matchingHost(host, config.blockedHosts);
  const pausedBy = matchingHost(host, paused);
  const granted = origin && await chrome.permissions.contains({ origins: [origin] });
  const spotify = isSpotify(host);
  const background = Boolean(reply?.background && reply.activity);
  const vlc = reply?.connection === "vlc";
  const canTrack = background || (validId(config.applicationId) && config.enabled && currentRule && granted
    && !spotify && !excludedBy && !pausedBy);
  enabled.checked = config.enabled;
  byId("setup-row").hidden = validId(config.applicationId);
  byId("status").textContent = !validId(config.applicationId) ? "Connect Discord to get started"
    : !config.enabled ? "Sharing is off"
    : background ? stateText[reply.connection] ?? stateText.idle
    : spotify ? "Spotify uses Discord’s own connection"
    : excludedBy ? "This site is excluded"
    : pausedBy ? "This site is paused"
    : !currentRule ? "Open a tab with music or video"
    : !granted ? "Allow this site to start tracking"
    : stateText[reply?.connection] ?? stateText.idle;
  const help = byId("connection-help");
  help.textContent = canTrack ? ({
    waiting: "Open Discord desktop and sign in. If it is already open, check the Application ID in WatchKit settings.",
    rejected: "Check the Application ID in WatchKit settings. Clear it and save to use the shared WatchKit application.",
    unavailable: reply?.connectionHint,
    vlc: "Playing browser media can take over when VLC pauses or stops.",
    idle: "Start playback in this tab. If the player is embedded from another site, allow its domain in Chrome."
  }[reply?.connection ?? "idle"] ?? "") : "";
  help.hidden = !help.textContent;
  byId("playback-origin").hidden = !background || vlc;
  byId("video").textContent = vlc ? "" : reply?.activity?.title ?? "";
  byId("timing").textContent = vlc ? "" : [reply?.activity?.detail, reply?.activity?.imageText].filter(Boolean).join(" · ");
  if (!currentRule) return;
  if (spotify) {
    byId("site-state").textContent = "Spotify is handled by Discord";
    for (const control of [allow, byId("pause-site"), byId("block-site"), byId("resume-site")]) control.hidden = true;
    return;
  }

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
