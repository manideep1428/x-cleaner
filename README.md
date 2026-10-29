# x-cleaner

**X Link Cleaner** is a Chrome extension that removes the tracking part from X (Twitter) post links.

```
Before: https://x.com/hey_madni/status/2115439908416590208?a=Rk7vQpLm2XwTzN9bHcYfA&s=46
After:  https://x.com/hey_madni/status/2115439908416590208
```

When you share a post, X adds tracking values like `?s=46&t=…` or `?a=…&s=46` to the link.
This extension removes them automatically, both when you open a link and when you copy one on x.com.

## Contents

- [What it does](#what-it-does)
- [Install](#install)
- [Update](#update)
- [How it works](#how-it-works)
- [Permissions and privacy](#permissions-and-privacy)
- [Build](#build)
- [Project structure](#project-structure)
- [Making changes and releasing a new version](#making-changes-and-releasing-a-new-version)
- [Limitations](#limitations)
- [Troubleshooting](#troubleshooting)

## What it does

- **Opening a link.** When you open an X post link that has a query (typed, pasted, or clicked on
  any website), Chrome removes the query *before* sending the request. X never receives the
  tracking values, and the address bar shows the clean link.
- **Copying a link on x.com.** **Share → Copy link** and normal copying (Ctrl+C / Cmd+C) put the
  clean link on your clipboard. There's nothing extra to click.
- **Only post links change.** Search, profile and login pages keep their query because they need it.

| Link | Result |
| --- | --- |
| `https://x.com/user/status/123?s=46&t=abc` | `https://x.com/user/status/123` |
| `https://twitter.com/user/status/123?s=20` | `https://twitter.com/user/status/123` |
| `https://mobile.x.com/user/status/123/photo/1?s=20` | `https://mobile.x.com/user/status/123/photo/1` |
| `https://x.com/i/web/status/123?s=20` | `https://x.com/i/web/status/123` |
| `https://x.com/search?q=hello&src=typed_query` | unchanged |
| `https://x.com/user?s=21` (profile) | unchanged |

## Install

You need Chrome 111 or newer. Other Chromium browsers (Edge, Brave) use the same extension system
and should work too, but only Chrome has been tested.

1. Get the code, in one of two ways:
   - **Download:** on this page, click the green **Code** button → **Download ZIP**, then unzip it.
     You get a folder called `x-cleaner-main`.
   - **Git:** `git clone https://github.com/manideep1428/x-cleaner.git`
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (the switch in the top-right corner).
4. Click **Load unpacked** and select the **`extension`** folder inside the folder from step 1.
   Pick `extension` itself: Chrome needs the folder that contains `manifest.json`.
5. **X Link Cleaner** now appears in your list of extensions.

Keep the folder where it is. Chrome loads the extension from that folder every time it starts.

Chrome warns that the extension can read and change your data on x.com and twitter.com.
[Permissions and privacy](#permissions-and-privacy) explains why.

### Check that it works

1. Paste this link into the address bar:

   ```
   https://x.com/hey_madni/status/2115439908416590208?a=Rk7vQpLm2XwTzN9bHcYfA&s=46
   ```

   You should end up on `https://x.com/hey_madni/status/2115439908416590208`.
2. On any post, click **Share → Copy link** and paste the link somewhere. It should end with the
   post number, with no `?`.

## Update

1. Get the new version:
   - **Git:** run `git pull` in your `x-cleaner` folder.
   - **Download:** download the ZIP again and replace your old folder with the new one, in the
     same place. If you put it somewhere else, remove the old extension in `chrome://extensions`
     and use **Load unpacked** again on the new `extension` folder.
2. Open `chrome://extensions` and click the **reload** button (↻) on the X Link Cleaner card.
   Chrome doesn't pick up changes to an unpacked extension until you reload it or restart Chrome.
3. Reload any open x.com tabs.

## How it works

The extension has two parts:

| Part | File | Runs | Job |
| --- | --- | --- | --- |
| Redirect rule | `extension/rules.json` | When a tab is about to open a page | Removes the query from post links before the request is sent |
| Page script | `extension/content.js` | On x.com / twitter.com pages, before X's own code | Cleans links that X copies to the clipboard, and cleans the address bar as a backup |

`extension/manifest.json` registers both parts with Chrome and limits the extension to x.com and
twitter.com.

### 1. Opening a link: `rules.json`

```json
{
  "id": 1,
  "priority": 1,
  "condition": {
    "regexFilter": "^https://(www\\.|mobile\\.)?(x|twitter)\\.com/(\\w+|i/web)/status(es)?/\\d+(/[^?#]*)?\\?",
    "requestDomains": ["x.com", "twitter.com"],
    "resourceTypes": ["main_frame"]
  },
  "action": {
    "type": "redirect",
    "redirect": { "transform": { "query": "" } }
  }
}
```

In plain words: *if a tab is opening `x.com` or `twitter.com`, then `/username/status/`, then a post
number, then a `?`, open the same address with everything after the `?` removed.*

```
You open:      https://x.com/hey_madni/status/2115439908416590208?a=Rk7v…&s=46
Rule matches → Chrome removes the query
Chrome sends:  https://x.com/hey_madni/status/2115439908416590208
```

- Chrome applies the rule itself, using its built-in
  [declarativeNetRequest](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest)
  API, before anything is sent. No extension code runs for this.
- `requestDomains` makes Chrome skip the rule for every other site. The `regexFilter` then checks
  the exact address.
- `"resourceTypes": ["main_frame"]` limits the rule to pages opened in a tab. Images and X's
  background requests are not touched.
- The pattern ends with `\?`, so it only matches links that have a query. The cleaned link doesn't
  match again, so there's no redirect loop.
- It doesn't matter where the link came from (address bar, x.com, or any other website), because
  Chrome checks the request to x.com itself.

### 2. Copying a link: `content.js`

Chrome runs `content.js` on every x.com and twitter.com page:

- at `"run_at": "document_start"`, before any of X's own scripts run;
- in the page's own JavaScript context (`"world": "MAIN"`). Extension scripts normally run in a
  separate [isolated world](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts),
  where they can't replace the page's functions.

That lets it wrap every standard way a web page can put text on the clipboard. Each wrapper passes
the text through `clean()` and then calls the browser's original function:

| How a page copies text | What `content.js` does |
| --- | --- |
| `navigator.clipboard.writeText(text)` | Cleans `text` |
| `navigator.clipboard.write(items)` | Cleans every text part (`text/plain`, `text/html`) of each item |
| `event.clipboardData.setData(type, text)` in a copy handler | Cleans `text` |
| Copying a text selection (Ctrl+C, or `document.execCommand('copy')`) | Listens for the `copy` event. If the selection contains a tracked link, it puts the cleaned text on the clipboard instead |

So whichever method X's **Copy link** uses, the clipboard gets the clean link:

```
X copies:   https://x.com/hey_madni/status/2115439908416590208?a=Rk7v…&s=46
clean():    removes "?a=Rk7v…&s=46"
Clipboard:  https://x.com/hey_madni/status/2115439908416590208
```

`clean()` finds X post links anywhere in a piece of text and removes their query:

- It only changes `x.com` / `twitter.com` post links (`/user/status/123`). Other text and other
  links stay exactly the same.
- Punctuation after a link is kept: `…/123?s=20.` becomes `…/123.`
- A question mark that isn't a query is left alone: `Did you see …/123? Wow` doesn't change.
- Links inside HTML or JSON work too: `<a href="…/123?s=20">` becomes `<a href="…/123">`.

### 3. Address-bar backup: `content.js`

If a post page ever loads with the query still in its address (because it got past the redirect
rule), `content.js` removes the query from the address bar before X's code starts:

```js
if (location.search && POST_PATH.test(location.pathname)) {
  history.replaceState(history.state, '', location.pathname + location.hash);
}
```

This only changes what the address bar shows. In that case X's server has already received the
query, so the redirect rule is the main protection.

## Permissions and privacy

| In `manifest.json` | Why it's needed |
| --- | --- |
| `"declarativeNetRequestWithHostAccess"` | Lets the redirect rule change requests, but only for the sites in `host_permissions`. |
| `"host_permissions": ["https://*.x.com/*", "https://*.twitter.com/*"]` | The sites the rule may redirect, and where `content.js` is allowed to run. |

The extension has no background script, stores nothing, collects nothing, and makes no network
requests of its own. It can't access any site other than x.com and twitter.com.

## Build

There's nothing to compile. The extension is plain JavaScript and JSON, and Chrome loads the
`extension` folder as it is. You only need to build if you want a zip file, for example to share
the extension or attach it to a GitHub release.

Requirements: [Node.js](https://nodejs.org) 18 or newer. There are no dependencies, so you don't
need `npm install`.

```bash
npm run build
```

The build script (`scripts/build.mjs`):

1. Checks that `manifest.json` and `rules.json` are valid JSON and that every file the manifest
   points to exists. If not, it stops with an error.
2. Writes `dist/x-cleaner-<version>.zip`, with `manifest.json` at the top level of the zip, where
   Chrome expects it. It skips dotfiles and the `_metadata` folder that Chrome creates when you
   load the extension unpacked.

```
$ npm run build
Built dist/x-cleaner-1.0.0.zip (3 files: content.js, manifest.json, rules.json)
```

The version in the file name comes from `"version"` in `extension/manifest.json`. Building the same
files always gives a byte-identical zip.

To install from the zip, unzip it into a folder and use **Load unpacked** on that folder.

## Project structure

```
x-cleaner/
├── extension/            The extension. Load this folder in Chrome.
│   ├── manifest.json     Extension settings (Manifest V3)
│   ├── rules.json        Redirect rule for opening links
│   └── content.js        Copy cleaning and address-bar backup
├── scripts/
│   └── build.mjs         Creates dist/x-cleaner-<version>.zip
├── package.json          Defines `npm run build`
├── .gitignore            Keeps dist/ and Chrome's _metadata/ out of git
└── README.md
```

## Making changes and releasing a new version

1. Edit the files in `extension/`.
2. Test: click reload (↻) on the extension in `chrome://extensions`, reload your x.com tabs, and
   repeat [Check that it works](#check-that-it-works).
3. Raise `"version"` in `extension/manifest.json` (for example `1.0.0` → `1.0.1`). It's shown in
   `chrome://extensions` and used in the zip's file name.
4. Run `npm run build`.
5. Commit and push. To publish the zip, create a GitHub release and attach
   `dist/x-cleaner-<version>.zip`.

Users then follow [Update](#update).

## Limitations

- Only post links are cleaned. Profile links with `?s=…` are left as they are.
- **Share → Share post via…** (your computer's share menu) isn't cleaned yet. **Copy link** is.
- Copy cleaning only runs on x.com and twitter.com. A tracked link you copy on another site is
  cleaned when you open it, not when you copy it.
- Chrome extensions don't run on phones or inside the X app, so sharing from the X app on a phone
  still adds tracking.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "Manifest file is missing or unreadable" when loading | You selected the wrong folder. Select the `extension` folder, the one that contains `manifest.json`. |
| An opened link still has `?…` | Check that the extension is turned on in `chrome://extensions`, then click reload (↻). Only post links (`/status/…`) are cleaned. |
| **Copy link** still copies the tracking | Reload the x.com tab. Tabs that were open before you installed or reloaded the extension don't run `content.js` yet. |
