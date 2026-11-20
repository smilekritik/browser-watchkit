import { bridgeAdvice, browserArtworkKey, defaultSettings, siteRule, validId } from "./activity.js";
import { allWeb, byId, getRules, getSettings, mediaWeb, setRule } from "./preferences.js";

const application = byId("application");
const image = byId("image");
const backgroundPlayback = byId("background-playback");
const shareLink = byId("share-link");
const discordNotice = byId("discord-notice");
const rulesNotice = byId("rules-notice");
const allowMedia = byId("allow-media");
const allowAll = byId("allow-all");
const saved = await getSettings();
application.value = saved.applicationId;
image.value = browserArtworkKey(saved.image);
backgroundPlayback.checked = saved.backgroundPlayback;
shareLink.checked = saved.shareLink;

byId("show-id").onclick = event => {
  const show = application.type === "password";
  application.type = show ? "text" : "password";
  event.currentTarget.textContent = show ? "Hide" : "Show";
  event.currentTarget.setAttribute("aria-label", show ? "Hide Application ID" : "Show Application ID");
};

byId("config").onsubmit = async event => {
  event.preventDefault();
  const applicationId = application.value.trim() || defaultSettings.applicationId;
  if (!validId(applicationId)) {
    discordNotice.textContent = "Enter the 16–20 digit Application ID from the WatchKit setup guide or Discord Developer Portal.";
    application.focus();
    return;
  }
  try {
    image.value = browserArtworkKey(image.value);
    await chrome.storage.local.set({ applicationId, image: image.value,
      backgroundPlayback: backgroundPlayback.checked, shareLink: shareLink.checked });
    application.value = applicationId;
    discordNotice.textContent = "Settings saved.";
  } catch {
    discordNotice.textContent = "Could not save Discord settings.";
  }
};

byId("import-vlc").onclick = async () => {
  try {
    const config = await chrome.runtime.sendNativeMessage("com.smilekritik.browser_watchkit", { type: "import-vlc" });
    if (!validId(config?.applicationId)) {
      discordNotice.textContent = "WatchKit for VLC has no saved Application ID.";
      return;
    }
    await chrome.storage.local.set({ applicationId: config.applicationId });
    application.value = config.applicationId;
    discordNotice.textContent = "Application ID imported.";
  } catch (error) {
    discordNotice.textContent = bridgeAdvice(error.message);
  }
};

async function updateAccess() {
  const [granted, mediaGranted] = await Promise.all([
    chrome.permissions.contains({ origins: allWeb }),
    chrome.permissions.contains({ origins: mediaWeb })
  ]);
  allowAll.textContent = granted ? "Remove all-sites access" : "Allow all websites";
  allowAll.dataset.granted = String(granted);
  allowMedia.disabled = mediaGranted;
  allowMedia.textContent = mediaGranted ? "Media sites allowed" : "Allow media sites";
}

allowMedia.onclick = async () => {
  const notice = byId("access-notice");
  try {
    const granted = await chrome.permissions.request({ origins: mediaWeb });
    notice.textContent = granted ? "" : "Site access was declined.";
    await updateAccess();
  } catch {
    notice.textContent = "Could not grant access to the media sites.";
  }
};

allowAll.onclick = async () => {
  const notice = byId("access-notice");
  try {
    const granted = allowAll.dataset.granted === "true";
    const changed = granted ? await chrome.permissions.remove({ origins: allWeb })
      : await chrome.permissions.request({ origins: allWeb });
    notice.textContent = changed ? "" : "Website access stayed the same.";
    await updateAccess();
  } catch {
    notice.textContent = "Could not change website access.";
  }
};

async function updateRules() {
  const [permanent, session] = await Promise.all([getRules("permanent"), getRules("session")]);
  const rules = [
    ...permanent.map(rule => ({ rule, kind: "permanent" })),
    ...session.filter(rule => !permanent.includes(rule)).map(rule => ({ rule, kind: "session" }))
  ];
  byId("rules-list").replaceChildren(...rules.map(({ rule, kind }) => {
    const row = document.createElement("li");
    const label = document.createElement("div");
    const domain = document.createElement("strong");
    domain.textContent = rule === "file:" ? "Local files" : rule;
    const description = document.createElement("p");
    description.className = "hint";
    description.textContent = kind === "session" ? "Paused until Chrome restarts" : "Excluded";
    label.append(domain, description);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove rule for ${domain.textContent}`);
    remove.onclick = async () => {
      try {
        await setRule(kind, rule, false);
        await updateRules();
        rulesNotice.textContent = "Site rule removed.";
        byId("site-rule").focus();
      } catch {
        rulesNotice.textContent = "Could not remove the site rule.";
      }
    };
    row.append(label, remove);
    return row;
  }));
  byId("rules-empty").hidden = rules.length > 0;
}

byId("add-site").onsubmit = async event => {
  event.preventDefault();
  const field = byId("site-rule");
  const rule = siteRule(field.value);
  if (!rule) {
    rulesNotice.textContent = "Enter a domain or website URL.";
    field.focus();
    return;
  }
  try {
    await setRule("permanent", rule, true);
    field.value = "";
    rulesNotice.textContent = "Site excluded.";
    await updateRules();
  } catch {
    rulesNotice.textContent = "Could not save the site rule.";
  }
};

const commands = await chrome.commands.getAll();
const shortcut = commands.find(command => command.name === "toggle-sharing")?.shortcut;
byId("shortcut-key").textContent = shortcut ?? "";
byId("shortcut-key").hidden = !shortcut;
byId("shortcut-settings").onclick = () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
const reloadButton = byId("reload-extension");
reloadButton.onclick = async () => {
  reloadButton.disabled = true;
  try {
    const reply = await chrome.runtime.sendMessage({ type: "prepare-reload" });
    if (reply?.ready) {
      chrome.runtime.reload();
      return;
    }
  } catch {
    if (!globalThis.chrome?.runtime?.id) return;
  }
  reloadButton.disabled = false;
  discordNotice.textContent = "Could not reload WatchKit. Try again.";
};
chrome.storage.onChanged.addListener((changes, area) => {
  if ((area === "local" && changes.blockedHosts) || (area === "session" && changes.pausedHosts)) void updateRules();
});
chrome.permissions.onAdded.addListener(updateAccess);
chrome.permissions.onRemoved.addListener(updateAccess);
await Promise.all([updateAccess(), updateRules()]);
