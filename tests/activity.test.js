import test from "node:test";
import assert from "node:assert/strict";
import { allowedPage, bestMedia, toActivity, validId, withPageMetadata } from "../extension/activity.js";

const paused = { title: "Episode 4", position: 93, duration: 2514, rate: 1.25, state: "paused" };
const normalDigits = value => value.detail.normalize("NFKC");

test("uses YummyAnime metadata for Kodik while keeping the player's timing", () => {
  const kodik = { ...paused, source: "kodikplayer.com", title: "Kodik Player", state: "playing" };
  const page = {
    source: "YummyAnime",
    title: "Great Lord! 3rd Season · Episode 9",
    artwork: "https://static.yani.tv/posters/full/1636859220.jpg"
  };
  const activity = toActivity(withPageMetadata(kodik, page));
  assert.equal(activity.title, `YummyAnime · ${page.title}`);
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
  assert.equal(toActivity(withPageMetadata(player, page)).title, "Habster · Silo · Season 2, Episode 4");
  assert.equal(toActivity(withPageMetadata({ ...player, season: "3", episode: "1" }, page)).title,
    "Habster · Silo · Season 3, Episode 1");
  assert.equal(toActivity(withPageMetadata({ ...player, episode: undefined }, page)).title, "Habster · Silo");
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
  assert.equal(allowedPage("chrome://settings", []), false);
  assert.equal(allowedPage("file:///C:/sample.webm", ["file:"]), false);
  assert.equal(validId("123456789012345678"), true);
  assert.equal(validId("123"), false);
});
