# Release WatchKit for Chrome

The Chrome Web Store distributes the extension. GitHub Releases distributes the matching Windows bridge. Discord's Developer Portal controls the icon of the shared WatchKit application.

## Create the store draft

1. Register a publisher account and enable two-step verification. Google requires a one-time registration fee. Open the developer dashboard and choose **Add new item**. [Google's publisher setup](https://developer.chrome.com/docs/webstore/register)
2. Upload a ZIP with the contents of `extension/` and the project's `LICENSE` at its root. Exclude the Windows executable and installer from this ZIP. For the first upload, use a copy of the manifest without the unpacked development `key`. [Upload an extension](https://developer.chrome.com/docs/webstore/publish)
3. Copy the **Item ID** from **Package**. It identifies the Chrome extension. Configure the official Windows bridge installer to allow that exact ID in `allowed_origins`. Keep the existing unpacked ID if you also distribute the GitHub installation. The shared Discord Application ID is separate. [Chrome Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging#native-messaging-host)

For an unpublished test with a different Item ID, use `./scripts/install.ps1 -ExtensionId YOUR_STORE_ITEM_ID` in the extracted Windows package. Use the regular installer flow after it has been configured for the public builds. Google can provide the store item's public key under **Package → View public key** if you want an unpacked development build to use the store ID. [Manifest key](https://developer.chrome.com/docs/extensions/reference/manifest/key)

## Prepare the matching Windows release

After reviewing the changes and setting the installer allowlist, commit the release revision and tag it with the version from `extension/manifest.json`. Build the bridge from that revision and package it. Replace `v1.7.0` if you use a different release version.

```powershell
npm test
./scripts/build.ps1
./scripts/package-release.ps1 -Tag v1.7.0
```

Attach the Windows ZIP and `SHA256SUMS.txt` from `build/release/v1.7.0` to the GitHub release. The published release URL goes in the store listing and the review instructions. [GitHub release instructions](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository#creating-a-release)

## Fill in the listing and submit

- **Store listing.** Use the icon at [`extension/branding/watchkit-128.png`](../extension/branding/watchkit-128.png) and a current settings or activity screenshot at 1280×800. State that the extension needs Windows, the Discord desktop app and the one-time bridge installation. Link to the Windows release. [Store listing](https://developer.chrome.com/docs/webstore/cws-dashboard-listing), [Image requirements](https://developer.chrome.com/docs/webstore/images)
- **Privacy.** Publish [the privacy policy](PRIVACY.md) and enter its public URL. Describe the extension's single purpose as sharing the current playback on Discord. Explain that WatchKit reads playback metadata from authorized pages and sends it to Discord desktop through the local Windows bridge. Some public artwork may be requested through `wsrv.nl`. [Privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- **Permissions.** `activeTab` lets WatchKit identify the page in the popup when the user opens it. `scripting` attaches the player reader to allowed pages. `storage` saves local settings and session exclusions. `webNavigation` follows player frames and in-page navigation. `nativeMessaging` connects Chrome to the Windows bridge. Optional site access lets the user choose which sites and player domains WatchKit may read.
- **Test instructions.** On Windows x64, install the store build and its matching bridge, then open Discord desktop. WatchKit uses the shared ID `1056962833218293800` and enables **Share on Discord** on a fresh install. Open a public video, choose **Allow this site** and confirm the Chrome prompt. Check the **Activity** tab of the Discord profile. [Test instructions field](https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions)
- **Distribution.** Test an **Unlisted** release from a clean Chrome profile, including an install made without developer mode. Switch to **Public** when ready. Google reviews each visibility mode. Add the verified store URL to the README after the listing is available. [Visibility settings](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution)

### Store description

> WatchKit shows what you are watching or listening to in Chrome on your Discord profile. It reads the media title, playback time and available artwork from sites you allow. When you turn on sharing, it sends these details to the Discord desktop app through a local Windows bridge.
>
> Requires Windows 10 or 11 x64, the Discord desktop app and a one-time installation of the WatchKit Windows bridge from GitHub Releases. Choose which sites to share and turn sharing off from the toolbar or with a keyboard shortcut.

## Set the Discord application icon

Open the shared [WatchKit application](https://discord.com/developers/applications/1056962833218293800/information) as its owner. In **General Information**, upload [`watchkit-discord-512.png`](watchkit-discord-512.png) as the application icon and save. The Discord desktop account and the shared Application ID are the same as before.
