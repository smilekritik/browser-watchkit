import { browserArtworkKey, defaultSettings, matchingHost, siteRule, validId } from "./activity.js";

const byId = id => document.getElementById(id);
const allWeb = ["http://*/*", "https://*/*"];
const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
// The options page is itself a tab. Site actions belong to the toolbar popup.
const url = tab?.url && tab.url !== location.href ? new URL(tab.url) : null;
const site = url?.protocol === "file:" ? "file:///*"
  : ["http:", "https:"].includes(url?.protocol) ? `${url.protocol}//${url.hostname}/*` : "";
const host = site ? url.hostname || "file:" : "";
const currentRule = host === "file:" ? host : siteRule(host);
const enabled = byId("enabled");
const application = byId("application");
const image = byId("image");
const allowSite = byId("allow-site");
const allowAll = byId("allow-all");
const saved = await chrome.storage.local.get(defaultSettings);
enabled.checked = saved.enabled;
byId("current-site").hidden = !currentRule;
byId("site-name").textContent = host === "file:" ? "Local files" : host;
application.value = saved.applicationId;
image.value = browserArtworkKey(saved.image);
allowSite.hidden = !site;

async function updatePermissions() {
  if (site) {
    allowSite.disabled = await chrome.permissions.contains({ origins: [site] });
    allowSite.textContent = allowSite.disabled ? "Site allowed" : "Allow this site";
  }
  const granted = await chrome.permissions.contains({ origins: allWeb });
  allowAll.textContent = granted ? "Remove all-sites access" : "Allow all websites";
  allowAll.dataset.granted = String(granted);
}

allowSite.addEventListener("click", async () => {
  await chrome.permissions.request({ origins: [site] });
  await updatePermissions();
});
allowAll.addEventListener("click", async () => {
  if (allowAll.dataset.granted === "true") await chrome.permissions.remove({ origins: allWeb });
  else await chrome.permissions.request({ origins: allWeb });
  await updatePermissions();
});
enabled.addEventListener("change", () => chrome.storage.local.set({ enabled: enabled.checked }));

const ruleStores = {
  permanent: [chrome.storage.local, "blockedHosts"],
  session: [chrome.storage.session, "pausedHosts"]
};
const notice = byId("notice");

async function getRules(kind) {
  const [storage, key] = ruleStores[kind];
  return (await storage.get({ [key]: [] }))[key];
}

async function setRule(kind, rule, include) {
  const [storage, key] = ruleStores[kind];
  const rules = new Set(await getRules(kind));
  if (include) rules.add(rule);
  else rules.delete(rule);
  await storage.set({ [key]: [...rules] });
}

async function renderRules() {
  const [permanent, session] = await Promise.all([getRules("permanent"), getRules("session")]);
  const excluded = matchingHost(host, permanent);
  const paused = matchingHost(host, session);
  const rules = [
    ...permanent.map(rule => ({ rule, kind: "permanent" })),
    ...session.filter(rule => !permanent.includes(rule)).map(rule => ({ rule, kind: "session" }))
  ];
  byId("pause-site").hidden = Boolean(excluded || paused);
  byId("block-site").hidden = Boolean(excluded);
  byId("resume-site").hidden = !excluded && !paused;
  byId("pause-hint").hidden = Boolean(excluded || paused);
  byId("site-state").textContent = excluded ? `Excluded by ${excluded}`
    : paused ? `Paused for this session by ${paused}` : "Tracking available";
  byId("resume-site").textContent = excluded ? `Remove exclusion for ${excluded}` : "Resume tracking";
  byId("resume-site").onclick = () => excluded
    ? applyRule("permanent", excluded, false)
    : applyRule("session", paused, false);

  byId("rules-list").replaceChildren(...rules.map(({ rule, kind }) => {
    const row = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = `${rule === "file:" ? "Local files" : rule} · ${kind === "session" ? "This session" : "Permanent"}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove ${kind} rule for ${rule}`);
    remove.onclick = async () => {
      await applyRule(kind, rule, false);
      byId("site-rule").focus();
    };
    row.append(label, remove);
    return row;
  }));
  byId("rules-empty").hidden = rules.length > 0;
}

async function applyRule(kind, rule, include) {
  try {
    await setRule(kind, rule, include);
    if (include && kind === "permanent") await setRule("session", rule, false);
    notice.textContent = include
      ? kind === "session" ? "Site paused until Chrome restarts." : "Site excluded."
      : "Site rule removed.";
    await renderRules();
  } catch {
    notice.textContent = "Could not save the site rule.";
  }
}

byId("pause-site").onclick = () => applyRule("session", currentRule, true);
byId("block-site").onclick = () => applyRule("permanent", currentRule, true);
byId("add-site").addEventListener("submit", async event => {
  event.preventDefault();
  const field = byId("site-rule");
  const rule = siteRule(field.value);
  if (!rule) {
    notice.textContent = "Enter a domain or a website URL.";
    field.focus();
    return;
  }
  await applyRule("permanent", rule, true);
  field.value = "";
});
byId("config").addEventListener("submit", async event => {
  event.preventDefault();
  image.value = browserArtworkKey(image.value);
  await chrome.storage.local.set({ applicationId: application.value.trim(), image: image.value });
  byId("notice").textContent = "Settings saved.";
  await refreshStatus();
});

byId("import-vlc").addEventListener("click", async () => {
  try {
    const config = await chrome.runtime.sendNativeMessage("com.smilekritik.browser_watchkit", { type: "import-vlc" });
    if (!validId(config?.applicationId)) {
      byId("notice").textContent = "No Discord Application ID found in WatchKit for VLC.";
      return;
    }
    await chrome.storage.local.set({ applicationId: config.applicationId });
    application.value = config.applicationId;
    byId("notice").textContent = "Application ID imported from VLC.";
    await refreshStatus();
  } catch {
    byId("notice").textContent = "Install the WatchKit bridge to import settings from VLC.";
  }
});
const stateText = {
  idle: "Waiting for video",
  connecting: "Connecting to Discord…",
  published: "Sharing on Discord",
  rejected: "Discord rejected the activity",
  unavailable: "Native bridge unavailable"
};

async function refreshStatus() {
  const [reply, config, paused] = await Promise.all([
    chrome.runtime.sendMessage({ type: "status" }),
    chrome.storage.local.get(defaultSettings),
    getRules("session")
  ]);
  if (!reply) return;
  byId("setup-row").hidden = validId(config.applicationId);
  byId("status").textContent = !config.applicationId ? "Connect Discord to get started"
    : !config.enabled ? "Sharing off"
    : matchingHost(host, config.blockedHosts) ? "This site is excluded"
    : matchingHost(host, paused) ? "This site is paused"
    : stateText[reply.connection];
  byId("video").textContent = reply.activity?.title ?? "";
  byId("timing").textContent = reply.activity?.detail ?? "";
}

await updatePermissions();
await renderRules();
chrome.storage.onChanged.addListener((changes, area) => {
  if ((area === "local" && changes.blockedHosts) || (area === "session" && changes.pausedHosts)) void renderRules();
});
await refreshStatus();
setInterval(refreshStatus, 1000);
