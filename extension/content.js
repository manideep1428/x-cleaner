// X Link Cleaner: removes the tracking query (?s=46&t=…, ?a=…&s=…) from X post links.
//
// Runs in the page's own JavaScript context ("MAIN" world) on x.com and twitter.com,
// before X's code loads, so it can also clean links that X puts on the clipboard.
(() => {
  'use strict';

  // Characters allowed in a URL path / query. Anything else (spaces, quotes, brackets,
  // "<", ">") ends a link, so links inside HTML or JSON are found too.
  const PATH_CHAR = String.raw`[\w\-.~%!$&*+,;=:@/]`;
  const QUERY_CHAR = String.raw`[\w\-.~%!$&*+,;=:@/?]`;
  const POST_LINK = String.raw`https?://(?:www\.|mobile\.)?(?:x|twitter)\.com/(?:\w+|i/web)/status(?:es)?/\d+(?:/${PATH_CHAR}*)?`;

  // A post link followed by "?query". Group 1 is the link without the query.
  // The query must start like a parameter ("?s=", "?t="), so "…/123? Wow" keeps its "?",
  // and punctuation right after a link ("…?s=20." or "…?s=20!") is kept.
  const TRACKED_POST_LINK = new RegExp(
    String.raw`(${POST_LINK})\?(?=[\w%-])${QUERY_CHAR}*?(?=[.,;:!?]*(?!${QUERY_CHAR}))`,
    'gi',
  );
  const POST_PATH = /^\/(?:\w+|i\/web)\/status(?:es)?\/\d+(?:\/|$)/i;

  const clean = (text) => text.replace(TRACKED_POST_LINK, '$1');
  const cleanValue = (value) => (value == null ? value : clean(String(value)));

  // 1. Address bar. The redirect rule in rules.json normally strips the query before
  //    the request is sent; this covers page loads that the rule didn't apply to.
  if (location.search && POST_PATH.test(location.pathname)) {
    history.replaceState(history.state, '', location.pathname + location.hash);
  }

  // 2. navigator.clipboard.writeText() / navigator.clipboard.write()
  const { writeText, write } = Clipboard.prototype;

  Clipboard.prototype.writeText = function (text) {
    return writeText.call(this, cleanValue(text));
  };

  Clipboard.prototype.write = async function (items) {
    let cleanedItems = items;
    try {
      cleanedItems = await Promise.all(Array.from(items, cleanClipboardItem));
    } catch {
      // If an item can't be read, give the browser the page's original items.
    }
    return write.call(this, cleanedItems);
  };

  async function cleanClipboardItem(item) {
    const data = {};
    for (const type of item.types) {
      const blob = await item.getType(type);
      data[type] = type.startsWith('text/') ? new Blob([clean(await blob.text())], { type }) : blob;
    }
    return new ClipboardItem(data);
  }

  // 3. event.clipboardData.setData() in copy handlers (document.execCommand('copy') helpers).
  const { setData } = DataTransfer.prototype;

  DataTransfer.prototype.setData = function (format, data) {
    return setData.call(this, format, cleanValue(data));
  };

  // 4. Copying selected text (Ctrl+C, or execCommand('copy') on a selection).
  addEventListener(
    'copy',
    (event) => {
      const text = String(getSelection());
      const cleaned = clean(text);
      if (cleaned !== text && event.clipboardData) {
        event.clipboardData.setData('text/plain', cleaned);
        event.preventDefault();
      }
    },
    true,
  );
})();
