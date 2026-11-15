export const defaultSettings = {
  enabled: false,
  applicationId: "",
  blockedHosts: [],
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
  } else if (matchingHost(host, ["anilibria.tv", "anilibria.uno"]) && /^\/release\/[\w-]+\.html$/.test(path)) {
    if (/^[1-9]\d{0,3}$/.test(linkEpisode)) page.hash = `play-s${linkEpisode}`;
  } else if (/\/(?:watch|view_video|videos?|player|play|embed|series|episode|episodes)(?:[/.]|$)/i.test(path)) {
    // Generic routes can carry an explicit media ID instead of putting it in the path.
    for (const key of ["video_id", "videoId", "episode_id", "episodeId"]) {
      keep(key, /^[A-Za-z0-9_-]{1,64}$/);
    }
    for (const key of ["season", "episode"]) keep(key, /^\d{1,4}$/);
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

export function toActivity(media, image = "") {
  if (!media || !["playing", "paused", "buffering"].includes(media.state)
      || !Number.isFinite(media.position) || media.position < 0
      || !Number.isFinite(media.rate) || media.rate <= 0) {
    return null;
  }
  let title = typeof media.title === "string"
    ? media.title.replace(/[\u0000-\u001f\u007f]/g, " ").trim()
    : "";
  const audio = media.audio === true;
  const episode = !audio && /^(.*?)[\s._-]*s(\d{1,2})[\s._-]*e(\d{1,3})(?=$|[\s._\[\]()-])(.*)$/i.exec(title);
  const spelledOut = !audio && (
    /^(.*?)\s*(?:[·|–—]|\s-)\s*Season\s+(\d{1,4}),?\s+Episode\s+(\d{1,4})$/i.exec(title)
    || /^(.*?)\s*\((\d{1,4})\s+сезон\)\s*[-–—]\s*(\d{1,4})\s+серия$/iu.exec(title)
  );
  const episodeOnly = !audio && (
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
  if (!audio && /^\d{1,4}$/.test(episodeNumber)) {
    const seasonLabel = /^\d{1,4}$/.test(seasonNumber) ? `S${Number(seasonNumber)} ` : "";
    episodeSuffix = ` · ${seasonLabel}Ep.${Number(episodeNumber)}`;
  }
  const artist = audio && typeof media.artist === "string"
    ? media.artist.replace(/[\u0000-\u001f\u007f]/g, " ").trim() : "";
  if (artist && title && title !== artist) title = `${artist} — ${title}`;
  const rate = `${media.rate.toFixed(2)}×`;
  const gap = rate.length < "31.25×".length ? " " : "\u2009";
  let detail = rate;
  if (media.live) {
    detail = `LIVE · ${rate}`;
  } else if (Number.isFinite(media.duration) && media.duration > 0) {
    const position = Math.min(media.position, media.duration);
    const remaining = Math.ceil((media.duration - position) / media.rate);
    const totalAtSpeed = Math.ceil(media.duration / media.rate);
    detail = `${time(position, media.duration)} / ${time(media.duration, media.duration)}${gap}·${gap}${rate} · ${time(remaining, totalAtSpeed)} left`;
  } else {
    detail = `${time(media.position, 0)}${gap}·${gap}${rate}`;
  }
  if (media.state === "buffering") detail += " · Buffering";
  title ||= audio ? "Audio" : "Video";
  if (media.source) title = `${media.source} · ${title}`;
  return {
    activityType: audio ? 2 : 3,
    linkEpisode: media.linkEpisode,
    title: `${Array.from(title).slice(0, 120 - episodeSuffix.length).join("")}${episodeSuffix}${media.state === "paused" ? " · ⏸\ufe0e" : ""}`,
    detail: detail.replace(/\d/g, digit => String.fromCodePoint(0x1d7f6 + Number(digit))),
    image: media.artwork ? fitArtwork(media.artwork) : browserArtworkKey(image)
  };
}

export function bestMedia(frames, now) {
  let best = null;
  for (const frame of frames) {
    if (!frame.media || now - frame.seenAt > 16_000) continue;
    if (!best || frame.media.score > best.media.score) best = frame;
  }
  return best?.media ?? null;
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
