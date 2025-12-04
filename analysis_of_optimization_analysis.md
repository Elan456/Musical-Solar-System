# Analysis of Optimization Analysis

## Status of recommended optimizations
- Planet stat caching (min/max radius, ordering, eccentricity) is implemented via a single `generate_planet_stats()` pass before both event generators `backend/music/planet_stats.py:27-55`, removing duplicate work noted in the doc.
- Debug file I/O is now guarded by `MUSIC_DEBUG` in `backend/music/events.py:31-35`, so production runs avoid the `orbit_events.json` write.
- Velocity envelopes use a single-pass sampler `_collect_velocity_samples()` and are downsampled to ~5 Hz in `backend/music/velocity_pads.py:9-82` and `backend/music/utils.py:31-51`, cutting both compute and payload size.
- Shared planet sorting/orders are computed once when building stats (`backend/music/planet_stats.py:34-47`) and reused by orbit and pad events.
- The payload format was refactored to metadata + compact position arrays (`backend/physics.py:88-156` and `backend/main.py:82-107`), with frontend types aligned to the slimmer shape (`frontend/src/types.ts:39-69`).
- Music code was modularized (`backend/music/` package) and request flags `trajectoryOnly/eventsOnly` landed in `backend/main.py:34-107`.

## Not implemented or still open
- Gravity remains O(n²) pairwise in `backend/system.py:44-85`; no spatial culling or approximation is applied yet.
- Velocity envelopes are downsampled but not keyframed (inflection-point extraction), so the envelope build is still per-sample before thinning.
- No transport compression (gzip/brotli) is configured on FastAPI responses, so payload wins rely solely on the new shape.

## Recommendations to further cut load time
- Add `GZipMiddleware` (or brotli via `CompressionMiddleware`) to FastAPI to shrink the remaining JSON (metadata + events), especially noticeable for long runs with dense pad envelopes.
- Apply keyframe extraction on velocity envelopes before downsampling to skip flat stretches entirely (keep first/last + extrema), trimming both compute and bytes.
- Cache compute outputs for identical presets (duration, dt, bodies) in-memory for the session to skip repeat physics/music runs when users toggle views.
- If large-planet systems are a target, prototype a Barnes–Hut or distance-threshold approximation in `backend/system.py` behind a flag; even a coarse cutoff at >5–10 AU can halve force calculations on sprawling systems.
- Consider moving the `/api/compute` work onto a background thread/worker to avoid event-loop stalls and to allow pre-warming common presets at startup.
