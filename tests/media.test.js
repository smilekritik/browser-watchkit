import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { toActivity } from "../extension/activity.js";

const mediaScript = readFileSync(new URL("../extension/media.js", import.meta.url), "utf8");

function track(url, { title = "", selectors = {}, images = [], top = false, media = {}, metadata } = {}) {
  const watchWindow = {};
  watchWindow.top = top ? watchWindow : {};
  const sent = [];
  let onMessage;
  const video = new class Video {
    isConnected = true;
    currentTime = 20;
    duration = 1400;
    playbackRate = 1;
    volume = 1;
    addEventListener() {}
    removeEventListener() {}
    getAttribute() { return null; }
    getBoundingClientRect() { return { left: 0, top: 0, right: 640, bottom: 360 }; }
  }();
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
    querySelectorAll: () => images,
    addEventListener() {},
    removeEventListener() {}
  };
  runInNewContext(mediaScript, {
    URL, document, window: watchWindow, location: new URL(url),
    navigator: { mediaSession: { metadata } }, performance: { now: () => 0 }, innerWidth: 640, innerHeight: 360,
    Node: { ELEMENT_NODE: 1, DOCUMENT_NODE: 9, DOCUMENT_FRAGMENT_NODE: 11 },
    NodeFilter: { SHOW_ELEMENT: 1 }, HTMLVideoElement: video.constructor,
    MutationObserver: class { observe() {} disconnect() {} },
    getComputedStyle: () => ({ visibility: "visible" }),
    addEventListener() {}, removeEventListener() {}, setTimeout() {}, clearTimeout() {},
    chrome: { runtime: {
      onMessage: { addListener: listener => { onMessage = listener; } },
      sendMessage: async message => { sent.push(message); return { watching: true }; }
    } }
  });
  onMessage({ type: "watch", token: "test" });
  return sent.find(message => message.type === "media").media;
}

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
  const sample = track(url, { title: "Observing Medley", top: true, media, selectors: {
    "ytmusic-player-bar .time-info": { textContent: " 0:37 / 3:30 " }
  } });
  assert.equal(sample.source, "YouTube Music");
  assert.equal(sample.position, 37);
  assert.equal(sample.duration, 210);
  assert.equal(toActivity(sample).detail.normalize("NFKC"), "00:37 / 03:30 · 1.00× · 02:53 left");
  assert.equal(track(url, { top: true, media }).duration, 302);
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
