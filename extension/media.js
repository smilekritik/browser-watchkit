(() => {
  if (globalThis.watchkitListener) return;
  globalThis.watchkitListener = true;

  const events = ["playing", "pause", "ended", "waiting", "seeked", "ratechange",
    "loadedmetadata", "emptied", "durationchange", "volumechange", "resize"];
  const videos = new Map();
  const roots = new Set();
  const topFrame = window === window.top;
  const audioFile = /\.(?:aac|flac|m4a|mp3|oga|opus|wav)$/i.test(location.pathname);
  const youtubeMusic = topFrame && location.hostname === "music.youtube.com";
  const legacyLibria = topFrame && /^(?:www\.)?anilibria\.(?:tv|uno)$/.test(location.hostname);
  const libria = topFrame && /^(?:www\.)?(?:anilibria|aniliberty)\.(?:top|wtf)$/.test(location.hostname);
  const yummyAnime = topFrame && location.hostname === "old.yummyani.me"
    && location.pathname.startsWith("/catalog/item/");
  const habster = topFrame && location.hostname === "habster.sbs" && /^\/series\/\d+\/?$/.test(location.pathname);
  const alloha = location.hostname === "befriend.stravers.live";
  const collaps = /^(?:api\d*\.)?initem\.ws$/.test(location.hostname);
  const episodeObserver = yummyAnime || legacyLibria ? new MutationObserver(() => schedule()) : null;
  const titleObserver = topFrame ? new MutationObserver(() => schedule()) : null;
  const observer = new MutationObserver(changes => {
    let changed = false;
    for (const change of changes) {
      for (const node of change.addedNodes) changed = scan(node) || changed;
      if (change.removedNodes.length && videos.size) changed = true;
    }
    if (changed || yummyAnime || habster || legacyLibria || ((alloha || collaps) && videos.size)) schedule();
  });
  let token;
  let queued;
  let heartbeat;
  let lastReport;
  let sentAt = 0;
  let seeked = false;
  let episodePanel;
  let lastPage;
  let episodePage = false;

  function observe(root) {
    if (roots.has(root)) return false;
    roots.add(root);
    observer.observe(root, { childList: true, subtree: true });
    return scan(root);
  }

  function inspect(element) {
    let changed = false;
    if (element instanceof HTMLMediaElement && !videos.has(element)) {
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
    const music = audioSource();
    const musicVideo = youtubeMusic ? document.querySelector("ytmusic-player video.html5-main-video") : null;
    for (const [video, state] of videos) {
      if (!video.isConnected) {
        forget(video);
        continue;
      }
      if (video.ended || (video.paused && !state.played && video.currentTime === 0)) continue;
      const audio = video instanceof HTMLAudioElement;
      if (audio && !music && !video.controls && !audioFile
          && !(topFrame && navigator.mediaSession?.metadata?.title)) continue;
      const rect = video.getBoundingClientRect();
      const width = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
      const height = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
      const area = width * height;
      const featured = document.fullscreenElement === video || document.pictureInPictureElement === video;
      if (video === musicVideo) return { video, state, score: 8_000_000 };
      const audibleInBackground = document.hidden && !video.paused && !video.muted && video.volume > 0 && video.videoWidth > 0;
      if (!audio && !music && !audibleInBackground
          && ((!area && !featured) || getComputedStyle(video).visibility !== "visible")) continue;
      const score = Math.min(area, 1_000_000)
        + (!video.paused ? 2_000_000 : 0)
        + (!video.muted && video.volume > 0 ? 250_000 : 0)
        + (audio && music && !video.paused ? 1_000_000 : 0)
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

  const audioSites = {
    "music.youtube.com": "YouTube Music", "music.apple.com": "Apple Music",
    "podcasts.apple.com": "Apple Podcasts", "soundcloud.com": "SoundCloud",
    "bandcamp.com": "Bandcamp", "deezer.com": "Deezer", "tidal.com": "TIDAL",
    "qobuz.com": "Qobuz", "music.amazon.com": "Amazon Music", "music.amazon.co.uk": "Amazon Music",
    "music.amazon.de": "Amazon Music", "music.amazon.fr": "Amazon Music", "music.amazon.co.jp": "Amazon Music",
    "music.amazon.ca": "Amazon Music", "music.amazon.it": "Amazon Music", "music.amazon.es": "Amazon Music",
    "music.amazon.com.au": "Amazon Music", "music.amazon.com.br": "Amazon Music", "music.amazon.com.mx": "Amazon Music",
    "music.yandex.ru": "Яндекс Музыка", "music.yandex.com": "Яндекс Музыка", "music.yandex.kz": "Яндекс Музыка",
    "music.vk.com": "VK Музыка", "zvuk.com": "Звук", "mixcloud.com": "Mixcloud",
    "audiomack.com": "Audiomack", "audius.co": "Audius", "pandora.com": "Pandora",
    "iheart.com": "iHeartRadio", "tunein.com": "TuneIn", "radio.garden": "Radio Garden",
    "radioplayer.org": "Radioplayer", "kexp.org": "KEXP", "radioparadise.com": "Radio Paradise",
    "di.fm": "DI.FM", "jazzradio.com": "JAZZRADIO", "somafm.com": "SomaFM",
    "radio.net": "radio.net", "onlineradiobox.com": "Online Radio Box",
    "bbc.co.uk": "BBC Sounds", "bbc.com": "BBC Sounds",
    "audible.com": "Audible", "audible.co.uk": "Audible", "audible.de": "Audible",
    "audible.ca": "Audible", "audible.fr": "Audible", "audible.it": "Audible", "audible.es": "Audible",
    "audible.com.au": "Audible", "audible.co.jp": "Audible", "audible.in": "Audible",
    "storytel.com": "Storytel", "bookmate.com": "Bookmate",
    "pocketcasts.com": "Pocket Casts", "podbean.com": "Podbean", "spreaker.com": "Spreaker",
    "castbox.fm": "Castbox", "overcast.fm": "Overcast",
    "podcastaddict.com": "Podcast Addict", "podchaser.com": "Podchaser",
    "player.fm": "Player FM", "listennotes.com": "Listen Notes", "fountain.fm": "Fountain",
    "podcasts.yandex.ru": "Яндекс Подкасты", "mave.digital": "Mave",
    "jiosaavn.com": "JioSaavn", "gaana.com": "Gaana", "boomplay.com": "Boomplay",
    "music.163.com": "NetEase Cloud Music", "y.qq.com": "QQ Music", "kuwo.cn": "Kuwo",
    "kugou.com": "Kugou", "kkbox.com": "KKBOX", "joox.com": "JOOX", "anghami.com": "Anghami",
    "melon.com": "Melon", "music.bugs.co.kr": "Bugs", "genie.co.kr": "Genie"
  };
  const knownSites = {
    "youtube.com": "YouTube", "youtube-nocookie.com": "YouTube", "youtu.be": "YouTube",
    "twitch.tv": "Twitch", "tiktok.com": "TikTok", "bilibili.com": "Bilibili",
    "netflix.com": "Netflix", "vimeo.com": "Vimeo", "primevideo.com": "Prime Video",
    "disneyplus.com": "Disney+", "crunchyroll.com": "Crunchyroll",
    "vkvideo.ru": "VK Video", "rutube.ru": "RUTUBE", "kick.com": "Kick",
    "dailymotion.com": "Dailymotion", "dai.ly": "Dailymotion", "viki.com": "Viki",
    "hidive.com": "HIDIVE", "hulu.com": "Hulu", "max.com": "HBO Max", "hbomax.com": "HBO Max",
    "tv.apple.com": "Apple TV", "peacocktv.com": "Peacock", "paramountplus.com": "Paramount+",
    "dropout.tv": "Dropout", "nebula.tv": "Nebula", "pluto.tv": "Pluto TV", "tubitv.com": "Tubi", "npr.org": "NPR",
    "plex.tv": "Plex", "floatplane.com": "Floatplane", "nicovideo.jp": "Niconico", "abema.tv": "ABEMA",
    "iq.com": "iQIYI", "wetv.vip": "WeTV", "viu.com": "Viu", "crackle.com": "Crackle",
    "ok.ru": "OK", "kinopoisk.ru": "Кинопоиск", "ivi.ru": "Иви", "okko.tv": "Okko",
    "wink.ru": "Wink", "kinogo.ec": "Kinogo", "smotrim.ru": "Смотрим",
    "anilibria.tv": "AniLiberty", "anilibria.uno": "AniLiberty", "anilibria.top": "AniLiberty",
    "aniliberty.top": "AniLiberty", "aniliberty.wtf": "AniLiberty", "anilibria.wtf": "AniLiberty"
  };

  function siteName(sites) {
    let host = location.hostname;
    while (host) {
      if (Object.hasOwn(sites, host)) return sites[host];
      const separator = host.indexOf(".");
      if (separator < 0) break;
      host = host.slice(separator + 1);
    }
  }

  function audioSource() {
    if (/(?:^|\.)bbc\.(?:com|co\.uk)$/.test(location.hostname) && !/^\/sounds(?:\/|$)/.test(location.pathname)) return "";
    if (/^(?:www\.|m\.)?vk\.com$/.test(location.hostname) && /^\/audios?(?:\d+)?(?:\/|$)/.test(location.pathname)) return "VK Музыка";
    return siteName(audioSites);
  }

  function videoSource() {
    if (location.protocol === "file:") return "Chrome";
    const host = location.hostname.replace(/^www\./, "");
    return siteName(knownSites) || host.slice(0, 48) || "Chrome";
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
      const url = publicArtwork(candidate);
      if (url) return url;
    }
    return "";
  }

  function publicArtwork(candidate) {
    if (!candidate) return "";
    try {
      const url = new URL(candidate, document.baseURI);
      if (url.protocol === "https:" && !url.username && !url.password
          && !url.search && !url.hash && url.href.length <= 512) return url.href;
    } catch {
      // Ignore malformed artwork URLs.
    }
    return "";
  }

  function episodeCover() {
    const path = location.pathname.replace(/\/$/, "");
    const segments = path.split("/").filter(Boolean);
    const detailsPath = /^\/(?:anime\/)?(?:info|details|title|show|series)(?=\/)/i;
    for (const image of document.querySelectorAll("img[data-cover-target], a[href] img")) {
      const target = image.getAttribute("data-cover-target");
      const link = image.closest("a[href]");
      const related = link?.origin === location.origin && detailsPath.test(link.pathname)
        && path.endsWith(link.pathname.replace(detailsPath, "").replace(/\/$/, ""));
      const cover = segments.includes(target)
        || (related && image.naturalHeight > 0 && image.naturalWidth <= image.naturalHeight);
      if (!cover || (image.complete && !image.naturalWidth)) continue;
      const url = publicArtwork(image.currentSrc) || publicArtwork(image.getAttribute("src"));
      if (url) return url;
    }
    return "";
  }

  function coverLoaded(event) {
    if (event.target?.matches?.("img[data-cover-target], a[href] img")) schedule();
  }

  function snapshot({ video, state, score }) {
    const metadata = navigator.mediaSession?.metadata;
    const music = audioSource();
    const audio = Boolean(music) || video instanceof HTMLAudioElement || audioFile;
    const source = music || videoSource();
    const timing = youtubeMusic && musicTiming();
    const vkEmbed = location.hostname === "vk.com" && location.pathname === "/video_ext.php";
    const videoPageTitle = vkEmbed || source === "VK Video" || source === "RUTUBE"
      ? document.querySelector('meta[property="og:title"]')?.content.trim() : "";
    const libriaTitle = libria && /^\/anime\/video\/episode\//.test(location.pathname)
      && /^Эпизод\s+(\d{1,4})\s+\|\s+(.+)\s+\|\s+AniLiberty$/iu.exec(document.title);
    const localPlayer = legacyLibria && video.closest("#anilibriaPlayer");
    const title = location.protocol === "file:"
      ? audio ? "Local audio" : "Local video"
      : libriaTitle ? libriaTitle[2].split(" | ").at(-1)
      : localPlayer ? document.title
      : metadata?.title || video.getAttribute("title")
        || videoPageTitle || document.title || location.hostname || (audio ? "Audio" : "Video");
    const media = {
      title: title.slice(0, 256),
      source: youtubeMusic ? "YouTube Music" : vkEmbed ? "VK Video" : source,
      artist: audio && location.protocol !== "file:" ? metadata?.artist?.trim().slice(0, 120) : undefined,
      audio,
      muted: video.muted || video.volume === 0,
      artwork: artwork(video, metadata, youtubeMusic ? "YouTube" : source),
      position: timing?.position ?? video.currentTime,
      duration: timing?.duration ?? (Number.isFinite(video.duration) ? video.duration : null),
      rate: video.playbackRate,
      state: video.paused ? "paused" : state.waiting ? "buffering" : "playing",
      live: !timing && video.duration === Infinity,
      score
    };
    if (localPlayer) {
      const panel = document.getElementById("anilibriaPlayer_playlist");
      observeEpisodePanel(panel);
      const label = panel?.querySelector(".pjs-anilibriaPlayer-active-pl")?.textContent.trim();
      media.episode = episodeLabel(label);
      media.linkEpisode = media.episode;
    } else if (libriaTitle) {
      media.episode = libriaTitle[1];
    } else if (alloha) {
      media.season = allohaSelection("seasonType1");
      media.episode = allohaSelection("episodeType1");
    }
    if (collaps) {
      // Collaps rewrites the document title on each changeEpisode event.
      const selection = /\((\d{1,4})\s+сезон\)\s*[-–—]\s*(\d{1,4})\s+серия\s*$/iu.exec(document.title);
      media.season = selection?.[1];
      media.episode = selection?.[2];
    }
    if (!audio && !media.episode) {
      const control = document.querySelector(
        '[data-episode-number][aria-current="true"], [data-episode-number][aria-current="page"], ' +
        '[data-episode-number][aria-selected="true"]'
      );
      const episode = control?.getAttribute("data-episode-number");
      const season = control?.getAttribute("data-season-number");
      if (/^\d{1,4}$/.test(episode)) {
        media.episode = episode;
        media.season = /^\d{1,4}$/.test(season) ? season : undefined;
      }
    }
    return media;
  }

  function episodeLabel(label) {
    return /^(?:(?:серия|эпизод|episode)\s+(\d{1,4})|(\d{1,4})\s+(?:серия|эпизод))$/iu
      .exec(label ?? "")?.slice(1).find(Boolean);
  }

  function allohaSelection(control) {
    const label = document.querySelector(`[data-select="${control}"] .select__item .select__item-text`);
    return /\b(\d{1,4})$/.exec(label?.textContent.trim() ?? "")?.[1];
  }

  function observeEpisodePanel(panel) {
    if (panel !== episodePanel && episodeObserver) {
      episodeObserver.disconnect();
      episodePanel = panel;
      if (panel) episodeObserver.observe(panel, { subtree: true, attributes: true, attributeFilter: ["class"] });
    }
  }

  function yummyAnimePage() {
    const panel = document.getElementById("video");
    observeEpisodePanel(panel);
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
    let page = yummyAnime ? yummyAnimePage() : habster ? habsterPage() : legacyLibria ? {
      source: "AniLiberty",
      title: document.title.slice(0, 256),
      artwork: artwork(null, null, "AniLiberty"),
      episodes: {
        YouTube: document.querySelector("#youtubeEpisodes select")?.value,
        RUTUBE: document.querySelector("#rutubeEpisodes select")?.value
      }
    } : null;
    if (episodePage) {
      const source = document.querySelector('meta[property="og:site_name"]')?.content.trim();
      const heading = document.querySelector("main h1")?.textContent.trim()
        || document.querySelector('meta[property="og:title"]')?.content.trim() || document.title.trim();
      const parts = heading.split(/\s+[|–—-]\s+/);
      const site = source || location.hostname.split(".").at(-2);
      const title = parts.length > 1 && parts.at(-1).toLowerCase() === site?.toLowerCase()
        ? parts.slice(0, -1).join(" — ") : heading;
      page = { ...page, episodePage: {
        source: source?.slice(0, 48),
        title: title.toLowerCase() !== site?.toLowerCase() ? title.slice(0, 256) : "",
        artwork: episodeCover() || artwork(null, null, "")
      } };
    }
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
    if (yummyAnime || habster || legacyLibria || episodePage) reportPage(watching);
    const choice = selected();
    const media = choice ? snapshot(choice) : null;
    const now = performance.now();
    const interval = media?.state === "playing" ? 5000 : 10000;
    const signature = media && JSON.stringify([media.source, media.title, media.artist, media.audio, media.muted, media.artwork,
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
    episodePage = false;
    titleObserver?.disconnect();
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
    document.removeEventListener("visibilitychange", schedule);
    document.removeEventListener("change", schedule);
    document.removeEventListener("load", coverLoaded, true);
    removeEventListener("pagehide", stop);
  }

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === "stop" && message.token === token) stop();
    if (message?.type !== "watch" || message.token === token) return;
    stop();
    token = message.token;
    episodePage = topFrame && message.episodePage === true;
    observe(document);
    if (episodePage && document.head) {
      titleObserver.observe(document.head, { childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ["content"] });
      document.addEventListener("load", coverLoaded, true);
    }
    addEventListener("resize", viewportChanged, { passive: true });
    addEventListener("scroll", viewportChanged, { passive: true, capture: true });
    document.addEventListener("fullscreenchange", schedule);
    document.addEventListener("visibilitychange", schedule);
    if (legacyLibria) document.addEventListener("change", schedule);
    addEventListener("pagehide", stop, { once: true });
    report(true);
  });
})();
