importScripts(
    'https://storage.googleapis.com/workbox-cdn/releases/7.4.1/workbox-sw.js'
);

// This is your Service Worker, you can put any of your custom Service Worker
// code in this file, above the `precacheAndRoute` line.

// When widget is installed/pinned, push initial state.
self.addEventListener('widgetinstall', (event) => {
    event.waitUntil(updateWidget(event));
});

// When widget is shown, update content to ensure it is up-to-date.
self.addEventListener('widgetresume', (event) => {
    event.waitUntil(updateWidget(event));
});

// When the user clicks an element with an associated Action.Execute,
// handle according to the 'verb' in event.action.
self.addEventListener('widgetclick', (event) => {
if (event.action == "updateName") {
    event.waitUntil(updateName(event));
}
});

// When the widget is uninstalled/unpinned, clean up any unnecessary
// periodic sync or widget-related state.
self.addEventListener('widgetuninstall', (event) => {});

const updateWidget = async (event) => {
// The widget definition represents the fields specified in the manifest.
    const widgetDefinition = event.widget.definition;

    // Fetch the template and data defined in the manifest to generate the payload.
    const payload = {
        template: JSON.stringify(await (await fetch(widgetDefinition.msAcTemplate)).json()),
        data: JSON.stringify(await (await fetch(widgetDefinition.data)).json()),
    };

    // Push payload to widget.
    await self.widgets.updateByInstanceId(event.instanceId, payload);
}

const updateName = async (event) => {
    const name = event.data.json().name;

    // The widget definition represents the fields specified in the manifest.
    const widgetDefinition = event.widget.definition;

    // Fetch the template and data defined in the manifest to generate the payload.
    const payload = {
        template: JSON.stringify(await (await fetch(widgetDefinition.msAcTemplate)).json()),
        data: JSON.stringify({name}),
    };

    // Push payload to widget.
    await self.widgets.updateByInstanceId(event.instanceId, payload);
}

workbox.core.skipWaiting();
workbox.core.clientsClaim();
workbox.precaching.cleanupOutdatedCaches();
workbox.precaching.precacheAndRoute(self.__WB_MANIFEST || []);

const { CacheFirst, NetworkFirst } = workbox.strategies;
const { CacheableResponsePlugin } = workbox.cacheableResponse;
const { ExpirationPlugin } = workbox.expiration;

const cacheableResponses = new CacheableResponsePlugin({ statuses: [0, 200] });

// Keep app navigation available when the network is unavailable, including
// client-side routes that are not individual files in the precache manifest.
workbox.routing.registerRoute(
    ({ request }) => request.mode === 'navigate',
    new NetworkFirst({
        cacheName: 'mingle-pages',
        networkTimeoutSeconds: 3,
        plugins: [
            cacheableResponses,
            new ExpirationPlugin({ maxEntries: 10, purgeOnQuotaError: true }),
        ],
    })
);

// Hashed build assets and icons are immutable for a given release, so prefer
// the local copy and refresh it only when a new URL is requested.
workbox.routing.registerRoute(
    ({ request }) => ['script', 'style', 'image', 'font'].includes(request.destination),
    new CacheFirst({
        cacheName: 'mingle-assets',
        plugins: [
            cacheableResponses,
            new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true }),
        ],
    })
);

// Cache safe GET API responses for brief offline continuity. POST requests,
// including LiveKit token creation, are intentionally never cached.
workbox.routing.registerRoute(
    ({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/api/'),
    new NetworkFirst({
        cacheName: 'mingle-api',
        networkTimeoutSeconds: 3,
        plugins: [
            cacheableResponses,
            new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 5, purgeOnQuotaError: true }),
        ],
    })
);