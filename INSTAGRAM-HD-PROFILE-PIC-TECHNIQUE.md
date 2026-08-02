# Instagram HD Profile Picture Extraction Technique

> For AI agents: this is a standalone, self-contained reference. You don't need any other context from this project to use it — just an Instagram profile URL and a browser automation tool (e.g. Playwright).

## The Problem

When you scrape an Instagram profile normally (viewing the public profile page, reading the `<img alt="{handle}'s profile picture">` element, or intercepting the network request for it), the image URL Instagram serves is capped at **150x150 pixels** via a `stp=dst-jpg_s150x150_tt6` query parameter baked into the signed CDN URL:

```
https://scontent.cdninstagram.com/v/t51.82787-19/{media_id}_n.jpg?stp=dst-jpg_s150x150_tt6&_nc_ohc=...&oh=...&oe=...
```

That `oh`/`oe`/`_nc_ohc` parameters are a signature covering the whole query string. **If you hand-edit `stp` to request a bigger size** (e.g. `s320x320`), the signature no longer matches and the CDN returns `403 Forbidden`. This is true even though Instagram itself has a much larger original version of the same image — you just can't derive its URL by editing the small one.

This means every hero/profile image built from a standard scrape ends up soft/blurry/pixelated when displayed at any real size (e.g. a 300-400px hero card), because the source is only 150px square.

## The Fix: get a freshly-signed HD URL instead of editing the small one

Use a third-party Instagram downloader site that requests the **HD profile pic URL** directly from Instagram's own API (the `hd_profile_pic_url_info` field), which comes back freshly signed for the full original resolution — typically **1080x1080**.

**Tool:** `https://indown.io/insta-dp-viewer`

### Steps (via Playwright or any browser automation)

1. Navigate to `https://indown.io/insta-dp-viewer`
2. Find the text input (placeholder: "Paste valid link here...") and type the **full profile URL**, not just the username:
   ```
   https://www.instagram.com/{handle}/
   ```
3. Click the "SEARCH" button next to the input.
4. Wait for the result card to appear — it shows a blurred preview with two buttons/links: **"View"** and **"Download"**.
5. Extract the href from either link. Both point to the same freshly-signed, full-resolution image:
   ```js
   // Run in-page via browser_evaluate:
   () => Array.from(document.querySelectorAll('a'))
     .filter(a => a.href && a.href.includes('cdninstagram'))
     .map(a => ({ href: a.href, text: a.textContent.trim() }))
   ```
6. Download that URL directly (e.g. `fetch(url)` in-page, or a plain HTTP GET from your own script). Note the URL has **no `stp=` parameter at all** — that's the tell that it's the unrestricted original size.
7. Verify: the downloaded file should be JPEG, typically 1080x1080 (check with `file` on the downloaded bytes, or read its dimensions).

### Why it works

The small 150x150 URL and the HD URL are two *different* signed URLs for the same underlying image — Instagram's own web client requests both separately (the small one for the visible avatar, the HD one only when a user explicitly views/downloads their photo). indown.io's backend makes the HD request server-side (likely hitting Instagram's `web_profile_info`-style endpoint which returns `hd_profile_pic_url_info`) and hands you that freshly-signed link. There is no way to derive it by string-editing the small URL — you have to obtain a URL that Instagram itself signed for that size.

## Practical notes

- This works for any public Instagram profile, not just ones you already scraped — you only need the handle.
- Downloaded HD images are often large (~1200x1200 to 1080x1080, 100-200KB). Resize down for web use (e.g. 600-650px square) rather than shipping the full file — no need to keep more resolution than a hero card will ever display.
- Still verify JPEG magic bytes (`FF D8` at the start of the file) before trusting any downloaded image, same as any other scraped content — don't assume a third-party tool never serves something malformed.
- If `indown.io` ever goes down or changes its markup, the underlying principle (find a tool/endpoint that requests `hd_profile_pic_url_info` server-side rather than editing a signed thumbnail URL) is the reusable idea — other Instagram downloader sites (there are many with similar "DP downloader" tools) work the same way.
