# Cold Outreach Web Builder — Master Project Guide

> **For AI agents picking up this project:** Read this entire file before doing anything. It covers what the project does, the full daily workflow, all 10 website templates, the design system, every technical credential, and every critical rule. Nothing is left out.

---

## 1. What This Project Is

The owner finds small businesses on Instagram that have good content but **no website**. A website is built for them using their own Instagram photos, uploaded to GitHub Pages for free, and a DM is sent to the business owner linking them to their new site. The goal is to convert them into paying clients who want the site customised.

**Working directory:** `E:\claude\`  
**Platform:** Windows 11, PowerShell 5.1  
**Scraper:** Node.js + Playwright  

---

## 2. The Full Daily Workflow

```
1. Receive a list of Instagram handles (one category per batch, typically 20-60 accounts)
2. Run the scraper (Node.js/Playwright) → saves photos to E:\claude\ig_dl\{handle}\
3. Run the build script (PowerShell) → generates one HTML file per account in E:\claude\
                                     → saves compressed images to E:\claude\img\{slug}\
4. Run the upload script (PowerShell) → pushes HTML + images to GitHub Pages
                                      → POSTs each lead to Google Sheets webhook
                                      → appends each lead to outreach-messages.csv
5. Update the DM Helper dashboard (outreach-leads.html) with the new batch
6. Upload the updated DM Helper to GitHub
7. Owner opens DM Helper, copies message, opens Instagram, sends DM
```

---

## 3. Credentials & Infrastructure

### GitHub
- **Repo:** `thinktoshareWEBSITES/w`
- **Branch:** `main`
- **Token:** stored in memory at `C:\Users\debor\.claude\projects\e--claude\memory\github-credentials.md` — hardcode it directly in every script, never read from a file
- **Pages base URL:** `https://thinktosharewebsites.github.io/w/`
- **Upload pattern:** PUT to `https://api.github.com/repos/thinktoshareWEBSITES/w/contents/{path}` with SHA fetch + 3 retries + 3s sleep on conflict
- **Use `Invoke-RestMethod`** not `Invoke-WebRequest` (WebRequest breaks on Accept header)

### Google Sheets
- **Sheet name:** Cold Outreach — Instagram Leads
- **Webhook (CORRECT one):** `https://script.google.com/macros/s/AKfycbwj4XoK7yVkCeMYY39x7Mc9t4LLP62TSjL9S2hcywUYtYWK95zxtqiOw0MavH_JAnm5/exec`
- **Always POST after every upload.** Never skip it.
- **POST body fields:** `category`, `handle`, `instagram_url`, `business_name`, `location`, `industry`, `page_url`, `date`
- **WRONG webhook** (do not use): `AKfycby6l-mV7FTXgQLT836bnJfTCkucZLShZltgjACrbHWaR0SVyKWsZ3_OnhPgTFcj6Dd3/exec`

### Local Paths
| Purpose | Path |
|---------|------|
| Working directory | `E:\claude\` |
| Scraped images | `E:\claude\ig_dl\{handle}\` |
| Built images (compressed) | `E:\claude\img\{slug}\` |
| Stock images | `E:\claude\stock_imgs\{category}\` |
| Bad image blocklist | `E:\claude\bad_image_blocklist.txt` |
| Outreach CSV | `E:\claude\outreach-messages.csv` |
| DM Helper | `E:\claude\outreach-leads.html` |

---

## 4. The Scraper (Node.js + Playwright)

Each batch has its own scraper script e.g. `scrape_detail27.js`. Key settings:

```javascript
const MAX_SCROLLS = 6;          // NEVER go above 7 — higher captures Instagram's suggested feed (strangers' photos)
const MIN_SIZE = 8 * 1024;      // 8KB minimum — filters out thumbnails
const MAX_IMAGES = 22;          // max images per account
```

**Mobile-first UA strategy (3 attempts):**
1. iPhone mobile UA
2. Chrome desktop UA
3. Firefox UA (often breaks through login walls the others can't)

**Network interception:** Use Playwright's `page.on('response')` to intercept CDN image responses directly — faster and more reliable than DOM scraping.

**Magic-byte JPEG filter (CRITICAL):** Instagram CDN now serves JavaScript bundles on the same domains as images. Before saving any file, check the first 2 bytes:
```javascript
if (buffer[0] !== 0xFF || buffer[1] !== 0xD8) continue; // not a real JPEG, skip
```

**Save path:** `E:\claude\ig_dl\{handle}\{handle}_001.jpg`, `_002.jpg`, etc.  
**Profile pic:** `E:\claude\ig_dl\{handle}\{handle}_pp.jpg` (always downloaded, used as hero card)

---

## 5. The Build Script (PowerShell)

Each batch has its own build script e.g. `build-detail27-sites.ps1`.

**Image processing uses WPF (PresentationCore)** — Windows-only, no System.Drawing:
```powershell
Add-Type -AssemblyName PresentationCore
```

**Blocklist check (CRITICAL — every build must include this):**
```powershell
$blocklist = @{}
if (Test-Path 'E:\claude\bad_image_blocklist.txt') {
    Get-Content 'E:\claude\bad_image_blocklist.txt' | ForEach-Object { $blocklist[$_.Trim()] = $true }
}
# Then for each image:
$md5 = [System.BitConverter]::ToString((New-Object System.Security.Cryptography.MD5CryptoServiceProvider).ComputeHash([System.IO.File]::ReadAllBytes($imgPath))).Replace('-','').ToLower()
if ($blocklist[$md5]) { # skip this image }
```

**Real photos vs stock rule:**
- Use scraped photos ONLY if they clearly show the actual work (detailing a car, mowing a lawn, nail art, etc.)
- If images are selfies, flyers, memes, personal photos, or unrelated content → use stock instead
- `_pp.jpg` (profile picture) is ALWAYS safe for the hero card slot — never use post images for the hero

**Hero card:** Always uses `ppPath` (`{slug}_pp.jpg`) — never a post image.

**Image slots naming:** `{slug}_hero.jpg`, `{slug}_svc1.jpg`, `{slug}_gal1.jpg`, etc. (varies by template — see section 7)

**Stock images:** Stored in `E:\claude\stock_imgs\{category}\`. Used as fallback when real photos don't meet quality standards. Named `stock_1.jpg`, `stock_2.jpg`, etc.

**Output:** One `.html` file per account saved to `E:\claude\{slug}.html`, images in `E:\claude\img\{slug}\`

---

## 6. The Upload Script (PowerShell)

Each batch has its own upload script e.g. `upload-detail27-sites.ps1`.

**Batch folder structure on GitHub Pages:**
- HTML: `{batch}/{slug}.html` → e.g. `detail27/spotless-detail-nc.html`
- Images: `{batch}/img/{slug}/{slug}_hero.jpg` etc.
- Live URL: `https://thinktosharewebsites.github.io/w/{batch}/{slug}.html`

**PUT function (standard pattern):**
```powershell
function Put-File([string]$path,[string]$b64) {
  $uri = "https://api.github.com/repos/$REPO/contents/$path"
  for ($t=0; $t -lt 3; $t++) {
    try {
      $sha = $null
      try { $sha = (Invoke-RestMethod -Uri $uri -Headers $headers -Method Get -EA Stop).sha } catch {}
      $body = @{ message="add $path"; content=$b64; branch=$BRANCH }
      if ($sha) { $body.sha = $sha }
      Invoke-RestMethod -Uri $uri -Headers $headers -Method Put -ContentType 'application/json' -Body ($body|ConvertTo-Json -Compress) -EA Stop | Out-Null
      return $true
    } catch { if ($t -lt 2) { Start-Sleep 3 } }
  }
  return $false
}
```

**After each successful upload:** POST to Sheets webhook + append to CSV.

**Batch naming convention:**
- Auto Detailing: `detail27`, `detail28`, ...
- Lawn & Landscaping: `landscaping12`, ...
- Pressure Washing: `pw11`, ...
- Mobile Dog Grooming: `grooming4`, ...
- Cake Maker: `cake13`, ...
- Mobile Nail Tech: `nails1`, `nails2`, ...
- Lash Extension Artist: `lash1`, `lash2`, ...
- Pool Cleaning: `pool1`, `pool2`, ...
- Window Cleaning: `window1`, `window2`, ...
- Charcuterie Boards: `charcuterie1`, ...

---

## 7. The 10 Templates

Every template follows the same structural pattern: self-contained HTML, separate JPG images referenced via relative paths, WIC-compressed images, JS dedup with `_d{}` + `data-key`.

### Template 1 — Auto Detailing
- **Style name:** `detail`
- **Sample file:** `E:\claude\801shine-utah.html`
- **Live sample:** `https://thinktosharewebsites.github.io/w/801shine-utah.html`
- **Colors:** Navy `#0A1628`, Blue `#1565C0`, Amber `#F59E0B`, light bg `#F0F4FF`
- **Image slots (14):** hero, svc1, svc2, svc3, svc4, split1, gal1, gal2, gal3, gal4, gal5, gal6, split2, about (+ pp for hero card)
- **Sections:** Header → Hero → Trust Bar → Services (4) → Before/After Split → Gallery (6) → Stats → About → Reviews → CTA → Footer → FAB

### Template 2 — Lawn & Landscaping
- **Style name:** `landscaping`
- **Sample file:** `E:\claude\browns-lawn-landscaping.html`
- **Live sample:** `https://thinktosharewebsites.github.io/w/browns-lawn-landscaping.html`
- **Colors:** Dark green `#1B4332`, Gold `#C9A96E`, light bg `#F0FFF4`
- **Image slots (9):** hero, svc1, svc2, gal1, gal2, gal3, split1, split2, about (+ pp)
- **Sections:** Header → Hero → Trust Bar → Services (2) → Before/After Sliders → Gallery (3) → Stats → Split Feature → About → Reviews → CTA → Footer → FAB

### Template 3 — Pressure Washing
- **Style name:** `pw`
- **Sample file:** `E:\claude\jetwash-nation.html`
- **Live sample:** `https://thinktosharewebsites.github.io/w/jetwash-nation.html`
- **Colors:** Blue `#1E40AF`, Sky `#0EA5E9`, White, corner float button
- **Image slots (15 approx):** hero, svc1–4, gal1–6, split1–2, about (+ pp)
- **Sections:** Header → Hero → Trust Bar → Services (4) → Gallery → Before/After → Stats → About → Reviews → CTA → Footer → FAB + corner float button

### Template 4 — Mobile Dog Grooming
- **Style name:** `grooming`
- **Sample file:** `E:\claude\rays-mobile-dog-grooming.html`
- **Live sample:** `https://thinktosharewebsites.github.io/w/rays-mobile-dog-grooming.html`
- **Colors:** Coral `#E8705A`, Warm orange `#F59E0B`, Cream `#FFF8F0`
- **Image slots (9):** hero, svc1, svc2, svc3, gal1, gal2, gal3, split1, about (+ pp)
- **Sections:** Header → Hero → Trust Bar → Services (3) → How It Works → Gallery (3) → Stats → About → Reviews → CTA → Footer → FAB

### Template 5 — Cake Maker / Baker (PREMIUM v2)
- **Style name:** `cake`
- **Sample file:** `E:\claude\custom-cakes-by-flour.html`
- **Live sample:** `https://thinktosharewebsites.github.io/w/cake-by-savz.html`
- **Colors:** Rose `#BE185D`, Warm cream `#FFF8F0`, Gold `#D97706`
- **Sections (13):** Header → Hero → Trust Bar → Menu/Shop Grid → How It Works → Gallery → Flavours → Stats → Baker Bio → Reviews → Events CTA → Footer → FAB
- **Note:** Premium v2 includes animated hero, menu with pricing, shop section, baker origin story

### Template 6 — Mobile Nail Tech
- **Style name:** `nails1`
- **Sample file:** `E:\claude\luxe-nails-to-you.html`
- **Live sample:** `https://thinktosharewebsites.github.io/w/luxe-nails-to-you.html`
- **Colors:** Deep rose `#9B3557`, Dark rose `#7A2442`, Gold `#C4A35A`, Blush `#FBF0F4`
- **Image slots (10):** hero_bg, svc1–4, gal1–4, about (+ pp for hero card)
- **Sections (12):** Header → Hero ("Salon-Quality Nails. At Your Door.") → Trust Bar → Services (4) → How It Works (3 steps) → Gallery (4) → Stats → About → Reviews → CTA → Footer → FAB
- **Trust signals:** Licensed & Insured | Certified Nail Tech | Sterile Tools Every Client | I Come To You

### Template 7 — Lash Extension Artist
- **Style name:** `lash1`
- **Sample file:** `E:\claude\lashes-by-luna.html`
- **Live sample:** `https://thinktosharewebsites.github.io/w/lashes-by-luna.html`
- **Colors:** Dark `#0D0A0B`, Charcoal `#1C1719`, Gold `#C9A96E`, Rose gold `#B5896B`, Cream `#FDF8F3`
- **Image slots (10):** hero_bg, svc1–4, gal1–4, about (+ pp)
- **Sections (12):** Header → Hero ("Wake Up to Beautiful Lashes.") → Trust Bar → Services (Classic/Hybrid/Volume/Lash Lift) → How It Works → Gallery → Stats → About → Reviews → CTA → Footer → FAB
- **Trust signals:** Certified & Insured | Premium Silk & Mink | Medical-Grade Adhesive | Patch Test Available

### Template 8 — Pool Cleaning Service
- **Style name:** `pool1`
- **Sample file:** `E:\claude\clearwave-pool-service.html`
- **Live sample:** `https://thinktosharewebsites.github.io/w/clearwave-pool-service.html`
- **Colors:** Blue `#0077B6`, Dark blue `#023E8A`, Teal `#0096C7`, Sky `#90E0EF`, Gold `#F7B731`
- **Image slots (10):** hero_bg, svc1–4, gal1–4, about (+ pp)
- **Sections (12):** Header → Hero ("Crystal Clear Pools, Every Single Week.") → Trust Bar → Services (Weekly/Chemical/Equipment/Seasonal) → How It Works → Gallery → Stats → About → Reviews → CTA → Footer → FAB
- **Key messaging:** No contracts, cancel anytime; weekly reports with photos; family-safe chemicals

### Template 9 — Window Cleaning
- **Style name:** `window1`
- **Sample file:** `E:\claude\sparkline-window-cleaning.html`
- **Live sample:** `https://thinktosharewebsites.github.io/w/sparkline-window-cleaning.html`
- **Colors:** Blue `#1565C0`, Dark blue `#0D47A1`, Sky `#1E88E5`, Accent `#29B6F6`, Dark bg `#0A2540`
- **Image slots (10):** hero_bg, svc1–4, gal1–4, about (+ pp)
- **Sections (12):** Header → Hero ("Streak-Free Windows, Inside & Out.") → Trust Bar → Services (Interior/Exterior/Full Home/Commercial) → How It Works → Gallery → Stats → About → Reviews → CTA → Footer → FAB
- **Key messaging:** Streak-free guarantee; purified water system; eco-friendly; same-day sometimes available

### Template 10 — Charcuterie Board Maker
- **Style name:** `charcuterie1`
- **Sample file:** `E:\claude\gather-and-graze.html`
- **Live sample:** `https://thinktosharewebsites.github.io/w/gather-and-graze.html`
- **Colors:** Wine `#722F37`, Dark wine `#5A1E25`, Olive `#6B7645`, Gold `#C9A05A`, Cream `#F5EED9`
- **Image slots (10):** hero_bg, svc1–4 (board types), gal1–4, about (+ pp)
- **Sections (12):** Header (italic logo font) → Hero ("Beautiful Boards for Every Occasion.") → Trust Bar → Boards Menu (Charcuterie/Party Platter/Picnic Set/Wedding) → How It Works → Gallery → Stats → About → Reviews → CTA → Footer → FAB
- **Key messaging:** Made fresh daily; locally sourced; delivered to your door; custom dietary options

---

## 8. Design Language (Universal Rules)

All templates share these structural rules regardless of category:

1. **Zero external requests** — no CDN fonts, no external CSS/JS. Everything inline or self-contained.
2. **Gradients not flat colors** — hero backgrounds always use `linear-gradient`, never a single color.
3. **Dark hero** — hero section always dark bg (near-black or deep brand color) with light text.
4. **Trust bar** — sits directly under hero, 4 trust badges, uses brand color gradient.
5. **Services as image cards** — 4 cards in a grid, each with overlay gradient text at bottom.
6. **Profile pic as hero card** — right column of hero shows `_pp.jpg` in a rounded card with a badge.
7. **Mobile FAB** — fixed bottom bar on mobile with "Book Now" primary + secondary action button.
8. **Sticky header** — dark bg, logo left, nav center (hidden mobile), CTA pill right.
9. **Stats bar** — full-width dark or brand-color section with 4 numbers.
10. **Review cards** — 2 cards, each with avatar initial circle, star rating, quote, service tag.
11. **Responsive** — 2-col hero collapses to 1-col, 4-col grids collapse to 2-col at tablet, 2-col at mobile.

---

## 9. The DM Helper

**Local file:** `E:\claude\outreach-leads.html`  
**Live URL:** `https://thinktosharewebsites.github.io/w/outreach-leads.html`

### Daily update rules
1. **Clean overwrite** — remove ALL `<div class="card">` elements in `#leadsList`. No old entries survive.
2. **Update filter tabs** — only show categories present in the new batch + correct counts.
3. **Keep these permanently — never remove or modify:**
   - `#samplesPanel` div (template sample links)
   - `#agentPanel` div (this guide rendered in the page)
   - The "★ Main Template Samples" tab
   - The "📄 Agent Guide" tab
   - `showSamples()`, `showAgentGuide()`, `setCategory()`, `filterLeads()` JS functions
   - `#copyModal`, `#toast`, `copyMessage()`, `closeModal()` functions
   - All CSS in `<style>`
4. **Upload** after every update using the standard GitHub PUT pattern.

### Card structure
```html
<div class="card" data-category="Auto Detailing" data-name="business name lowercase">
    <textarea class="full-message" style="display:none">[FULL DM MESSAGE]</textarea>
    <div class="card-header">
        <div class="biz-info">
            <div class="biz-name">Business Name</div>
            <a class="biz-url" href="[PAGE URL]" target="_blank">[PAGE URL]</a>
        </div>
        <span class="badge">[CATEGORY]</span>
    </div>
    <div class="actions">
        <a class="btn btn-ig" href="https://www.instagram.com/[handle]/" target="_blank">Send DM</a>
        <button class="btn btn-copy" onclick="copyMessage(this)">Copy Message</button>
    </div>
</div>
```

### How the copy flow works
1. Owner clicks "Copy Message" → message copied to clipboard → modal pops up showing preview
2. Owner clicks "Awesome, Let's Send it!" → Instagram profile opens in new tab
3. Owner pastes and sends

---

## 10. The DM Message

Two things change per lead: **[CATEGORY PHRASE]** and **[PAGE URL]**. Everything else is word for word identical.

```
Hey, are you guys taking on new projects? 

I usually don't do this but I was just doom scrolling and found your [CATEGORY PHRASE] and your work looks 🔥....was surprised though you got no dedicated website ...especially with the kind content you got....so I went straight ahead and created a high converting website for your business so your clients can see your work and book you seamlessly...

[PAGE URL]

If you like it lets get on a call maybe to customise it for your business
```

### Category phrase map

| Category | Phrase |
|----------|--------|
| Auto Detailing | found your auto detailing page |
| Lawn & Landscaping | found your lawn care page |
| Pressure Washing | found your pressure washing page |
| Mobile Dog Grooming | found your dog grooming page |
| Cake Maker | found your cake page |
| Mobile Nail Tech | found your nail tech page |
| Lash Extension Artist | found your lash page |
| Pool Cleaning | found your pool cleaning page |
| Window Cleaning | found your window cleaning page |
| Charcuterie Boards | found your charcuterie page |

---

## 11. Critical Rules (Never Break These)

| Rule | Detail |
|------|--------|
| **Blocklist check** | Every build script must MD5-hash each image and check against `E:\claude\bad_image_blocklist.txt` before using it |
| **Max 6 scroll cycles** | Never exceed 6-7 scrolls in the scraper. 16-22 scrolls captures Instagram's recommended feed (strangers' photos end up in the site) |
| **Real photos vs stock** | Only use scraped photos if they clearly show actual work. Personal photos / flyers / memes → use stock fallback |
| **Hero card = pp.jpg only** | The hero card (right column of hero) MUST use `_pp.jpg` (profile picture). Never use post images there |
| **JPEG magic bytes** | Check `buffer[0] === 0xFF && buffer[1] === 0xD8` before saving any scraped file. Instagram CDN serves JS bundles on image domains |
| **8KB minimum size** | Reject any scraped image under 8KB |
| **Hardcode GitHub token** | Token goes directly in the script. `github_token.txt` does NOT exist |
| **Always read sheets-webhook.md** | Before writing any upload script, confirm the Sheets webhook URL from memory. Never copy from context |
| **Sheets logging is automatic** | Don't wait for user to ask — log to Sheets after every upload, every time |

---

## 12. Sample Sites — Quick Reference

All live on GitHub Pages:

| Category | Business Name | URL |
|----------|---------------|-----|
| Auto Detailing | 801 Shine Utah | `…/801shine-utah.html` |
| Lawn & Landscaping | Brown's Lawn | `…/browns-lawn-landscaping.html` |
| Pressure Washing | Jetwash Nation | `…/jetwash-nation.html` |
| Mobile Dog Grooming | Ray's Mobile Grooming | `…/rays-mobile-dog-grooming.html` |
| Cake Maker | Cake by Savz | `…/cake-by-savz.html` |
| Mobile Nail Tech | Luxe Nails To You | `…/luxe-nails-to-you.html` |
| Lash Extension Artist | Lashes by Luna | `…/lashes-by-luna.html` |
| Pool Cleaning | ClearWave Pool Service | `…/clearwave-pool-service.html` |
| Window Cleaning | Sparkline Window Cleaning | `…/sparkline-window-cleaning.html` |
| Charcuterie Boards | Gather & Graze | `…/gather-and-graze.html` |

Base URL for all: `https://thinktosharewebsites.github.io/w/`

---

## 13. Batch Numbering (Current State as of Aug 2026)

| Category | Last Batch | Next Batch |
|----------|-----------|-----------|
| Auto Detailing | detail26 | detail27 |
| Lawn & Landscaping | landscaping11 | landscaping12 |
| Pressure Washing | pw9 | pw10... (check memory) |
| Mobile Dog Grooming | grooming3 | grooming4 |
| Cake Maker | cake12 | cake13 |
| Mobile Nail Tech | (template only, no batch yet) | nails1 |
| Lash Extension Artist | (template only) | lash1 |
| Pool Cleaning | (template only) | pool1 |
| Window Cleaning | (template only) | window1 |
| Charcuterie Boards | (template only) | charcuterie1 |

---

## 14. Where to Look for More Detail

- **Memory index:** `C:\Users\debor\.claude\projects\e--claude\memory\MEMORY.md`
- **DM helper agent guide (in-page):** Click "📄 Agent Guide" tab at `https://thinktosharewebsites.github.io/w/outreach-leads.html`
- **Template reference table:** `C:\Users\debor\.claude\projects\e--claude\memory\feedback-use-samples-as-reference.md`
- **Per-template details:** Individual memory files e.g. `feedback-nails-template.md`, `feedback-lash-template.md`, etc.
- **Batch history:** Per-batch memory files e.g. `project-detail26-batch-july26.md`
