import test from "node:test";
import assert from "node:assert/strict";
import { allowedPage, bestMedia, bridgeAdvice, toActivity, validId, watchLink, withPageMetadata } from "../extension/activity.js";

const paused = { title: "Episode 4", position: 93, duration: 2514, rate: 1.25, state: "paused" };
const normalDigits = value => value.detail.normalize("NFKC");

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

test("formats WatchKit timing at the actual playback speed", () => {
  const activity = toActivity(paused, "watchkit");
  assert.equal(activity.title, "Episode 4 · ⏸\ufe0e");
  assert.equal(normalDigits(activity), "01:33 / 41:54 · 1.25× · 32:17 left");
  assert.equal(activity.image, "watchkit");
});

test("ignores the legacy VLC artwork key for browser activity", () => {
  const media = { ...paused, source: "example.com" };
  assert.equal(toActivity(media, "vlc").image, "");
  assert.equal(toActivity({ ...media, artwork: "https://example.com/poster.jpg" }, "vlc").image,
    "https://example.com/poster.jpg");
});

test("handles live and unknown duration without inventing remaining time", () => {
  assert.equal(normalDigits(toActivity({ ...paused, live: true, duration: null })), "LIVE · 1.25×");
  assert.equal(normalDigits(toActivity({ ...paused, duration: null })), "01:33 · 1.25×");
  assert.equal(toActivity({ ...paused, state: "ended" }), null);
  assert.equal(toActivity({ ...paused, rate: 0 }), null);
});

test("matches the VLC episode label, rate digits and hour columns", () => {
  const activity = toActivity({
    ...paused, title: "MobLand S01E04", duration: 7200, position: 7000, rate: 1
  });
  assert.equal(activity.title, "MobLand · S1 Ep.4 · ⏸\ufe0e");
  assert.equal(normalDigits(activity), "1:56:40 / 2:00:00 · 1.00× · 0:03:20 left");
  assert.ok(activity.detail.includes("𝟷.𝟶𝟶×"));
});

test("ignores stale frames and selects the strongest candidate", () => {
  const frame = (score, seenAt) => ({ media: { score }, seenAt });
  assert.equal(bestMedia([frame(10, 0), frame(3, 5000), frame(1, 6000)], 20_000).score, 3);
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
