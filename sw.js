// Network first, cache as the fallback for when Wi-Fi drops. Every song linked from
// the two playlists is cached up front by crawling them, so no list here needs a new
// entry when a song is added. media/ is left out (large, and mostly not deployed).
const CACHE = "karaoke";
const SHELL = [
    "./", "index.html", "christmas.html", "tabs/song.html", "manifest.webmanifest", "icons/apple-touch-icon.png",
    "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png",
    "pure.css", "grids-responsive.css", "font-awesome.css", "style.css", "favicon.ico",
    "scripts/song.js", "scripts/timeline.js", "scripts/autoscroll.js", "scripts/fitscreen.js", "scripts/device.js", "scripts/enableToggleChords.js",
];
const TIMEOUT_MS = 3000;   // weak Wi-Fi hangs rather than failing; don't wait on it longer than this

async function precache() {
    const urls = new Set(SHELL);
    for (const page of ["index.html", "christmas.html"]) {
        try {
            const html = await (await fetch(page, { cache: "no-cache" })).text();
            for (const [, href] of html.matchAll(/href="\.\/(tabs\/[^"]+)"/g)) {
                const song = /^tabs\/song\.html\?s=([\w-]+)/.exec(href);
                urls.add(song ? `tabs/${song[1]}.cho` : href);
            }
        } catch { /* offline: cache what the shell list gives */ }
    }
    const cache = await caches.open(CACHE);
    await Promise.allSettled([...urls].map((u) => cache.add(new Request(u, { cache: "no-cache" }))));
}

self.addEventListener("install", (event) => {
    self.skipWaiting();
    event.waitUntil(precache());
});

self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
    const req = event.request;
    const url = new URL(req.url);
    if (req.method !== "GET" || url.origin !== location.origin || url.pathname.includes("/media/")) return;
    // Opening the index online re-crawls, so a song added since install gets cached too.
    if (req.mode === "navigate" && /\/(index\.html)?$/.test(url.pathname)) event.waitUntil(precache());

    const network = fetch(req).then(async (res) => {
        if (res.ok) await (await caches.open(CACHE)).put(req, res.clone());
        return res;
    });
    event.waitUntil(network.catch(() => {}));
    event.respondWith((async () => {
        const timeout = new Promise((resolve) => setTimeout(resolve, TIMEOUT_MS));
        const first = await Promise.race([network.catch(() => null), timeout]);
        // ignoreSearch: song.html?s=X&p=... must match the cached song.html.
        return first || (await caches.match(req, { ignoreSearch: true })) || network;
    })());
});
