export const byId = id => document.getElementById(id);
export const allWeb = ["http://*/*", "https://*/*"];

const ruleStores = {
  permanent: [chrome.storage.local, "blockedHosts"],
  session: [chrome.storage.session, "pausedHosts"]
};

export async function getRules(kind) {
  const [storage, key] = ruleStores[kind];
  return (await storage.get({ [key]: [] }))[key];
}

export async function setRule(kind, rule, include) {
  const [storage, key] = ruleStores[kind];
  const rules = new Set(await getRules(kind));
  if (include) rules.add(rule);
  else rules.delete(rule);
  await storage.set({ [key]: [...rules] });
  if (include && kind === "permanent") await setRule("session", rule, false);
}
