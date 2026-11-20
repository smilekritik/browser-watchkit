# Player detection

## General rules

WatchKit tracks accessible HTML video and audio. On supported playback routes, it reads numeric `ep` or `episode` parameters and explicit path segments such as `episode-7`. It recognizes a `season` query parameter and a trailing `season-2` in the title slug. A typical URL is `/watch/<id>/show-season-2?ep=7`. WatchKit takes timing from the active player and keeps the validated episode parameter in its share link.

Sites can also provide episode numbers in their video titles or on selected controls with a `data-episode-number` attribute. If no episode can be identified, the card still shows playback timing. Embedded players need Chrome access to their own domain for timing.

## Site and player adapters

These adapters handle metadata or links exposed in a particular format. Miruro-style URLs use the general rule above and work with other hostnames that use the same structure.

| Site or player | What WatchKit reads |
| --- | --- |
| Twitch and Kick live channels | The channel login comes from the channel URL or supported player embed. The broadcast title comes from the page or player metadata. The Discord button opens the channel. VODs and clips use the regular video layout. |
| AniLiberty archive (`anilibria.tv`, `anilibria.uno`) | Active PlayerJS playlist entry and an episode link. For external YouTube and RUTUBE players, uses the episode selected in that player's list. |
| AniLiberty episode pages | Series title and episode number from the episode page title. |
| YummyAnime with Kodik | Series title, selected episode and poster from the outer page. Prefers an English title when available. |
| Habster with Alloha or Collaps | Series title and poster from the outer page. Season and episode come from the Alloha controls or the title that Collaps updates on episode changes. |
| VK Video and RUTUBE | Video title and artwork from the page or player. Episode numbers use the general rules when they are exposed. |
| TikTok | Caption, creator name or handle, and cover from the active clip. **Watch too** opens that clip when its public URL can be identified. Supports regular Chrome tabs and installed Chrome web apps. |
| Instagram Reels | Creator, caption and cover when the active player or its page exposes them. **Watch too** opens the identified Reel without tracking parameters. |
| YouTube Music | Player clock and the largest square cover available. |

The audio service list in [media.js](../extension/media.js) also helps identify music or podcasts when the page uses a video element. Spotify uses its [built-in Discord connection](https://support.discord.com/hc/en-us/articles/360000167212-Discord-Spotify-Connection). Enable **Display Spotify as your status** in Discord's **Connections** settings.

## Artwork

On an episode page, WatchKit prefers a poster associated with the current title by its cover identifier or by a matching details link. This works with layouts that publish a site logo or a banner in their global preview tags, including Miruro. Other page previews and embedded-player artwork remain available as fallbacks.

WatchKit sends recognized public YouTube and Bilibili thumbnail URLs to `wsrv.nl` to fit them into a square with padding. It sends other accepted artwork URLs directly to Discord. Artwork requires a public HTTPS URL. WatchKit accepts query strings only for allowlisted, temporary fields on TikTok and Instagram cover images.
