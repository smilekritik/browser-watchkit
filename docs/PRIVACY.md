# WatchKit for Chrome privacy policy

WatchKit reads playback details on websites you allow so it can show your current activity on Discord. **Share on Discord** is on by default on a fresh install. Chrome asks you to confirm website access. You can turn off **Share on Discord** in the popup, use the keyboard shortcut to stop sharing, revoke site access, exclude sites, or turn off sharing from background tabs.

## What WatchKit reads and stores

While sharing is on, WatchKit reads the media title, site, playback position, duration, speed, playing or paused state, and available artwork from supported players. When available, it also reads information such as the track artist, episode number, or streamer's channel name. WatchKit saves the Discord Application ID, artwork preference, sharing settings and excluded sites in your Chrome profile. It holds current playback samples in memory and keeps no viewing history.

## What is shared

The extension sends current activity details through the local Windows bridge to the signed-in Discord desktop app. People who can see your Discord activity may see this information according to your Discord activity settings. The optional link button shares a cleaned media URL. Turn off the **Watch too / Listen too button** setting to stop sharing that link.

Discord may fetch public cover images to display the activity. Some public thumbnails are passed through `wsrv.nl` to fit the Discord artwork layout. The extension uses browsing activity only to show the playback information you choose to share. It does not sell the information or use it for advertising. WatchKit handles Chrome data in accordance with the Limited Use requirements. [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/policies#limited_use)

## Contact

Report a privacy issue through the [WatchKit issue tracker](https://github.com/smilekritik/browser-watchkit/issues).
