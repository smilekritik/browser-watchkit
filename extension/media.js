(() => {
  if (globalThis.watchkitListener) return;
  globalThis.watchkitListener = true;

  const events = ["playing", "pause", "ended", "waiting", "seeked", "ratechange",
    "loadedmetadata", "emptied", "durationchange", "volumechange", "resize"];
  const videos = new Map();
  const roots = new Set();
  const observer = new MutationObserver(changes => {
    let changed = false;
    for (const change of changes) {
      for (const node of change.addedNodes) changed = scan(node) || changed;
      if (change.removedNodes.length && videos.size) changed = true;
    }
    if (changed) schedule();
  });
  let token;
  let queued;
  let heartbeat;
  let lastReport;
  let sentAt = 0;
  let seeked = false;

  function observe(root) {
    if (roots.has(root)) return false;
    roots.add(root);
    observer.observe(root, { childList: true, subtree: true });
    return scan(root);
  }

  function inspect(element) {
    let changed = false;
    if (element instanceof HTMLVideoElement && !videos.has(element)) {
      for (const event of events) element.addEventListener(event, changedVideo);
      videos.set(element, { played: !element.paused || element.currentTime > 0, waiting: false });
      changed = true;
    }
    if (element.shadowRoot) changed = observe(element.shadowRoot) || changed;
    return changed;
  }

  function scan(node) {
    if (![Node.ELEMENT_NODE, Node.DOCUMENT_NODE, Node.DOCUMENT_FRAGMENT_NODE].includes(node.nodeType)) return false;
    let changed = node.nodeType === Node.ELEMENT_NODE && inspect(node);
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT);
    for (let element = walker.nextNode(); element; element = walker.nextNode()) {
      changed = inspect(element) || changed;
    }
    return changed;
  }

  function forget(video) {
    for (const event of events) video.removeEventListener(event, changedVideo);
    videos.delete(video);
  }

  function changedVideo(event) {
    const video = event.currentTarget;
    const state = videos.get(video);
    if (!state) return;
    if (event.type === "playing") state.played = true;
    if (event.type === "seeked") seeked = true;
    if (event.type === "emptied") state.played = false;
    if (event.type === "waiting" || event.type === "playing" || event.type === "emptied") {
      state.waiting = event.type === "waiting";
    }
    schedule();
  }

  function selected() {
    let result = null;
    for (const [video, state] of videos) {
      if (!video.isConnected) {
        forget(video);
        continue;
      }
      if (video.ended || (video.paused && !state.played && video.currentTime === 0)) continue;
      const rect = video.getBoundingClientRect();
      const width = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
      const height = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
      const area = width * height;
      const featured = document.fullscreenElement === video || document.pictureInPictureElement === video;
      if ((!area && !featured) || getComputedStyle(video).visibility !== "visible") continue;
      const score = Math.min(area, 1_000_000)
        + (!video.paused ? 2_000_000 : 0)
        + (!video.muted && video.volume > 0 ? 250_000 : 0)
        + (featured ? 4_000_000 : 0);
      if (!result || score > result.score) result = { video, state, score };
    }
    return result;
  }

  const knownSites = {
    "youtube.com": "YouTube", "youtube-nocookie.com": "YouTube", "youtu.be": "YouTube",
    "twitch.tv": "Twitch", "tiktok.com": "TikTok", "bilibili.com": "Bilibili",
    "netflix.com": "Netflix", "vimeo.com": "Vimeo", "primevideo.com": "Prime Video",
    "disneyplus.com": "Disney+", "crunchyroll.com": "Crunchyroll"
  };

  function videoSource() {
    if (location.protocol === "file:") return "Chrome";
    const host = location.hostname.replace(/^www\./, "");
    const site = Object.keys(knownSites).find(domain => host === domain || host.endsWith(`.${domain}`));
    return site ? knownSites[site] : host.slice(0, 48) || "Chrome";
  }

  function artwork(video, metadata, source) {
    if (location.protocol === "file:") return "";
    if (source === "YouTube") {
      const page = new URL(location.href);
      const id = page.hostname === "youtu.be" ? page.pathname.slice(1)
        : page.searchParams.get("v") || /^\/(?:shorts|embed|live)\/([^/]+)/.exec(page.pathname)?.[1];
      if (/^[A-Za-z0-9_-]{11}$/.test(id ?? "")) return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    }
    const pageImages = document.querySelectorAll('meta[property="og:image:secure_url"], meta[property="og:image"], meta[name="twitter:image"]');
    const candidates = [...(metadata?.artwork ?? []).map(entry => entry.src).reverse(),
      video.poster, ...Array.from(pageImages, entry => entry.content)];
    for (const candidate of candidates) {
      if (!candidate) continue;
      try {
        const url = new URL(candidate, document.baseURI);
        if (url.protocol === "https:" && !url.username && !url.password
            && !url.search && !url.hash && url.href.length <= 512) return url.href;
      } catch {
        // Ignore malformed artwork URLs.
      }
    }
    return "";
  }

  function snapshot({ video, state, score }) {
    const metadata = navigator.mediaSession?.metadata;
    const source = videoSource();
    const title = location.protocol === "file:"
      ? "Local video"
      : metadata?.title || video.getAttribute("title")
        || document.title || location.hostname || "Video";
    return {
      title: title.slice(0, 256),
      source,
      artwork: artwork(video, metadata, source),
      position: video.currentTime,
      duration: Number.isFinite(video.duration) ? video.duration : null,
      rate: video.playbackRate,
      state: video.paused ? "paused" : state.waiting ? "buffering" : "playing",
      live: video.duration === Infinity,
      score
    };
  }

  function report(force = false) {
    clearTimeout(queued);
    clearTimeout(heartbeat);
    queued = undefined;
    const watching = token;
    if (!watching) return;
    const choice = selected();
    const media = choice ? snapshot(choice) : null;
    const now = performance.now();
    const interval = media?.state === "playing" ? 5000 : 10000;
    const signature = media && JSON.stringify([media.source, media.title, media.artwork,
      media.duration, media.rate, media.state, media.live]);
    if (force || (media && (seeked || choice.video !== lastReport?.video
        || signature !== lastReport?.signature || now - sentAt >= interval))
        || (!media && lastReport)) {
      lastReport = media ? { video: choice.video, signature } : undefined;
      sentAt = now;
      chrome.runtime.sendMessage({ type: "media", token: watching, media }).then(reply => {
        if (watching === token && !reply?.watching) stop();
      }).catch(() => { if (watching === token) stop(); });
    }
    seeked = false;
    if (media) heartbeat = setTimeout(report, Math.max(0, sentAt + interval - now));

    if ([...roots].some(root => !root.isConnected)) {
      observer.disconnect();
      for (const root of roots) {
        if (root.isConnected) observer.observe(root, { childList: true, subtree: true });
        else roots.delete(root);
      }
    }
  }

  function schedule() {
    if (token && queued === undefined) queued = setTimeout(report, 180);
  }

  function viewportChanged() {
    if (videos.size) schedule();
  }

  function stop() {
    token = undefined;
    lastReport = undefined;
    sentAt = 0;
    seeked = false;
    clearTimeout(queued);
    clearTimeout(heartbeat);
    queued = undefined;
    observer.disconnect();
    roots.clear();
    for (const video of videos.keys()) forget(video);
    removeEventListener("resize", viewportChanged);
    removeEventListener("scroll", viewportChanged, true);
    document.removeEventListener("fullscreenchange", schedule);
    removeEventListener("pagehide", stop);
  }

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === "stop" && message.token === token) stop();
    if (message?.type !== "watch" || message.token === token) return;
    stop();
    token = message.token;
    observe(document);
    addEventListener("resize", viewportChanged, { passive: true });
    addEventListener("scroll", viewportChanged, { passive: true, capture: true });
    document.addEventListener("fullscreenchange", schedule);
    addEventListener("pagehide", stop, { once: true });
    report(true);
  });
})();
