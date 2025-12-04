# Optimization Profiling

With more than 5 planets simulation loading times get too long. 
We need to preapre a profiling script to see where the bottlenecks are what's introducing the most latency or overhead
Write a profiling script that starts the backend and simulates loading a system with 10 planets, measuring the time taken for each step of the loading process.

## Profiling results
Backend profiling (10 planets):
- spawn_backend_process: 0.2 ms
- wait_for_server_ready: 519.9 ms
- post_compute_10_planets: 140.9 ms
- decode_response_json: 7.1 ms

## Next steps / profiler enhancements
- Capture per-phase timings inside the backend: wrap `samples_for_system`, `events_for_system`, and JSON serialization separately so we know whether physics or music dominates.
- Run a denser profile by increasing duration (`durationSec` to 60s) and planet count (e.g., 15–20) to see scaling effects; keep `dtSec` fixed to compare against current results.
- Add repeated runs (5–10 iterations) and report min/p50/p95 to smooth out variance; include warm vs cold start splits.
- Record payload sizes (response bytes) and gzip-compressed size to estimate network savings; can log `len(body)` and `len(gzip.compress(body))`.
- Emit traces to a CSV/JSON file (e.g., `profiling_runs.csv`) with timestamps so we can chart load times over commits.


## Improved Profiling Results

Scenario: baseline_10_planets (10 planets, 20.0s, dt=0.05)
- Cold start request: min=157.8 ms p50=157.8 ms p95=157.8 ms max=157.8 ms
- Cold start decode: min=4.6 ms p50=4.6 ms p95=4.6 ms max=4.6 ms
- Cold start physics samples: min=120.2 ms p50=120.2 ms p95=120.2 ms max=120.2 ms
- Cold start music events: min=8.5 ms p50=8.5 ms p95=8.5 ms max=8.5 ms
- Cold start serialize json: min=6.6 ms p50=6.6 ms p95=6.6 ms max=6.6 ms
- Cold start payload size: avg=224833B gzip_avg=92665B
- Warm request: min=148.7 ms p50=149.7 ms p95=150.9 ms max=150.9 ms
- Warm decode: min=3.8 ms p50=3.8 ms p95=3.9 ms max=3.9 ms
- Warm physics samples: min=114.5 ms p50=115.1 ms p95=116.3 ms max=116.5 ms
- Warm music events: min=8.2 ms p50=8.2 ms p95=8.5 ms max=8.5 ms
- Warm serialize json: min=6.2 ms p50=6.4 ms p95=6.5 ms max=6.5 ms
- Warm payload size: avg=224836B gzip_avg=92667B
INFO:     127.0.0.1:37368 - "POST /api/compute HTTP/1.1" 200 OK
INFO:     127.0.0.1:37376 - "POST /api/compute HTTP/1.1" 200 OK
INFO:     127.0.0.1:37388 - "POST /api/compute HTTP/1.1" 200 OK
INFO:     127.0.0.1:37390 - "POST /api/compute HTTP/1.1" 200 OK
INFO:     127.0.0.1:37396 - "POST /api/compute HTTP/1.1" 200 OK
INFO:     127.0.0.1:37412 - "POST /api/compute HTTP/1.1" 200 OK

Scenario: dense_18_planets (18 planets, 60.0s, dt=0.05)
- Warm request: min=582.7 ms p50=622.1 ms p95=637.4 ms max=641.2 ms
- Warm decode: min=19.0 ms p50=21.3 ms p95=24.4 ms max=24.7 ms
- Warm physics samples: min=414.4 ms p50=440.7 ms p95=459.9 ms max=463.2 ms
- Warm music events: min=46.4 ms p50=49.6 ms p95=60.5 ms max=62.8 ms
- Warm serialize json: min=29.9 ms p50=31.7 ms p95=36.3 ms max=37.5 ms
- Warm payload size: avg=1085422B gzip_avg=461903B
INFO:     Shutting down
INFO:     Waiting for application shutdown.
INFO:     Application shutdown complete.
INFO:     Finished server process [327548]

Per-run traces appended to profiling_runs.csv

## Detailed next steps to implement (for another LLM)
1) **Deep-profile physics hot path**
   - Use `python -m cProfile -o physics.prof backend/physics.py` with a small harness that calls `samples_for_system` for the dense scenario (18 planets, 60s, dt=0.05) or run `py-spy record --rate 500 -- python profile_backend_loading.py` and filter for `System.sample_positions` and `_compute_gravity` in `backend/system.py`.
   - Identify whether quadtree insertion/query, per-step allocations, or integration dominates. Add lightweight timers around `_compute_gravity` and `body.integrate` to confirm distribution.
   - Optimize: reduce per-step allocations (reuse numpy arrays), precompute arrays of masses/positions, and ensure quadtree queries avoid Python list churn. Add a fast path to skip pairwise work when bodies are beyond `CULL_DISTANCE_AU`.

2) **Reduce sampling volume**
   - In `backend/physics.py` (`samples_for_system` and `System.sample_positions`), add an optional downsampling parameter (e.g., `max_samples` or `display_sample_rate_hz`) so long durations do not materialize every step.
   - Keep physics at current dt for accuracy but emit fewer returned samples (e.g., store every Nth step based on duration or a target max sample count such as 2000). Ensure metadata ordering stays consistent.
   - Add a request-level flag to allow the frontend/profiler to request downsampled output while keeping music generation fed by full-resolution samples.

3) **Speed up serialization**
   - Switch FastAPI JSON handling to `orjson` by installing `orjson` and configuring `FastAPI(json_loads=orjson.loads, json_dumps=orjson.dumps)` in `backend/main.py`, or wrap responses with `ORJSONResponse`.
   - Avoid double encoding in the profile path: serialize once and reuse the bytes for timing and the returned `Response`. Keep the profiling metadata (`payloadBytes`, `payloadGzipBytes`) intact.

4) **Enable gzip compression**
   - Add Starlette’s `GZipMiddleware` in `backend/main.py` with a sensible minimum size (e.g., 1024 bytes) so large responses (~1 MB) are automatically compressed.
   - Update profiling to record compressed sizes from the server’s gzip (verify header) and note any throughput wins.

5) **Trim payload size**
   - Remove unused fields from the returned samples/events (e.g., omit per-body metadata that never changes after `planetMetadata` is sent). Ensure only x/y positions are returned unless z is required.
   - Consider a “metadata once” mode: keep `planetMetadata` as-is but avoid repeating static fields in every sample. If needed, add a flag to include/exclude optional metadata.

6) **Music events micro-optimizations**
   - Profile `backend/music` functions (`generate_planet_stats`, `planet_orbit_events`, `velocity_pad_events`) with cProfile to confirm they stay small under 18+ planets.
   - Cache per-planet invariants (eccentricity, period) to avoid recomputation inside per-sample loops.

7) **Re-run and record**
   - After each change, run `python profile_backend_loading.py` (or `poetry run python profile_backend_loading.py`) to capture cold/warm p50/p95 for both scenarios and append to `profiling_runs.csv`.
   - Compare deltas for `samples_for_system`, `events_for_system`, serialize, and payload sizes; note regressions directly in `instructions.md`.
