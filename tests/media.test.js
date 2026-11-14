import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const mediaScript = readFileSync(new URL("../extension/media.js", import.meta.url), "utf8");

function track(url, { title = "", selectors = {}, images = [] } = {}) {
  const watchWindow = {};
  watchWindow.top = {};
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
    navigator: {}, performance: { now: () => 0 }, innerWidth: 640, innerHeight: 360,
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
