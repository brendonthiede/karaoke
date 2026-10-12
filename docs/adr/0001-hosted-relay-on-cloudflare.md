---
status: accepted
date: 2026-10-11
---

# Sync relay is a Cloudflare Worker, not part of the static site

The site is a dependency-free static page served from GitHub Pages, and the
band already opens it there. Autoscroll needs one device to publish its clock to
the others, which a static host cannot do, and an HTTPS page cannot reach a
plain-HTTP server on the projector laptop because browsers block mixed content.
We decided to run a small Cloudflare Worker with a Durable Object, kept in this
repo under `relay/`, as the only non-browser code in the project. It is the one
place the "no dependencies, no build" rule is bent, and it is bent there so the
pages themselves stay plain.

## Considered options

- **Serve the whole site from the laptop over the LAN on Sundays**, with an SSE
  relay in `serve.py`. No third party and no internet needed, but the band would
  learn a second URL, and church guest Wi-Fi often blocks device-to-device
  traffic. Kept as a documented fallback.
- **Firebase Realtime Database or a public pub/sub service.** Nothing to deploy,
  but a vendor script or a vendor's rate limits in the critical path on a Sunday
  morning, for a problem that is a hundred lines of code.
- **WebRTC between devices.** Still needs a hosted signalling service, so it has
  the relay's dependency with more moving parts.

## Consequences

- The room needs internet. The design compensates: the leader never waits on
  the relay, followers keep running on their last state and prefetch every chart
  in the playlist when they join.
- Deploying needs a Cloudflare account and `wrangler`, a dev-time tool like the
  Python converters. The address is a `*.workers.dev` hostname held in
  `scripts/sync.js`; a custom hostname would need the DNS zone moved from Porkbun.
- The relay knows nothing about songs. All intelligence stays in the pages, so
  swapping the relay for the LAN fallback changes `sync.js` and nothing else.
