import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { toActivity, watchLink } from "../extension/activity.js";

const mediaScript = readFileSync(new URL("../extension/media.js", import.meta.url), "utf8");

function track(url, { title = "", selectors = {}, images = [], top = false, media = {}, metadata,
  audio = false, player = null, episodePage = false, covers = [], pageMetadata = false,
  structuredData = [], failSend, detached = false } = {}) {
  const watchWindow = {};
  watchWindow.top = top ? watchWindow : {};
  const sent = [];
  let onMessage;
  class Media {
    isConnected = true;
    currentTime = 20;
    duration = 1400;
    playbackRate = 1;
    volume = 1;
    addEventListener() {}
    removeEventListener() {}
    getAttribute() { return null; }
    closest(selector) { return selector === "#anilibriaPlayer" ? player : null; }
    getBoundingClientRect() { return { left: 0, top: 0, right: 640, bottom: 360 }; }
  }
  class Audio extends Media {}
  const video = audio ? new Audio() : new Media();
  Object.assign(video, media);
  const document = {
    title,
    baseURI: url,
    nodeType: 9,
    isConnected: true,
    createTreeWalker() {
      let next = video;
      return { nextNode() { const element = next; next = null; return element; } };
    },
    querySelector: selector => selectors[selector],
    getElementById: id => selectors[`#${id}`],
    querySelectorAll: selector => {
      if (selector === 'script[type="application/ld+json"]') return structuredData;
      return selector === "img[data-cover-target], a[href] img" ? covers : images;
    },
    addEventListener() {},
    removeEventListener() {}
  };
  runInNewContext(mediaScript, {
    URL, document, window: watchWindow, location: new URL(url),
    navigator: { mediaSession: { metadata } }, performance: { now: () => 0 }, innerWidth: 640, innerHeight: 360,
    Node: { ELEMENT_NODE: 1, DOCUMENT_NODE: 9, DOCUMENT_FRAGMENT_NODE: 11 },
    NodeFilter: { SHOW_ELEMENT: 1 }, HTMLMediaElement: Media, HTMLAudioElement: Audio,
    MutationObserver: class { observe() {} disconnect() {} },
    getComputedStyle: () => ({ visibility: "visible" }),
    addEventListener() {}, removeEventListener() {}, setTimeout() {}, clearTimeout() {},
    chrome: { runtime: {
      id: detached ? undefined : "watchkit-test",
      onMessage: { addListener: listener => { onMessage = listener; } },
      sendMessage: message => {
        sent.push(message);
        if (failSend) failSend(message);
        return Promise.resolve({ watching: true });
      }
    } }
  });
  onMessage({ type: "watch", token: "test", episodePage });
  if (detached) return sent;
  if (pageMetadata) return sent.find(message => message.type === "page-metadata")?.page.episodePage;
  return sent.find(message => message.type === "media").media;
}

test("uses the Twitch login and stream title as separate lines and links to the live channel", () => {
  const channel = "https://www.twitch.tv/koma";
  const title = "NEW PATCH & 9K CARRY & LETS GO !tg !vtb";
  const metadata = { "@type": "VideoObject", name: "Koma - Twitch",
    embedUrl: "https://player.twitch.tv/?channel=koma&parent=meta.tag",
    publication: { isLiveBroadcast: true } };
  const opts = {
    top: true, title: "Koma - Live on Twitch",
    selectors: {
      'meta[property="og:url"]': { content: channel },
      'meta[property="og:description"]': { content: title + " | Streaming dota 2." }
    },
    structuredData: [{ textContent: JSON.stringify({ "@graph": [metadata] }) }]
  };
  const media = track(channel + "?referrer=ignored", opts);
  const activity = toActivity(media);
  assert.equal(media.live, true);
  assert.equal(media.streamer, "koma");
  assert.equal(activity.title, "Twitch · koma");
  assert.equal(activity.detail, title);
  assert.equal(activity.watchLabel, "Watch koma");
  assert.equal(activity.activityType, 3);
  assert.equal(watchLink(media.streamUrl), channel);
  assert.equal(activity.end, undefined);

  const changedTitle = track(channel, { ...opts, selectors: {
    ...opts.selectors, '[data-a-target="stream-title"]': { textContent: "New stream title — Episode 4" }
  } });
  assert.equal(toActivity(changedTitle).detail, "New stream title — Episode 4");
  assert.equal(track("https://www.twitch.tv/videos/1234", opts).streamer, undefined);
  assert.equal(track("https://www.twitch.tv/someone_else", opts).streamer, undefined);
  const embed = track("https://player.twitch.tv/?channel=koma&parent=example.com", {
    media: { duration: Infinity }, metadata: { title }
  });
  assert.equal(embed.streamUrl, channel);
  assert.equal(toActivity(embed).title, "Twitch · koma");
  assert.equal(toActivity(embed).detail, title);
});

test("labels Kick live channels while retaining ordinary playback for recordings", () => {
  const channel = "https://kick.com/example-streamer";
  const title = "Live from the studio";
  const opts = { structuredData: [{ textContent: JSON.stringify({ "@graph": [{
    "@type": "VideoObject", name: title, url: channel, publication: [{ isLiveBroadcast: true }]
  }] }) }] };
  const sample = track(channel, opts);
  assert.equal(toActivity(sample).title, "Kick · example-streamer");
  assert.equal(toActivity(sample).detail, title);
  assert.equal(toActivity(sample).watchLabel, "Watch example-streamer");
  assert.equal(sample.streamUrl, channel);
  const recording = track(channel + "/videos/1234", opts);
  assert.equal(recording.live, false);
  assert.equal(toActivity(recording).watchLabel, undefined);
});

test("stops tracking when Chrome invalidates the extension context during a send", () => {
  const invalidated = () => { throw new Error("Extension context invalidated."); };
  assert.doesNotThrow(() => track("https://music.youtube.com/watch?v=J63aZNuoRek", {
    top: true, failSend: invalidated
  }));
  assert.doesNotThrow(() => track("https://example.com/watch/1234/example?ep=1", {
    top: true, episodePage: true, pageMetadata: true, failSend: invalidated
  }));
});

test("does not send updates from a content script detached by an extension reload", () => {
  assert.deepEqual(track("https://music.youtube.com/watch?v=J63aZNuoRek", { top: true, detached: true }), []);
});

test("prefers the current show's cover over generic metadata and other titles", () => {
  const url = "https://example.com/watch/current-id/aoashi-season-2?ep=7";
  const cover = "https://cdn.example.com/aoashi.jpg";
  const fallback = "https://example.com/icon-output.png";
  const poster = (src, target, link, naturalWidth = 460) => ({
    naturalWidth, naturalHeight: 650, complete: true,
    currentSrc: src, closest: () => link,
    getAttribute: name => name === "data-cover-target" ? target : src
  });
  const opts = { top: true, episodePage: true, pageMetadata: true, images: [{ content: fallback }] };
  const another = poster("https://cdn.example.com/another.jpg", "another-id",
    new URL("/info/another-id/another-show", url));
  const linked = new URL("/info/current-id/aoashi-season-2", url);
  assert.equal(track(url, { ...opts, covers: [another, poster(cover, "current-id")] }).artwork, cover);
  assert.equal(track(url, { ...opts, covers: [
    another, poster("https://cdn.example.com/banner.jpg", null, linked, 1600), poster(cover, null, linked)
  ] }).artwork, cover);
  assert.equal(track(url, { ...opts, covers: [another, poster(cover + "?token=private", "current-id")] }).artwork, fallback);
  assert.equal(track(url, { ...opts, covers: [another, poster(cover, "current-id", null, 0)] }).artwork, fallback);
});

test("reads the selected TikTok clip's caption, author, signed cover and permalink", () => {
  const url = "https://www.tiktok.com/@user_play_opera.haus/video/7707755453681323286";
  const coverUrl = "https://p16-common-sign.tiktokcdn.com/tos-no1a-p-0037-no/poster~tplv-tiktokx-origin.image"
    + "?x-expires=1794768000&x-signature=sig%3D&shp=123";
  const poster = { alt: "Посадила. Вырастила. Собрала урожай. #Arknights", currentSrc: coverUrl, getAttribute: () => "" };
  const author = { pathname: "/@user_play_opera.haus", textContent: "Wait_FoxsE" };
  const overlay = { querySelector: () => author };
  const options = {
    title: "(18)TikTok - Make Your Day", top: true,
    selectors: { '[data-e2e="anchoring-description-layer"]': overlay },
    media: { closest: selector => selector.includes("xgwrapper")
      ? { id: "xgwrapper-0-7707755453681323286" } : { querySelector: selector => selector.startsWith("img") ? poster : null } }
  };
  const sample = track(url, options);
  assert.equal(sample.creator, "Wait_FoxsE");
  assert.equal(sample.title, "Посадила. Вырастила. Собрала урожай.");
  const activity = toActivity({ ...sample, sampledAt: 1_800_000_000_000 });
  assert.equal(activity.discordTitle, "TikTok · Wait_FoxsE");
  assert.equal(activity.discordState, sample.title);
  assert.equal(sample.artwork, coverUrl);
  assert.equal(sample.clipUrl, url);
  assert.equal(sample.position, 20);
  poster.currentSrc = coverUrl + "&token=private";
  assert.equal(track(url, options).artwork, "");
  poster.currentSrc = coverUrl.replace("tiktokcdn.com", "tiktokcdn.com.example.com");
  assert.equal(track(url, options).artwork, "");
  options.selectors = {};
  assert.equal(track(url, options).creator, "@user_play_opera.haus");
  const video = options.media;
  const feed = track("https://www.tiktok.com/", { ...options, media: {
    closest: selector => selector.includes("xgwrapper") ? video.closest(selector)
      : { querySelector: query => query.startsWith("img") ? poster : author }
  } });
  assert.equal(feed.clipUrl, url);
  assert.equal(track("https://www.tiktok.com/", options).clipUrl, "");
});

test("reads Instagram Reel metadata only from the active Reel", () => {
  const reel = "https://www.instagram.com/reel/Dd1gQBsCWE8/";
  const cover = "https://scontent-iev1-1.cdninstagram.com/v/t51.82787-15/825320801_n.jpg"
    + "?stp=c1&ccb=7-5&_nc_ohc=signed&oh=sig&oe=6A01";
  const head = url => ({
    'meta[property="og:url"]': { content: url },
    'meta[property="og:title"]': { content: 'NASA on Instagram: "What happens next?"' },
    'meta[property="og:image"]': { content: cover }
  });
  const direct = track(reel, { top: true, selectors: head("https://www.instagram.com/nasa/reel/Dd1gQBsCWE8/") });
  assert.equal(direct.source, "Instagram");
  assert.equal(direct.creator, "NASA");
  assert.equal(direct.title, "What happens next?");
  assert.equal(direct.artwork, cover);
  assert.equal(direct.clipUrl, reel);
  assert.equal(direct.position, 20);

  const second = "https://www.instagram.com/reel/Deb2Next_ID/";
  const container = {
    matches: () => false,
    querySelectorAll: selector => selector === "video" ? [{}] : [{ href: second + "?igsh=private" }],
    querySelector: selector => selector.includes("post-caption")
      ? { textContent: "Next video S2E7" } : new URL("https://www.instagram.com/creator/")
  };
  const feed = track("https://www.instagram.com/reels/", {
    top: true, selectors: head(reel), media: { parentElement: container, poster: cover + "&token=private" }
  });
  assert.equal(feed.creator, "@creator");
  assert.equal(feed.title, "Next video S2E7");
  assert.equal(feed.clipUrl, second);
  assert.equal(feed.artwork, "");

  const stale = track(second, { top: true, selectors: head(reel) });
  assert.equal(stale.title, "Reel");
  assert.equal(stale.artwork, "");
  assert.equal(track("https://www.instagram.com/reels/", { top: true, selectors: head(reel) }).clipUrl, "");
});

test("reads Alloha's selected controls and Collaps's current episode title", () => {
  const alloha = track("https://befriend.stravers.live/", { selectors: {
    '[data-select="seasonType1"] .select__item .select__item-text': { textContent: "Сезон 2" },
    '[data-select="episodeType1"] .select__item .select__item-text': { textContent: "Серия 4" }
  } });
  assert.equal(alloha.season, "2");
  assert.equal(alloha.episode, "4");
  const collaps = track("https://api.initem.ws/embed/kp/4541515", { title: "Укрытие (3 сезон) - 10 серия" });
  assert.equal(collaps.season, "3");
  assert.equal(collaps.episode, "10");
});

test("uses the largest square YouTube Music cover without adding padding", () => {
  const url = "https://music.youtube.com/watch?v=J63aZNuoRek";
  const cover = "https://lh3.googleusercontent.com/album=w512-h512";
  const sample = track(url, { top: true, metadata: { artwork: [
    { src: cover, sizes: "512x512" },
    { src: "https://lh3.googleusercontent.com/album=w120-h120", sizes: "120x120" },
    { src: "https://i.ytimg.com/vi/J63aZNuoRek/hqdefault.jpg", sizes: "480x360" },
  ] } });
  assert.equal(toActivity(sample).image, cover);
  assert.equal(track(url, { top: true }).artwork, "https://i.ytimg.com/vi/J63aZNuoRek/hqdefault.jpg");
});

test("uses the YouTube Music player clock for position, duration and time left", () => {
  const url = "https://music.youtube.com/watch?v=J63aZNuoRek";
  const media = { currentTime: 202, duration: 302 };
  const sample = track(url, { title: "Observing Medley", top: true, media, metadata: { artist: "Mea Kagura" }, selectors: {
    "ytmusic-player-bar .time-info": { textContent: " 0:37 / 3:30 " }
  } });
  assert.equal(sample.source, "YouTube Music");
  const activity = toActivity({ ...sample, sampledAt: 1_800_000_000_000 });
  assert.equal(activity.activityType, 2);
  assert.equal(sample.position, 37);
  assert.equal(sample.duration, 210);
  assert.equal(activity.detail, "00:37 / 03:30");
  assert.equal(activity.discordTitle, "YouTube Music · Mea Kagura");
  assert.equal(activity.discordState, "Observing Medley");
  assert.equal(activity.end - activity.start, 210);
  assert.equal(track(url, { top: true, media }).duration, 302);
});

test("publishes audio providers and native audio players as Listening", () => {
  for (const [url, source] of [
    ["https://music.apple.com/us/album/test/123", "Apple Music"],
    ["https://play.pocketcasts.com/podcasts", "Pocket Casts"],
    ["https://w.soundcloud.com/player/", "SoundCloud"],
    ["https://artist.bandcamp.com/track/song", "Bandcamp"],
    ["https://music.yandex.ru/album/123", "Яндекс Музыка"],
    ["https://www.bbc.com/sounds/play/test", "BBC Sounds"]
  ]) {
    const sample = track(url, { top: true, media: {
      getBoundingClientRect: () => ({ left: 0, right: 0, top: 0, bottom: 0 })
    }, metadata: { title: "S1E3", artist: "The Artist" } });
    assert.equal(toActivity(sample).activityType, 2, url);
    assert.equal(toActivity(sample).title, `${source} · The Artist — S1E3`);
  }
  const audio = track("https://example.com/song", { audio: true, top: true, metadata: { title: "Track" } });
  assert.equal(toActivity(audio).activityType, 2);
  assert.equal(track("https://example.com/embed", { audio: true }), null);
  assert.equal(toActivity(track("https://www.bbc.com/news/video", { top: true })).activityType, 3);
  assert.equal(toActivity(track("https://tv.apple.com/watch", { top: true })).activityType, 3);
});

test("reads the active AniLiberty playlist entry and parses the new episode page", () => {
  const title = "Свадьба светлячков / Hotaru no Yomeiri";
  const legacy = "https://www.anilibria.tv/release/hotaru-no-yomeiri.html";
  for (const episode of [1, 3]) {
    const sample = track(legacy, { top: true, title, player: {}, selectors: {
      "#anilibriaPlayer_playlist": { querySelector: selector => selector === ".pjs-anilibriaPlayer-active-pl"
        ? { textContent: `Серия ${episode}` } : null }
    } });
    assert.equal(toActivity(sample).title, `AniLiberty · ${title} · Ep.${episode}`);
  }
  const modern = track("https://aniliberty.top/anime/video/episode/id", {
    top: true, title: "Эпизод 6 | Искренние чувства | Свадьба светлячков | AniLiberty"
  });
  assert.equal(toActivity(modern).title, "AniLiberty · Свадьба светлячков · Ep.6");
});

test("uses VK video metadata and skips artwork URLs carrying parameters", () => {
  const video = track("https://vk.com/video_ext.php", {
    title: "VK",
    selectors: { 'meta[property="og:title"]': { content: "Example video" } },
    images: [
      { content: "https://video.example/private.jpg?token=123" },
      { getAttribute: () => "https://video.example/public.jpg" }
    ]
  });
  assert.equal(video.source, "VK Video");
  assert.equal(video.title, "Example video");
  assert.equal(video.artwork, "https://video.example/public.jpg");
});
