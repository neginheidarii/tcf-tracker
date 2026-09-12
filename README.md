# TCF Canada Study Tracker

A static web app. No build step, no dependencies, no server. Total size is about 110 KB, and once installed it runs with no connection at all.

## Deploy to Vercel

**Easiest route — drag and drop, no tools needed**

1. Go to **vercel.com/new** and sign in (GitHub, GitLab, or email).
2. Look for the deploy-without-git option, or use **app.netlify.com/drop** which takes a plain folder drag with no account at all.
3. Drag this whole folder onto the page.
4. You get a URL like `tcf-tracker-abc123.vercel.app` in about twenty seconds.

**If you have Node installed**

```bash
cd tcf-pwa
npx vercel          # preview URL
npx vercel --prod   # the real one
```

Answer the prompts with the defaults. When it asks about a build command, leave it blank — there isn't one. Output directory is the current folder.

**If you prefer GitHub**

Push this folder to a repo, then import it at vercel.com/new. Every push redeploys. This is the option to pick if you expect to keep changing things.

No framework preset, no build command, no output directory. Vercel serves the files as they are.

## Install on your phone

**iPhone — must be Safari.** Chrome on iOS cannot install home-screen apps.

1. Open your Vercel URL in Safari.
2. Tap the Share button, the square with the arrow.
3. Scroll down, tap **Add to Home Screen**, then **Add**.

It now opens full screen with no browser chrome, and works in the Underground.

Installing matters for more than appearance. Safari clears stored data for sites you haven't opened in about a week. Home-screen apps are treated as far more durable. You'll be opening it daily, so this is mostly insurance — but take it.

**Android** — open in Chrome, then the menu offers Install app.

**Laptop** — open in Chrome or Edge and click the install icon at the right of the address bar.

## Where your data lives

In your browser's local storage, on that device. Nothing is sent anywhere; there is no account and no server.

That means **your phone and your laptop keep separate records.** Pick one as the real one. Settings → Back up or restore gives you your whole record as a block of text you can copy into a note, and paste back in on the other device or after clearing your browser.

Do a copy once a week. It takes five seconds and it is the only thing standing between you and starting over.

## Making changes

| File | Contains |
| --- | --- |
| `core.js` | Question banks, templates, dates, scheduling logic |
| `app.js` | Everything you see and tap |
| `styles.css` | Colours, spacing, light and dim themes |
| `sw.js` | Offline caching |

Question bank totals and the default Chill / Productive templates are at the top of `core.js`, in plain readable objects.

**One thing to remember:** after editing any file, bump the version in `sw.js`:

```js
const CACHE = "tcf-v2";   // was tcf-v1
```

Without that, installed copies keep serving the old cached version and your change never appears.
