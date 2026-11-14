export const defaultSettings = {
  enabled: false,
  applicationId: "",
  blockedHosts: [],
  image: ""
};

export function validId(value) {
  return typeof value === "string" && /^\d{16,20}$/.test(value);
}

export function allowedPage(url, blockedHosts) {
  try {
    const page = new URL(url);
    return ["https:", "http:", "file:"].includes(page.protocol)
      && !matchingHost(page.hostname || "file:", blockedHosts);
  } catch {
    return false;
  }
}

export function matchingHost(host, rules) {
  return rules.find(rule => host === rule || host.endsWith(`.${rule}`));
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
  const episode = /^(.*?)[\s._-]*s(\d{1,2})[\s._-]*e(\d{1,3})(?=$|[\s._\[\]()-])(.*)$/i.exec(title);
  if (episode?.[1] && !/^\s*[-._ ]*e?\d{1,3}(?:$|[-._ ])/i.test(episode[4])) {
    title = `${episode[1]}${episode[4]} · S${Number(episode[2])} Ep.${Number(episode[3])}`;
  }
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
  if (media.source) title = `${media.source} · ${title || "Video"}`;
  return {
    title: `${Array.from(title || "Video").slice(0, 120).join("")}${media.state === "paused" ? " · ⏸\ufe0e" : ""}`,
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
  if (!page || !media || !matchingHost(media.source ?? "", pagePlayers.get(page.source) ?? [])) return media;
  let title = page.title;
  if (page.source === "Habster" && media.episode) {
    title += media.season ? ` · Season ${media.season}, Episode ${media.episode}` : ` · Episode ${media.episode}`;
  }
  return { ...media, source: page.source, title, artwork: page.artwork || media.artwork };
}
