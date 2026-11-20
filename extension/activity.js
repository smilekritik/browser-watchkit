export const defaultSettings = {
  enabled: true,
  applicationId: "1056962833218293800",
  blockedHosts: [],
  backgroundPlayback: true,
  shareLink: true,
  image: ""
};

export function validId(value) {
  return typeof value === "string" && /^\d{16,20}$/.test(value);
}

export function bridgeAdvice(error) {
  if (/host.*not found|specified native messaging host.*not registered/i.test(error ?? "")) {
    return "Extract the Windows release ZIP and run Install WatchKit.bat under your Chrome account.";
  }
  if (/access.*forbidden|not allowed|disabled by.*policy/i.test(error ?? "")) {
    return "Run Install WatchKit.bat again and reload WatchKit at chrome://extensions. If Chrome is managed, check its native messaging policy.";
  }
  return "Turn off sharing, exit Chrome completely, and rerun Install WatchKit.bat from the latest Windows release ZIP.";
}

const playbackPath = /^\/(?:anime\/)?(?:watch|videos?|player|play|series|episodes?)(?:\/|$)/i;
const episodeNumberPattern = /^\d{1,4}(?:\.\d{1,2})?$/;

export function episodeFromUrl(value) {
  let page;
  try {
    page = new URL(value);
  } catch {
    return null;
  }
  const route = playbackPath.exec(page.pathname);
  if (!["http:", "https:"].includes(page.protocol) || !route) return null;

  const parts = page.pathname.slice(route[0].length).split("/").filter(Boolean);
  if (!parts.length && !["video_id", "videoId", "episode_id", "episodeId"].some(key =>
    /^[\w-]{1,64}$/.test(page.searchParams.get(key) ?? ""))) return null;
  const pathEpisode = /^(?:episode|ep)[-_](\d{1,4}(?:\.\d{1,2})?)$/i.exec(parts.at(-1))?.[1];
  const episode = [page.searchParams.get("episode"), page.searchParams.get("ep"),
    parts.length > 1 ? pathEpisode : null].find(number => episodeNumberPattern.test(number));
  if (!episode) return null;

  const slug = parts.slice(0, pathEpisode ? -1 : undefined).at(-1) ?? "";
  const seasonSlug = /(?:^|[-_])season[-_](\d{1,4})$/i.exec(slug);
  const season = [page.searchParams.get("season"), seasonSlug?.[1]].find(number => /^\d{1,4}$/.test(number));
  const words = (seasonSlug ? slug.slice(0, seasonSlug.index) : slug).replace(/[-_]+/g, " ");
  // Opaque provider IDs are useful in links, but are not titles.
  const title = /^[a-z\d]+(?: [a-z\d]+)*$/i.test(words) && slug === slug.toLowerCase()
    && (seasonSlug || words.includes(" ") || (parts.length > 1 && !pathEpisode))
    ? words.replace(/\b[a-z]/g, letter => letter.toUpperCase()) : "";
  return { episode, season, title, host: page.hostname.replace(/^www\./, "") };
}

export function watchLink(value, linkEpisode) {
  let page;
  try {
    page = new URL(value);
  } catch {
    return "";
  }
  const host = page.hostname.replace(/\.$/, "");
  if (page.protocol !== "https:" || page.username || page.password || page.port
      || !/\.[a-z][a-z0-9-]*$/i.test(host)
      || /\.(?:localhost|local|internal|lan|home|test|invalid|example|onion)$/i.test(host)) return "";

  const params = new URLSearchParams(page.search);
  page.search = "";
  page.hash = "";
  const keep = (key, pattern) => {
    const value = params.get(key);
    if (pattern.test(value ?? "")) page.searchParams.set(key, value);
  };
  const path = page.pathname.replace(/\/$/, "");
  if (matchingHost(host, ["youtube.com"]) && path === "/watch") {
    keep("v", /^[\w-]{11}$/);
    if (!page.searchParams.has("v")) return "";
  } else if (matchingHost(host, ["pornhub.com"]) && path === "/view_video.php") {
    keep("viewkey", /^[A-Za-z0-9_-]{1,64}$/);
    if (!page.searchParams.has("viewkey")) return "";
  } else if (matchingHost(host, ["vkvideo.ru", "vk.com"]) && path === "/video_ext.php") {
    keep("oid", /^-?[1-9]\d{0,19}$/);
    keep("id", /^[1-9]\d{0,19}$/);
    if (!page.searchParams.has("oid") || !page.searchParams.has("id")) return "";
  } else if (matchingHost(host, ["bilibili.com"]) && path.startsWith("/video/")) {
    keep("p", /^[1-9]\d{0,3}$/);
  } else if (matchingHost(host, ["tiktok.com"])) {
    if (!/^\/@[\w.]{1,32}\/video\/\d{15,22}$/.test(path)) return "";
  } else if (matchingHost(host, ["instagram.com"])) {
    const reelId = /^\/(?:[\w.]{1,30}\/)?reels?\/([\w-]{5,32})(?:\/embed(?:\/captioned)?)?$/.exec(path)?.[1];
    return reelId ? "https://www.instagram.com/reel/" + reelId + "/" : "";
  } else if (matchingHost(host, ["anilibria.tv", "anilibria.uno"]) && /^\/release\/[\w-]+\.html$/.test(path)) {
    if (/^[1-9]\d{0,3}$/.test(linkEpisode)) page.hash = `play-s${linkEpisode}`;
  } else if (/\/(?:watch|view_video|videos?|player|play|embed|series|episode|episodes)(?:[/.]|$)/i.test(path)) {
    // Generic routes can carry an explicit media ID instead of putting it in the path.
    for (const key of ["video_id", "videoId", "episode_id", "episodeId"]) {
      keep(key, /^[A-Za-z0-9_-]{1,64}$/);
    }
    keep("season", /^\d{1,4}$/);
    keep("episode", episodeNumberPattern);
    if (episodeFromUrl(value)) keep("ep", episodeNumberPattern);
    if (params.size && !page.searchParams.size && /\/(?:watch|view_video|player|play|embed)(?:\.[a-z]+)?$/i.test(path)) {
      return "";
    }
  }
  return page.href.length <= 512 ? page.href : "";
}

export function allowedPage(url, blockedHosts) {
  try {
    const page = new URL(url);
    return ["https:", "http:", "file:"].includes(page.protocol)
      && !isSpotify(page.hostname) && !matchingHost(page.hostname || "file:", blockedHosts);
  } catch {
    return false;
  }
}

export function matchingHost(host, rules) {
  return rules.find(rule => host === rule || host.endsWith(`.${rule}`));
}

export function isSpotify(host) {
  return Boolean(matchingHost(host.replace(/\.$/, ""), ["spotify.com"]));
}

export function siteRule(value) {
  const input = value.trim();
  if (!input) return "";
  try {
    const url = new URL(input.includes("://") ? input : `https://${input}`);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "";
    const host = url.hostname.replace(/^www\./, "");
    return /^[a-z0-9-]+(?:\.[a-z0-9-]+)*$|^\[[a-f0-9:]+\]$/i.test(host) ? host : "";
  } catch {
    return "";
  }
}

function time(value, maximum) {
  const seconds = Math.max(0, Math.floor(value));
  const minutes = Math.floor(seconds / 60);
  const pad = n => String(n).padStart(2, "0");
  const hours = Math.floor(maximum / 3600);
  const clock = hours || seconds >= 3600
    ? `${String(Math.floor(minutes / 60)).padStart(String(hours).length, "0")}:${pad(minutes % 60)}:${pad(seconds % 60)}`
    : `${pad(minutes)}:${pad(seconds % 60)}`;
  return clock;
}

function playbackDuration(media) {
  return !media.live && Number.isFinite(media.duration) && media.duration > 0 ? media.duration : 0;
}

export function playbackRemaining(media) {
  const duration = playbackDuration(media);
  if (!duration || !Number.isFinite(media.position) || media.position < 0
      || !Number.isFinite(media.rate) || media.rate <= 0) return "";
  const totalAtSpeed = Math.ceil(duration / media.rate);
  if (!Number.isSafeInteger(totalAtSpeed)) return "";
  const remaining = Math.ceil(Math.max(0, duration - media.position) / media.rate);
  return `${time(remaining, totalAtSpeed)} left`;
}

function fitArtwork(artwork) {
  // Send only public video covers from the supported CDNs to the resizing service.
  const publicCover = /^https:\/\/i\.ytimg\.com\/vi\/[\w-]{11}\/hqdefault\.jpg$/
    .test(artwork) || /^https:\/\/i\d+\.(?:hdslb\.com|biliimg\.com)\/bfs\/archive\/[\w.-]+\.(?:jpe?g|png|webp)$/i
    .test(artwork);
  if (!publicCover) return artwork;

  const query = new URLSearchParams({
    url: artwork, w: "512", h: "512", fit: "contain", cbg: "black", output: "jpg"
  });
  return `https://wsrv.nl/?${query}`;
}

export function browserArtworkKey(image) {
  return image.trim().toLowerCase() === "vlc" ? "" : image.trim();
}

export function toActivity(media, image = "", background = false) {
  if (!media || !["playing", "paused", "buffering"].includes(media.state)
      || !Number.isFinite(media.position) || media.position < 0
      || !Number.isFinite(media.rate) || media.rate <= 0) {
    return null;
  }
  let title = typeof media.title === "string"
    ? media.title.replace(/[\u0000-\u001f\u007f]/g, " ").trim()
    : "";
  const audio = media.audio === true;
  const streamer = !audio && media.live && /^[a-z\d_-]{1,25}$/i.test(media.streamer ?? "") ? media.streamer : "";
  const episodic = !audio && !streamer && media.source !== "TikTok" && media.source !== "Instagram";
  const episode = episodic && /^(.*?)[\s._-]*s(\d{1,2})[\s._-]*e(\d{1,3})(?=$|[\s._\[\]()-])(.*)$/i.exec(title);
  const spelledOut = episodic && (
    /^(.*?)\s*(?:[·|–—]|\s-)\s*Season\s+(\d{1,4}),?\s+Episode\s+(\d{1,4})$/i.exec(title)
    || /^(.*?)\s*\((\d{1,4})\s+сезон\)\s*[-–—]\s*(\d{1,4})\s+серия$/iu.exec(title)
  );
  const episodeOnly = episodic && (
    /^(.*?)\s+[·|–—-]\s+(?:episode|ep\.|серия|эпизод)\s*(\d{1,4})$/iu.exec(title)
    || /^(.*?)\s+[·|–—-]\s+(\d{1,4})\s+(?:серия|эпизод)$/iu.exec(title)
  );
  let seasonNumber = media.season;
  let episodeNumber = media.episode;
  if (episode?.[1] && !/^\s*[-._ ]*e?\d{1,3}(?:$|[-._ ])/i.test(episode[4])) {
    title = `${episode[1]}${episode[4]}`;
    seasonNumber ??= episode[2];
    episodeNumber ??= episode[3];
  } else if (spelledOut) {
    title = spelledOut[1];
    seasonNumber ??= spelledOut[2];
    episodeNumber ??= spelledOut[3];
  } else if (episodeOnly?.[1]) {
    title = episodeOnly[1];
    episodeNumber ??= episodeOnly[2];
  }
  let episodeSuffix = "";
  if (!audio && episodeNumberPattern.test(episodeNumber)) {
    const seasonLabel = /^\d{1,4}$/.test(seasonNumber) ? `S${Number(seasonNumber)} ` : "";
    episodeSuffix = ` · ${seasonLabel}Ep.${Number(episodeNumber)}`;
  }
  const credit = media.creator || media.artist;
  const creator = typeof credit === "string" ? credit.replace(/[\u0000-\u001f\u007f]/g, " ").trim() : "";
  const duration = playbackDuration(media);
  let detail;
  if (media.live) {
    detail = streamer ? title || `Live on ${media.source}` : "LIVE";
  } else if (duration) {
    detail = `${time(Math.min(media.position, duration), duration)} / ${time(duration, duration)}`;
  } else {
    detail = time(media.position, 0);
  }
  if (media.rate !== 1) detail += ` · Speed ${media.rate}×`;
  if (media.state === "buffering") detail += " · Buffering";
  let summary = title || creator || (audio ? "Audio" : "Video");
  if ((audio || media.creator) && creator && title && title !== creator) summary = `${creator} — ${title}`;
  if (media.source) summary = `${media.source} · ${summary}`;
  const withEpisode = label => `${Array.from(label).slice(0, 120 - episodeSuffix.length).join("")}${episodeSuffix}`;
  const activity = {
    activityType: audio || background ? 2 : 3,
    paused: media.state === "paused",
    linkEpisode: media.linkEpisode,
    title: streamer ? `${media.source} · ${streamer}` : withEpisode(summary),
    detail,
    image: media.artwork ? fitArtwork(media.artwork) : browserArtworkKey(image),
    imageText: playbackRemaining(media)
  };
  if (streamer) activity.watchLabel = `Watch ${streamer}`;
  if (media.state === "playing" && media.rate === 1 && duration >= 1 && media.position < duration) {
    const start = Math.floor(media.sampledAt / 1000 - media.position);
    const end = start + Math.round(duration);
    if (Number.isSafeInteger(start) && start > 0 && Number.isSafeInteger(end)) {
      activity.start = start;
      activity.end = end;
      if (media.source && title && title !== creator) {
        const site = creator && creator !== media.source ? `${media.source} · ${creator}` : media.source;
        activity.discordTitle = Array.from(site).slice(0, 120).join("");
        activity.discordState = withEpisode(title);
      }
    }
  }
  return activity;
}

export const sampleLifetime = 16_000;

export function bestMedia(frames, now, background = false) {
  let best = null;
  for (const frame of frames) {
    if (!frame.media || now - frame.seenAt >= sampleLifetime) continue;
    if (background && (frame.media.state === "paused" || frame.media.muted)) continue;
    if (!best || frame.media.score > best.media.score) best = frame;
  }
  return best?.media ?? null;
}

export function choosePlayback(tabs, activeTabId, previousTabId, now) {
  const activeTab = tabs.get(activeTabId);
  const activeMedia = activeTab && bestMedia(activeTab.samples.values(), now);
  const foreground = activeMedia ? { tab: activeTab, media: activeMedia, background: false } : null;
  if (foreground && activeMedia.state !== "paused" && !activeMedia.muted && !activeTab.muted) return foreground;

  let background = null;
  for (const tab of tabs.values()) {
    if (tab.id === activeTabId || !tab.audible || tab.muted) continue;
    const media = bestMedia(tab.samples.values(), now, true);
    if (!media) continue;
    const candidate = { tab, media, background: true };
    if (tab.id === previousTabId) return candidate;
    if (!background || tab.lastAccessed > background.tab.lastAccessed) background = candidate;
  }
  return background ?? foreground;
}

const pagePlayers = new Map([
  ["YummyAnime", ["kodikplayer.com"]],
  ["Habster", ["befriend.stravers.live", "initem.ws"]]
]);

export function withPageMetadata(media, page) {
  if (page?.source === "AniLiberty" && media && !media.audio && page.episodes?.[media.source]) {
    return { ...media, source: page.source, title: page.title,
      episode: page.episodes[media.source] || media.episode, artwork: page.artwork || media.artwork };
  }
  if (!page || !media || !matchingHost(media.source ?? "", pagePlayers.get(page.source) ?? [])) return media;
  return { ...media, source: page.source, title: page.title,
    episode: page.episode ?? media.episode, artwork: page.artwork || media.artwork };
}

export function withEpisodePage(media, episode, page) {
  if (!media || media.audio || !episode) return media;
  const title = page?.title || episode.title || media.title;
  const seasonSuffix = /\s+season\s+(\d{1,4})$/i.exec(title);
  return { ...media, source: page?.source || episode.host,
    title: seasonSuffix && episode.season && Number(seasonSuffix[1]) === Number(episode.season)
      ? title.slice(0, seasonSuffix.index) : title,
    season: episode.season ?? media.season,
    episode: episode.episode,
    artwork: page?.artwork || media.artwork };
}
