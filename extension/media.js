(() => {
  if (globalThis.watchkitListener) return;
  globalThis.watchkitListener = true;

  const events = ["playing", "pause", "ended", "waiting", "seeked", "ratechange",
    "loadedmetadata", "emptied", "durationchange", "volumechange", "resize"];
  const videos = new Map();
  const roots = new Set();
  const topFrame = window === window.top;
  const youtubeMusic = topFrame && location.hostname === "music.youtube.com";
  const yummyAnime = topFrame && location.hostname === "old.yummyani.me"
    && location.pathname.startsWith("/catalog/item/");
  const habster = topFrame && location.hostname === "habster.sbs" && /^\/series\/\d+\/?$/.test(location.pathname);
  const alloha = location.hostname === "befriend.stravers.live";
  const collaps = /^(?:api\d*\.)?initem\.ws$/.test(location.hostname);
  const episodeObserver = yummyAnime ? new MutationObserver(() => schedule()) : null;
  const observer = new MutationObserver(changes => {
    let changed = false;
    for (const change of changes) {
      for (const node of change.addedNodes) changed = scan(node) || changed;
      if (change.removedNodes.length && videos.size) changed = true;
    }
    if (changed || yummyAnime || habster || ((alloha || collaps) && videos.size)) schedule();
  });
  let token;
  let queued;
  let heartbeat;
  let lastReport;
  let sentAt = 0;
  let seeked = false;
  let episodePanel;
  let lastPage;

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
    const musicVideo = youtubeMusic ? document.querySelector("ytmusic-player video.html5-main-video") : null;
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
      if (video === musicVideo) return { video, state, score: 8_000_000 };
      if ((!area && !featured) || getComputedStyle(video).visibility !== "visible") continue;
      const score = Math.min(area, 1_000_000)
        + (!video.paused ? 2_000_000 : 0)
        + (!video.muted && video.volume > 0 ? 250_000 : 0)
        + (featured ? 4_000_000 : 0);
      if (!result || score > result.score) result = { video, state, score };
    }
    return result;
  }

  function musicTiming() {
    const clock = document.querySelector("ytmusic-player-bar .time-info")?.textContent;
    const times = /^\s*(\d+(?::[0-5]\d){1,2})\s*\/\s*(\d+(?::[0-5]\d){1,2})\s*$/.exec(clock ?? "");
    if (!times) return null;
    const seconds = time => time.split(":").reduce((total, part) => total * 60 + Number(part), 0);
    const position = seconds(times[1]);
    const duration = seconds(times[2]);
    return duration > 0 && position <= duration ? { position, duration } : null;
  }

  const knownSites = {
    "youtube.com": "YouTube", "youtube-nocookie.com": "YouTube", "youtu.be": "YouTube",
    "twitch.tv": "Twitch", "tiktok.com": "TikTok", "bilibili.com": "Bilibili",
    "netflix.com": "Netflix", "vimeo.com": "Vimeo", "primevideo.com": "Prime Video",
    "disneyplus.com": "Disney+", "crunchyroll.com": "Crunchyroll",
    "vkvideo.ru": "VK Video", "rutube.ru": "RUTUBE"
  };

  function videoSource() {
    if (location.protocol === "file:") return "Chrome";
    const host = location.hostname.replace(/^www\./, "");
    const site = Object.keys(knownSites).find(domain => host === domain || host.endsWith(`.${domain}`));
    return site ? knownSites[site] : host.slice(0, 48) || "Chrome";
  }

  function artwork(video, metadata, source) {
    if (location.protocol === "file:") return "";
    let youtubeThumbnail;
    if (source === "YouTube") {
      const page = new URL(location.href);
      const id = page.hostname === "youtu.be" ? page.pathname.slice(1)
        : page.searchParams.get("v") || /^\/(?:shorts|embed|live)\/([^/]+)/.exec(page.pathname)?.[1];
      if (/^[A-Za-z0-9_-]{11}$/.test(id ?? "")) {
        youtubeThumbnail = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
        if (!youtubeMusic) return youtubeThumbnail;
      }
    }
    const pageImages = document.querySelectorAll([
      'meta[property="og:image:secure_url"]', 'meta[property="og:image"]', 'meta[property="og:image:url"]',
      'meta[name="twitter:image"]', 'meta[name="twitter:image:src"]',
      'meta[itemprop="thumbnailUrl"]', 'link[itemprop="thumbnailUrl"]', 'link[rel="image_src"]'
    ].join(", "));
    const sessionImages = metadata?.artwork ?? [];
    const candidates = sessionImages.map(entry => entry.src).reverse();
    if (youtubeMusic) {
      const squareCovers = sessionImages.flatMap(({ src, sizes }) =>
        (sizes ?? "").split(/\s+/).flatMap(size => {
          const square = /^([1-9]\d*)x\1$/i.exec(size);
          return square ? [{ src, width: Number(square[1]) }] : [];
        })
      ).sort((a, b) => b.width - a.width);
      const cover = document.querySelector("ytmusic-player-bar .thumbnail-image img, ytmusic-player-bar img.image");
      const squareCover = cover?.naturalWidth > 0 && cover.naturalWidth === cover.naturalHeight
        ? cover.currentSrc || cover.src : undefined;
      candidates.unshift(...squareCovers.map(entry => entry.src), squareCover);
    }
    candidates.push(video?.poster, youtubeThumbnail,
      ...Array.from(pageImages, entry => entry.content || entry.getAttribute("href")));
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
    const timing = youtubeMusic && musicTiming();
    const vkEmbed = location.hostname === "vk.com" && location.pathname === "/video_ext.php";
    const videoPageTitle = vkEmbed || source === "VK Video" || source === "RUTUBE"
      ? document.querySelector('meta[property="og:title"]')?.content.trim() : "";
    const title = location.protocol === "file:"
      ? "Local video"
      : metadata?.title || video.getAttribute("title")
        || videoPageTitle || document.title || location.hostname || "Video";
    const media = {
      title: title.slice(0, 256),
      source: youtubeMusic ? "YouTube Music" : vkEmbed ? "VK Video" : source,
      artwork: artwork(video, metadata, source),
      position: timing?.position ?? video.currentTime,
      duration: timing?.duration ?? (Number.isFinite(video.duration) ? video.duration : null),
      rate: video.playbackRate,
      state: video.paused ? "paused" : state.waiting ? "buffering" : "playing",
      live: !timing && video.duration === Infinity,
      score
    };
    if (alloha) {
      media.season = allohaSelection("seasonType1");
      media.episode = allohaSelection("episodeType1");
    }
    if (collaps) {
      // Collaps rewrites the document title on each changeEpisode event.
      const selection = /\((\d{1,4})\s+сезон\)\s*[-–—]\s*(\d{1,4})\s+серия\s*$/iu.exec(document.title);
      media.season = selection?.[1];
      media.episode = selection?.[2];
    }
    return media;
  }

  function allohaSelection(control) {
    const label = document.querySelector(`[data-select="${control}"] .select__item .select__item-text`);
    return /\b(\d{1,4})$/.exec(label?.textContent.trim() ?? "")?.[1];
  }

  function yummyAnimePage() {
    const panel = document.getElementById("video");
    if (panel !== episodePanel) {
      episodeObserver.disconnect();
      episodePanel = panel;
      if (panel) episodeObserver.observe(panel, { subtree: true, attributes: true, attributeFilter: ["class"] });
    }
    // YummyAnime's player bundle marks the selected episode with these CSS module classes.
    const titles = document.querySelector(".titles");
    const localized = titles?.querySelector('h1[itemprop="name"]')?.textContent.trim();
    const original = document.querySelector('meta[property="ya:ovs:original_name"]')?.content.trim();
    const aliases = Array.from(titles?.querySelectorAll(".alt-names-list > li") ?? [],
      item => item.textContent.trim());
    // The current site leaves aliases untagged and lists the romanized original among them.
    const english = titles?.querySelector('.alt-names-list > li:lang(en)')?.textContent.trim()
      || aliases.find(alias => alias !== original && /^[\x20-\x7e]+$/.test(alias) && /[a-z]/i.test(alias));
    const anime = english || localized;
    const episode = panel?.querySelector(".Y56k.pQCG")?.textContent.trim();
    return anime ? {
      source: "YummyAnime",
      title: anime.slice(0, 256),
      episode: /^\d{1,4}$/.test(episode) ? episode : undefined,
      artwork: artwork(null, null, "YummyAnime")
    } : null;
  }

  function habsterPage() {
    const title = document.querySelector(".movie-orig")?.textContent.trim()
      || document.querySelector(".movie-title")?.textContent.trim();
    if (!title) return null;
    const poster = document.querySelector("#movie-poster")?.getAttribute("src");
    return { source: "Habster", title: title.slice(0, 256), artwork: artwork({ poster }, null, "Habster") };
  }

  function reportPage(watching) {
    const page = yummyAnime ? yummyAnimePage() : habsterPage();
    const signature = JSON.stringify(page);
    if (signature === lastPage) return;
    lastPage = signature;
    chrome.runtime.sendMessage({ type: "page-metadata", token: watching, page }).catch(() => {});
  }

  function report(force = false) {
    clearTimeout(queued);
    clearTimeout(heartbeat);
    queued = undefined;
    const watching = token;
    if (!watching) return;
    if (yummyAnime || habster) reportPage(watching);
    const choice = selected();
    const media = choice ? snapshot(choice) : null;
    const now = performance.now();
    const interval = media?.state === "playing" ? 5000 : 10000;
    const signature = media && JSON.stringify([media.source, media.title, media.artwork,
      media.duration, media.rate, media.state, media.live, media.season, media.episode]);
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
    lastPage = undefined;
    episodePanel = undefined;
    episodeObserver?.disconnect();
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
