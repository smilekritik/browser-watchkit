<div align="center">

# WatchKit for Chrome

**Show what you're watching or listening to in Chrome on your Discord profile.**

[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11%20x64-0078D4)](#install)
[![Chrome](https://img.shields.io/badge/Chrome-119%2B-4285F4)](#install)
[![License: GPL-2.0-or-later](https://img.shields.io/badge/license-GPL--2.0--or--later-2EA043)](LICENSE)

[Download for Windows](https://github.com/smilekritik/browser-watchkit/releases/latest) · [Install](#install) · [Discord setup](#connect-discord-in-chrome) · [Use WatchKit](#use-watchkit) · [WatchKit for VLC](https://github.com/smilekritik/vlc-watchkit)

</div>

WatchKit follows playback in Chrome, including music or video with sound in background tabs. The Discord card shows the site, title, artwork when available, playback position, and playback speed when it differs from 1×. The WatchKit popup shows how much time is left at the current speed. A configurable keyboard shortcut pauses and resumes tracking across Chrome.

## Install

You need Windows 10 or 11 x64, Chrome 119 or later, and the [Discord desktop app](https://discord.com/download).

1. Under **Assets** on the release page, download `WatchKit-Chrome-…-win-x64.zip`. The **Source code** archives require a build. [Download page](https://github.com/smilekritik/browser-watchkit/releases/latest)
2. Right-click the ZIP in File Explorer, choose **Extract All**, and open the extracted folder. Keep this folder after installation because Chrome loads the extension from it.
3. Double-click **Install WatchKit.bat** under the Windows account you use for Chrome. Setup uses Windows PowerShell and runs as a regular user. When the bridge is registered, the window prints the exact folder to load in Chrome.
4. Paste `chrome://extensions` into Chrome's address bar. Turn on **Developer mode**, click **Load unpacked**, and select the `extension` folder inside the extracted folder. Choose the folder that contains `manifest.json`.
5. Open Chrome's **Extensions** menu and pin **WatchKit**. Continue with the Discord setup below.

The bridge runs when Chrome needs it. If you prefer PowerShell, run `Unblock-File -LiteralPath .\scripts\install.ps1` from the extracted folder, then run `.\scripts\install.ps1`. You can also right-click the unblocked script and choose **Run with PowerShell**. The batch file keeps the setup result visible.

## Connect Discord in Chrome

WatchKit uses the shared Discord Application ID `1056962833218293800` and turns on **Share on Discord** on a fresh install. Discord desktop publishes the activity to the account you're signed in to. No bot invite or token is required.

1. Open the Discord desktop app and sign in.
2. Open a video tab, choose **Allow this site** in the WatchKit popup, and confirm the Chrome prompt. To allow YouTube, YouTube Music, Twitch, and Kick together, use **Settings → Website access → Allow media sites**.
3. Play the video and keep its tab selected. Look for **Sharing on Discord** in the popup, then open your full Discord profile and select **Activity**. Use **Share on Discord** in the popup whenever you want to stop or resume sharing.

For an embedded player on another domain, allow both the page and player domains, or use **Settings → Website access → Allow all websites**.

If the card is missing, open Discord's **User Settings → Activity Privacy** and enable activity sharing. Use **Show** in WatchKit settings to verify the saved ID.

### Playback timing

Play media of known duration at `1×` to see Discord's progress bar in the full profile's **Activity** tab. The first text line shows the site and the artist or creator when available. The next line shows the track, video, or episode title. Discord may omit the bar in its compact voice-channel popup. At another speed, the card shows the media's current position and duration, for example `01:47 / 03:06 · Speed 1.5×`. Seek, pause, or change speed to update the displayed position. Paused media shows a fixed position. Return to `1×` to restore the moving bar.

Hover over the cover in the Discord profile to see the estimated time left at the current speed. The WatchKit popup shows the same estimate. At `01:47` in a `03:06` video on `1.5×`, both show `00:53 left`. Live playback and media with an unknown duration omit this estimate. When playback pauses, the cover has a small pause badge with a `Paused` tooltip.

## WatchKit for Chrome and VLC

Enter the shared WatchKit ID above in **View → WatchKit Settings** in VLC. If VLC already uses a custom ID and runs under the same Windows account, open Chrome WatchKit's **Settings → Discord** and choose **Import ID from WatchKit for VLC**. If Chrome is already set up with a custom ID, you can also paste it into VLC. [VLC Discord setup](https://github.com/smilekritik/vlc-watchkit/blob/main/docs/DISCORD.md)

With Chrome 1.5.1 and VLC 1.1.3 or later, playing media in VLC takes priority over Chrome. Playing browser media takes over when VLC pauses or stops, including playback from an allowed background tab. If both have paused media, VLC keeps the card.

## Screenshots

| Video | Live stream |
| --- | --- |
| ![Discord activity with a video and thumbnail](docs/screenshots/discord-bilibili.png) | ![Discord activity with a live stream and channel artwork](docs/screenshots/discord-twitch.png) |

The Discord screenshots are from an earlier release. See [Playback timing](#playback-timing) and [Live streams](#live-streams) for the current layout.

![WatchKit settings with Discord setup, website access, exclusions and keyboard shortcut](docs/screenshots/chrome-settings.png)

## Use WatchKit

- With **Settings → Discord → Share background playback** on by default, WatchKit shows music and videos with sound from background tabs as **Listening**. Playback on the selected tab takes priority when it is playing with sound. When playback is paused, its card can appear only on the selected tab. Turn off the setting and save to share only the selected tab.
- Background playback uses the same website access and exclusion rules as the selected tab. Grant access once for each site you want to share. Chrome's speaker indicator helps WatchKit find background tabs with sound.
- Open the popup on a website to **Pause until restart** or **Exclude site**. Manage both in **Settings → Website access → Excluded and paused sites**. A domain rule also covers its subdomains.
- For local media, enable **Allow access to file URLs** in the extension's Chrome details and grant access from the popup. WatchKit uses `Local video` or `Local audio` as the activity title.
- Press **Ctrl+Shift+Y** while Chrome is focused to turn tracking off across the browser and clear the Discord activity. Press it again to resume. The toolbar icon shows **OFF** while tracking is off, and WatchKit remembers the setting after Chrome restarts.
- To change the shortcut or assign one if it is unbound, click **Settings → Change shortcut** or open `chrome://extensions/shortcuts` and find **Toggle WatchKit tracking**.

WatchKit detects accessible HTML video and audio, including players in frames that Chrome allows it to read. Playback that only uses Web Audio or an inaccessible player may not be detected. Chrome internal pages and incognito windows are outside its scope.

### Installed Chrome web apps

Install WatchKit in the Chrome profile you used to install the web app. The app window uses that profile's extension and website access settings. To check access, open the same site in a regular tab and look for **Access allowed** in the WatchKit popup.

After updating WatchKit, open its settings and click **Reload extension**, then refresh the app with **Ctrl+R**. Start a video in the app window. Keep **Share background playback** enabled if you want WatchKit to keep sharing while the app plays with sound behind another Chrome window.

### Music, podcasts and radio

WatchKit uses **Listening** for audio playback. Artist and artwork depend on the information exposed by the player. See [player detection](docs/PLAYER-DETECTION.md) for services with built-in Discord integrations or custom metadata handling.

### Live streams

On a live Twitch or Kick channel, the first line of the Discord card shows the platform and the streamer's login. The second line shows the broadcast title when the player makes it available. For example, the first line can be `Twitch · koma` and the button `Watch koma`. The button opens the channel. Recordings and clips use the regular video layout.

### Series and embedded players

WatchKit recognizes explicit episode labels in titles, selected episode controls, and playback URLs such as `/watch/<id>/<title>?ep=7`. On these playback URLs, it combines the episode from the page with the timing from the active player, including an accessible embedded player. See the [detection rules and player adapters](docs/PLAYER-DETECTION.md).

## Data and previews

**Watch too** and **Listen too** let people who see your Discord activity open its media page. To hide the link, turn off **Watch too / Listen too button** under **Settings → Discord** and click **Save settings**. WatchKit keeps recognized media identifiers and episode numbers in HTTPS links. Discord only shows the button to other users. [Test Rich Presence buttons](https://docs.discord.com/developers/discord-social-sdk/development-guides/setting-rich-presence#setting-buttons)

The extension saves your Discord application ID, artwork key, sharing preferences, and site exclusions in this Chrome profile. It sends activity details to Discord desktop through the local bridge. It keeps no viewing history. Chrome's navigation permission lets it follow page changes in tabs it is tracking.

WatchKit looks for public HTTPS artwork in the player's media metadata, the video poster, and preview tags on the page. Some public thumbnails are fitted into a square by an image resizing service. WatchKit accepts query strings only for recognized, temporary cover image signatures. If it finds no usable URL, it uses your optional fallback artwork key. [Artwork examples and resizing](docs/PLAYER-DETECTION.md#artwork)

## Update or remove

1. Close Chrome and download the latest Windows x64 ZIP. Extract it and copy its contents into the original WatchKit folder, replacing older files. Keeping the original extension folder preserves its settings.
2. Double-click **Install WatchKit.bat** in that folder to update the Windows bridge. Use the bridge and the extension from the same release.
3. Open Chrome and click **Reload** on the WatchKit card at `chrome://extensions`. You can also click **Reload extension** in WatchKit settings. Refresh any playback tabs you had open.

To remove it, close Chrome, unblock and run `./scripts/uninstall.ps1` from the release folder, then remove WatchKit in `chrome://extensions`.

## Troubleshooting

| What you see | What to check |
| --- | --- |
| Installer says to download the release ZIP | Check for `build/browser-watchkit-host.exe` next to the `extension` and `scripts` folders. Extract the Windows x64 ZIP from **Assets** before running the installer. |
| PowerShell reports a missing `LiteralPath` or a doubled path | Double-click **Install WatchKit.bat** in the extracted folder. |
| **WatchKit bridge could not start** | Rerun **Install WatchKit.bat** using the same Windows account as Chrome, then reload WatchKit in `chrome://extensions`. For a custom build with a different extension ID, run `.\scripts\install.ps1 -ExtensionId YOUR_EXTENSION_ID`. |
| **Waiting for playback** | Play the media in the selected Chrome tab and check its site permissions and exclusions. For a player embedded from another domain, grant access to that domain, then refresh the tab. |
| **Waiting for the Discord desktop app** | Open Discord desktop and sign in. If Discord is already open, check the **Application ID** in WatchKit settings. |
| **Discord rejected the activity** or no Discord card | Compare the saved ID with the one in [Connect Discord in Chrome](#connect-discord-in-chrome) or your own application's **General Information**. Check Discord's activity privacy settings. |
| The card shows only a player name or misses the episode | Record the page URL and the selected player's name. A site can offer multiple players and each can expose title, season, and episode data differently. |
| The card shows a question mark or the wrong artwork | Under **Settings → Discord**, clear the fallback artwork field or enter an asset key that exists in the same Discord application, then save. A site can provide a preview URL that Discord cannot load, for example when it requires a signed-in browser. |

## Build from source

Clone this repository or extract the source ZIP. In PowerShell 7, use `Get-ChildItem ./scripts -Filter *.ps1 -File | Unblock-File` if needed, then run `./scripts/build.ps1`. The build downloads and verifies its compiler and JSON header. Run **Install WatchKit.bat** in the checkout, then load its `extension` folder in Chrome. Run `npm test` with Node.js to check activity formatting and selection.

The native Discord transport is shared with [WatchKit for VLC](https://github.com/smilekritik/vlc-watchkit). See [LICENSE](LICENSE).

To package a release, build the bridge from the tagged revision, then run `./scripts/package-release.ps1 -Tag vX.Y.Z`. Upload the ZIP and `SHA256SUMS.txt` from `build/release/vX.Y.Z` to GitHub Releases. The script checks that the installer is at the archive root and that the Chrome manifest matches the tag.

For a store release, follow the [Chrome Web Store release guide](docs/CHROME-WEB-STORE.md). The [privacy policy](docs/PRIVACY.md) describes data used by the extension and its bridge.

## Get a Discord Application ID

To choose your own activity name or upload your own artwork, [set up your own Discord application](docs/DISCORD.md).
