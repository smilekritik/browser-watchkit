import test from "node:test";
import assert from "node:assert/strict";
import { allowedPage, bestMedia, bridgeAdvice, choosePlayback, defaultSettings, episodeFromUrl,
  playbackRemaining, toActivity, validId, watchLink, withEpisodePage, withPageMetadata } from "../extension/activity.js";

const paused = { title: "Episode 4", position: 93, duration: 2514, rate: 1.25, state: "paused" };

test("reads the selected episode from playback routes on any host", () => {
  const miruro = "https://barelystarted.miruro.tv/watch/DlRBmYglhr_EA9RijDFnuQ20sg5uNmkI/aoashi-season-2?ep=7";
  const episode = episodeFromUrl(miruro);
  assert.deepEqual(episode, { episode: "7", season: "2", title: "Aoashi", host: "barelystarted.miruro.tv" });
  const video = { ...paused, title: "Player", source: "iframe.example.net", state: "playing" };
  const merged = withEpisodePage(video, episode, { source: "Miruro", title: "Aoashi Season 2" });
  const activity = toActivity(merged);
  assert.equal(activity.title, "Miruro · Aoashi · S2 Ep.7");
  assert.equal(activity.detail, toActivity(video).detail);
  assert.equal(toActivity(withEpisodePage(video, episodeFromUrl(miruro.replace("ep=7", "ep=8")))).title,
    "barelystarted.miruro.tv · Aoashi · S2 Ep.8");
  assert.equal(watchLink(miruro + "&token=private#saved"), miruro);

  const generic = "https://example.com/anime/watch/some-show/episode-12.5?season=3";
  assert.equal(toActivity(withEpisodePage(video, episodeFromUrl(generic))).title, "example.com · Some Show · S3 Ep.12.5");
  assert.equal(watchLink(generic), generic);
  assert.equal(episodeFromUrl("https://example.com/anime/watch/123?episode=0&season=1").episode, "0");
  assert.equal(episodeFromUrl("https://example.com/profile/podcasts?ep=7"), null);
  assert.equal(episodeFromUrl("https://example.com/watch/some-show?ep=token"), null);
  assert.equal(episodeFromUrl("https://example.com/watch/token?episodeId=123456"), null);
  assert.equal(episodeFromUrl("https://www.youtube.com/watch?v=M7lc1UVf-VE&ep=7"), null);
  assert.equal(watchLink("https://example.com/watch/token?ep=private"), "https://example.com/watch/token");
  const audio = { ...video, audio: true };
  assert.equal(withEpisodePage(audio, episode), audio);
  assert.equal(withEpisodePage(null, episode), null);
});

test("maps Chrome native messaging failures to a setup step", () => {
  assert.match(bridgeAdvice("Specified native messaging host not found."), /Extract the Windows release ZIP/);
  assert.match(bridgeAdvice("Access to the specified native messaging host is forbidden."), /chrome:\/\/extensions/);
  assert.match(bridgeAdvice("Native host has exited."), /exit Chrome completely/);
});

test("shares a video page without credentials, fragments or unrelated parameters", () => {
  assert.equal(watchLink("https://www.youtube.com/watch?v=M7lc1UVf-VE&token=private#part"),
    "https://www.youtube.com/watch?v=M7lc1UVf-VE");
  assert.equal(watchLink("https://www.bilibili.com/video/BV123?p=2&from=home"), "https://www.bilibili.com/video/BV123?p=2");
  assert.equal(watchLink("https://habster.sbs/series/4541515/?utm_referrer=search"), "https://habster.sbs/series/4541515/");
  assert.equal(watchLink("https://www.anilibria.tv/release/hotaru-no-yomeiri.html?token=private#play-s1", "3"),
    "https://www.anilibria.tv/release/hotaru-no-yomeiri.html#play-s3");
  assert.equal(watchLink("https://www.anilibria.tv/release/hotaru-no-yomeiri.html#secret", "1?token"),
    "https://www.anilibria.tv/release/hotaru-no-yomeiri.html");
  for (const url of ["file:///C:/example.mp4", "https://localhost/video", "https://192.168.1.2/video",
    "https://user:pass@youtube.com/watch?v=M7lc1UVf-VE", "https://youtube.com/watch?token=private",
    `https://habster.sbs/${"a".repeat(512)}`]) {
    assert.equal(watchLink(url), "");
  }
});

test("shares only the direct TikTok clip and preserves captions containing episode-like text", () => {
  const clip = "https://www.tiktok.com/@user_play_opera.haus/video/7707755453681323286";
  assert.equal(watchLink(clip + "?_r=1&token=private#ignored"), clip);
  assert.equal(watchLink("https://www.tiktok.com/following"), "");
  const result = toActivity({ ...paused, source: "TikTok", title: "Author — Edit S2E7", state: "playing" });
  assert.equal(result.title, "TikTok · Author — Edit S2E7");
});

test("shares a canonical Instagram Reel without disclosing the feed or tracking parameters", () => {
  const reel = "https://www.instagram.com/reel/Dd1gQBsCWE8/";
  assert.equal(watchLink("https://www.instagram.com/nasa/reel/Dd1gQBsCWE8/?igsh=private#fragment"), reel);
  assert.equal(watchLink("https://instagram.com/reels/Dd1gQBsCWE8/embed/captioned/"), reel);
  assert.equal(watchLink("https://www.instagram.com/reels/"), "");
  assert.equal(watchLink("https://www.instagram.com/nasa/reels/"), "");
  const result = toActivity({ ...paused, source: "Instagram", title: "@creator — Edit S2E7", state: "playing" });
  assert.equal(result.title, "Instagram · @creator — Edit S2E7");
});

test("retains video and episode identifiers across link formats", () => {
  const links = [
    ["https://rt.pornhub.com/view_video.php?viewkey=ph123abc&utm_source=example",
      "https://rt.pornhub.com/view_video.php?viewkey=ph123abc"],
    ["https://music.youtube.com/watch?v=J63aZNuoRek&list=RD123",
      "https://music.youtube.com/watch?v=J63aZNuoRek"],
    ["https://vkvideo.ru/video_ext.php?oid=-123&id=456&autoplay=1",
      "https://vkvideo.ru/video_ext.php?oid=-123&id=456"],
    ["https://watch.example.com/player?videoId=abcd1234&season=3&episode=10&access_token=secret",
      "https://watch.example.com/player?videoId=abcd1234&season=3&episode=10"],
    ["https://rutube.ru/video/7716bd3e665725c3c008ae7ab4ff02e2/?utm_source=example",
      "https://rutube.ru/video/7716bd3e665725c3c008ae7ab4ff02e2/"],
    ["https://rt.pornhub.com/view_video.php?token=secret", ""],
    ["https://watch.example.com/player?token=secret", ""]
  ];
  for (const [input, expected] of links) assert.equal(watchLink(input), expected, input);
});

test("uses YummyAnime metadata for Kodik while keeping the player's timing", () => {
  const kodik = { ...paused, source: "kodikplayer.com", title: "Kodik Player", state: "playing" };
  const page = {
    source: "YummyAnime",
    title: "Great Lord! 3rd Season",
    episode: "9",
    artwork: "https://static.yani.tv/posters/full/1636859220.jpg"
  };
  const activity = toActivity(withPageMetadata(kodik, page));
  assert.equal(activity.title, `YummyAnime · ${page.title} · Ep.9`);
  assert.equal(activity.image, page.artwork);
  assert.equal(activity.detail, toActivity(kodik).detail);
  assert.equal(withPageMetadata(kodik, null), kodik);
  assert.equal(withPageMetadata(null, page), null);
  const other = { ...kodik, source: "example.com" };
  assert.equal(withPageMetadata(other, page), other);
});

test("uses season and episode from the active Habster player", () => {
  const player = { ...paused, source: "befriend.stravers.live", season: "2", episode: "4", state: "playing" };
  const page = { source: "Habster", title: "Silo", artwork: "" };
  assert.equal(toActivity(withPageMetadata(player, page)).title, "Habster · Silo · S2 Ep.4");
  assert.equal(toActivity(withPageMetadata({ ...player, season: "3", episode: "1" }, page)).title,
    "Habster · Silo · S3 Ep.1");
  assert.equal(toActivity(withPageMetadata({ ...player, episode: undefined }, page)).title, "Habster · Silo");
});

test("formats explicit season and episode labels on any service", () => {
  for (const title of ["Silo · Season 3, Episode 10", "Silo (3 сезон) - 10 серия"]) {
    assert.equal(toActivity({ ...paused, title, state: "playing", source: "VK Video" }).title,
      "VK Video · Silo · S3 Ep.10");
  }
  assert.equal(toActivity({ ...paused, title: "Silo — 10 серия", state: "playing" }).title, "Silo · Ep.10");
  assert.match(toActivity({ ...paused, title: "Long title ".repeat(30), episode: "10" }).title, /Ep\.10/);
});

test("uses only the corresponding external player episode on an AniLiberty release", () => {
  const page = { source: "AniLiberty", title: "Hotaru no Yomeiri", episodes: { YouTube: "3", RUTUBE: "5" } };
  const player = { ...paused, source: "YouTube", state: "playing" };
  assert.equal(toActivity(withPageMetadata(player, page)).title, "AniLiberty · Hotaru no Yomeiri · Ep.3");
  assert.equal(withPageMetadata({ ...player, source: "RUTUBE" }, page).episode, "5");
  assert.equal(withPageMetadata({ ...player, source: "Vimeo" }, page).source, "Vimeo");
});

test("shows the player's clock and keeps real time left for the popup", () => {
  const activity = toActivity(paused, "watchkit");
  assert.equal(activity.title, "Episode 4");
  assert.equal(activity.paused, true);
  assert.equal(activity.detail, "01:33 / 41:54 · Speed 1.25×");
  assert.equal(playbackRemaining(paused), "32:17 left");
  assert.equal(playbackRemaining({ ...paused, position: paused.duration + 1 }), "00:00 left");
  assert.equal(activity.image, "watchkit");
  assert.equal(activity.imageText, "32:17 left");
});

test("ignores the legacy VLC artwork key for browser activity", () => {
  const media = { ...paused, source: "example.com" };
  assert.equal(toActivity(media, "vlc").image, "");
  assert.equal(toActivity({ ...media, artwork: "https://example.com/poster.jpg" }, "vlc").image,
    "https://example.com/poster.jpg");
});

test("handles live and unknown duration without inventing remaining time", () => {
  assert.equal(toActivity({ ...paused, live: true }).detail, "LIVE · Speed 1.25×");
  assert.equal(toActivity({ ...paused, live: true, rate: 1 }).detail, "LIVE");
  assert.equal(toActivity({ ...paused, duration: null }).detail, "01:33 · Speed 1.25×");
  assert.equal(playbackRemaining({ ...paused, live: true }), "");
  assert.equal(playbackRemaining({ ...paused, duration: null }), "");
  assert.equal(toActivity({ ...paused, live: true }, "watchkit").imageText, "");
  assert.equal(toActivity({ ...paused, duration: null }, "watchkit").imageText, "");
  assert.equal(toActivity({ ...paused, state: "ended" }), null);
  assert.equal(toActivity({ ...paused, rate: 0 }), null);
});

test("preserves episode labels and hour columns without showing normal speed", () => {
  const media = { ...paused, title: "MobLand S01E04", duration: 7200, position: 7000, rate: 1 };
  const activity = toActivity(media);
  assert.equal(activity.title, "MobLand · S1 Ep.4");
  assert.equal(activity.detail, "1:56:40 / 2:00:00");
  assert.equal(playbackRemaining(media), "0:03:20 left");
});

test("anchors Discord progress at normal speed and falls back to the media clock after speed changes", () => {
  const sampledAt = 1_800_000_000_000;
  const media = { ...paused, state: "playing", duration: 186, position: 107, rate: 1, sampledAt };
  const activity = toActivity(media);
  assert.equal(activity.start, 1_799_999_893);
  assert.equal(activity.end, 1_800_000_079);
  assert.equal(toActivity({ ...media, position: 112, sampledAt: sampledAt + 5000 }).end, activity.end);
  assert.equal(toActivity({ ...media, position: 150 }).start, 1_799_999_850);
  for (const rate of [0.75, 1.5, 2]) {
    const accelerated = toActivity({ ...media, rate });
    assert.equal(accelerated.detail, `01:47 / 03:06 · Speed ${rate}×`);
    assert.equal(accelerated.start, undefined);
    assert.equal(accelerated.end, undefined);
    assert.equal(accelerated.discordState, undefined);
  }
  assert.equal(playbackRemaining({ ...media, rate: 1.5 }), "00:53 left");
  assert.equal(toActivity({ ...media, rate: 1.5 }, "watchkit").imageText, "00:53 left");
  for (const state of ["paused", "buffering"]) {
    const stopped = toActivity({ ...media, state });
    assert.equal(stopped.start, undefined);
    assert.equal(stopped.end, undefined);
    assert.equal(stopped.discordState, undefined);
  }
  const episode = toActivity({ ...media, source: "YouTube", title: "MobLand S01E04" });
  assert.equal(episode.discordTitle, "YouTube");
  assert.equal(episode.discordState, "MobLand · S1 Ep.4");
  assert.equal(episode.detail, "01:47 / 03:06");
});

test("ignores stale frames and selects the strongest candidate", () => {
  const frame = (score, seenAt) => ({ media: { score }, seenAt });
  assert.equal(bestMedia([frame(10, 0), frame(3, 5000), frame(1, 6000)], 20_000).score, 3);
});

test("uses Listening for background video and for music on any tab", () => {
  assert.equal(defaultSettings.backgroundPlayback, true);
  const media = { ...paused, title: "Show S02E03", state: "playing" };
  assert.equal(toActivity(media).activityType, 3);
  const activity = toActivity(media, "", true);
  assert.equal(activity.activityType, 2);
  assert.equal(activity.paused, false);
  assert.equal(activity.title, "Show · S2 Ep.3");
  assert.equal(toActivity({ ...media, state: "paused" }).paused, true);
  for (const background of [false, true]) {
    assert.equal(toActivity({ ...media, audio: true }, "", background).activityType, 2);
  }
});

test("prefers playing foreground media and shows paused media only on the selected tab", () => {
  const now = 30_000;
  function tab(id, state, overrides = {}, seenAt = now) {
    return { id, lastAccessed: id, audible: true, samples: new Map([[0, {
      media: { ...paused, state, score: 1, ...overrides }, seenAt
    }]]) };
  }
  const tabs = new Map([[1, tab(1, "playing")], [2, tab(2, "playing")], [3, tab(3, "playing")]]);
  const choose = (previous = null) => choosePlayback(tabs, 1, previous, now);
  assert.equal(choose(2).tab.id, 1);
  assert.equal(choose(2).background, false);
  tabs.set(1, tab(1, "paused"));
  assert.equal(choose(2).tab.id, 2);
  assert.equal(choose(2).background, true);
  assert.equal(choose().tab.id, 3);
  tabs.set(2, tab(2, "paused", { audio: true }));
  tabs.set(3, tab(3, "playing", { muted: true }));
  assert.equal(choose(2).tab.id, 1);
  assert.equal(choose().media.state, "paused");
  tabs.set(3, tab(3, "playing", {}, now - 16_001));
  tabs.delete(1);
  assert.equal(choose(), null);
});

test("filters excluded and restricted pages and validates the Discord ID", () => {
  assert.equal(allowedPage("https://example.test/video", []), true);
  assert.equal(allowedPage("https://example.test/video", ["example.test"]), false);
  assert.equal(allowedPage("https://open.spotify.com/track/example", []), false);
  assert.equal(allowedPage("https://open.spotify.com./embed/track/example", []), false);
  assert.equal(allowedPage("https://spotify.com.example.test/video", []), true);
  assert.equal(allowedPage("chrome://settings", []), false);
  assert.equal(allowedPage("file:///C:/sample.webm", ["file:"]), false);
  assert.equal(validId("123456789012345678"), true);
  assert.equal(validId("123"), false);
});
