# Instagram HD Photo Extraction Technique (Profile Pic + Post Photos)

> For AI agents: this is a standalone, self-contained reference. You don't need any other context from this project to use it — just an Instagram profile URL/handle and a browser automation tool (e.g. Playwright).

## The Problem

A normal scrape of an Instagram profile (viewing the public profile page while logged out) gives you very little:

- The **profile picture** URL is capped at **150x150 pixels** via a `stp=dst-jpg_s150x150_tt6` query parameter baked into the signed CDN URL.
- The **post grid** only shows the **first 3 posts** before Instagram hides the rest behind a login wall — even for small, low-follower public accounts.

Both are signed URLs (`oh`/`oe`/`_nc_ohc` params cover the whole query string as a signature). **If you hand-edit `stp` to request a bigger size**, the signature no longer matches and the CDN returns `403 Forbidden`. You cannot derive a bigger version by editing a small one — you need a URL Instagram itself signed for that size/content.

This means: hero images built from a standard scrape are blurry (150px source stretched to 300-400px), and galleries end up needing 10+ stock photos because only 3 real posts were ever visible.

## The Fix: third-party downloader tools that re-request the content server-side

Several free "Instagram downloader" sites make the HD/full-post request **server-side** (hitting Instagram's own private API, which returns freshly-signed URLs for full resolution and the complete post history) and hand you the result. This works for **any public profile**, not just ones you already partially scraped.

### Tool A — Profile picture only, fastest: `https://indown.io/insta-dp-viewer`

1. Navigate there, paste the full profile URL (`https://www.instagram.com/{handle}/`) into the input.
2. Click "SEARCH".
3. A result card appears with "View" / "Download" links. Extract the href — it points to `scontent.cdninstagram.com/.../{media_id}_n.jpg` with **no `stp=` parameter**, meaning it's the original (typically 1080x1080).
   ```js
   () => Array.from(document.querySelectorAll('a'))
     .filter(a => a.href && a.href.includes('cdninstagram'))
     .map(a => a.href)
   ```
4. Download directly.

### Tool B — Full post history (up to ~12-15 recent posts), more powerful: `https://toolzu.com/downloader/instagram/profile/`

This is the bigger unlock: it returns real photos from posts **you can't even see** on the logged-out profile page, at near-original resolution (phone-camera quality, often 2-4MB / 3000px+ on the long side for carousel items).

1. Navigate to `https://toolzu.com/downloader/instagram/profile/`
2. Accept the cookie banner if present.
3. Type just the **username** (not full URL) into the input field (id `#instagramdownloaderform-search` at time of writing), e.g. `fc.autoz`.
4. Click "Download".
5. Wait ~5-10 seconds — this tool is noticeably slower than the profile-pic-only tools because it's pulling a real post history.
6. A grid of post thumbnails appears, each with its own download button. Extract every image URL:
   ```js
   () => Array.from(document.querySelectorAll('img'))
     .filter(i => i.src && i.src.includes('cdninstagram'))
     .map(i => i.src)
   ```
   Each URL looks like `https://cdn-s2.toolzu.com/media/{id}_n.jpg?url={url-encoded original cdninstagram.com URL}&time=...&key=...` — **this is a proxy URL, not a direct Instagram URL**, but fetching it directly returns the real image bytes (verified: 100KB-1.8MB JPEGs, magic bytes `FF D8 FF`, real dimensions up to 3024x4032).
7. Download each proxy URL directly (`fetch()`/HTTP GET) — no need to click through the UI per-image.

### Tool C — Same technique, alternate provider (useful if B is down): `https://clipssaver.com/instagram-profile-downloader/{handle}`

The username can go directly in the URL path. Uses a different proxy domain (`cdn.socialhubapi.com/media/{id}_n.jpg?src={base64-encoded original URL}...`) but returns the **same underlying photos** (same Instagram media IDs) as Tool B. Useful as a fallback or cross-check, not usually necessary if B works.

## Why it works

Instagram's web client only fetches the tiny thumbnail and the first few posts for a logged-out visitor — the rest requires a signed-in session to request via GraphQL. These downloader sites make that authenticated-equivalent request **on their own backend** (they have their own session/API access) and simply relay the resulting URLs/bytes to you. There's no way to replicate this by editing URLs yourself; you're relying on the tool's own backend access.

## Practical notes

- **Which tool for which job:** use Tool A (indown.io) when you only need the profile picture — it's fast. Use Tool B (toolzu.com) whenever you want real post photos for a gallery/hero — it's slower (~5-10s) but far more valuable, especially for accounts where the priority is **using the business's own real photos over stock** (personalization signal).
- Not every photo returned will be usable — apply the same judgment as any scraped content: skip logos/flyers/menus, skip anything with a different business's branding visible, prefer photos that clearly show real work in progress. Real customer/staff faces in a business's own public content are fine to reuse on that business's own site.
- Resize down for web use after downloading (e.g. longest side ~1000-1400px, JPEG quality ~85) — these tools often return multi-megabyte originals, more than any web card needs.
- Still verify JPEG magic bytes (`FF D8` at the start) before trusting any downloaded image.
- After uploading replacement images to a path other files already reference, GitHub Pages' CDN can take a few minutes to reflect the change even though the repo content is already correct — verify with a `cache: 'no-store'` fetch (or the GitHub Contents API, which is never cached) rather than trusting a browser that may have the old image cached from an earlier visit.
- If any of these specific sites go down or change their markup, the reusable idea is: **find an Instagram downloader tool that does the extraction server-side**, not a URL-editing trick — there are many similar sites and they all work the same way.
