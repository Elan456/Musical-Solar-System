"""
Profile backend startup and compute latency across several scenarios,
capturing per-phase timings (physics, music, JSON serialization) and
response sizes. Results are printed and appended to profiling_runs.csv.

Run from repo root:
    python profile_backend_loading.py
"""

from __future__ import annotations

import csv
import gzip
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, List, Optional

BACKEND_HOST = "127.0.0.1"
BACKEND_PORT = 8000
BASE_URL = f"http://{BACKEND_HOST}:{BACKEND_PORT}"
APP_IMPORT_PATH = "backend.main:app"
DEFAULT_DT = 0.05
ITERATIONS_PER_SCENARIO = 6  # first = cold, remaining warm


@dataclass
class Scenario:
    name: str
    planet_count: int
    duration_sec: float


SCENARIOS: List[Scenario] = [
    Scenario(name="baseline_10_planets", planet_count=10, duration_sec=20.0),
    Scenario(name="dense_18_planets", planet_count=18, duration_sec=60.0),
]


CSV_FIELDS = [
    "timestamp",
    "scenario",
    "iteration",
    "run_kind",
    "spawn_backend_process_ms",
    "wait_for_server_ready_ms",
    "post_compute_ms",
    "decode_response_json_ms",
    "server_samples_ms",
    "server_events_ms",
    "server_serialize_ms",
    "payload_bytes",
    "payload_gzip_bytes",
    "dt_sec",
    "duration_sec",
    "planet_count",
]


def _ms(start: float) -> float:
    return (time.perf_counter() - start) * 1000.0


def _percentile(values: List[float], pct: float) -> float:
    if not values:
        return 0.0
    values_sorted = sorted(values)
    k = (len(values_sorted) - 1) * pct / 100.0
    lower = int(k)
    upper = min(lower + 1, len(values_sorted) - 1)
    if lower == upper:
        return values_sorted[lower]
    fraction = k - lower
    return values_sorted[lower] + (values_sorted[upper] - values_sorted[lower]) * fraction


def _planet_payload(count: int, duration_sec: float, dt_sec: float) -> Dict[str, object]:
    planets: List[Dict[str, object]] = []
    for idx in range(count):
        planets.append(
            {
                "name": f"Planet-{idx + 1}",
                "kind": "gas" if idx >= count // 2 else "rocky",
                "aAU": 0.35 + idx * 0.18,
                "mass": 0.05 + idx * 0.08,
                "color": "#88c0d0" if idx % 2 == 0 else "#e9967a",
                "radius": 3.0 + idx * 0.4,
            }
        )

    return {
        "star": {"massMs": 1.0},
        "planets": planets,
        "durationSec": duration_sec,
        "dtSec": dt_sec,
        "trajectoryOnly": False,
        "eventsOnly": False,
        "profile": True,
    }


def start_backend() -> subprocess.Popen:
    cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        APP_IMPORT_PATH,
        "--host",
        BACKEND_HOST,
        "--port",
        str(BACKEND_PORT),
    ]
    return subprocess.Popen(cmd)


def wait_for_backend(
    backend_proc: subprocess.Popen, timeout_sec: float = 20.0, poll_interval: float = 0.25
) -> float:
    """Return time (ms) spent waiting for the backend to answer."""
    url = f"{BASE_URL}/openapi.json"
    start = time.perf_counter()

    while time.perf_counter() - start < timeout_sec:
        if backend_proc.poll() is not None:
            raise RuntimeError(
                f"Backend process exited early with code {backend_proc.returncode}"
            )
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if resp.status == 200:
                    return _ms(start)
        except (urllib.error.URLError, ConnectionRefusedError):
            time.sleep(poll_interval)
            continue
    raise RuntimeError("Backend did not become ready in time")


def post_compute(payload: Dict[str, object]) -> Dict[str, object]:
    """Return detailed timings and sizes for one /api/compute call."""
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}/api/compute",
        data=data,
        headers={"Content-Type": "application/json"},
    )

    start = time.perf_counter()
    with urllib.request.urlopen(req, timeout=300) as resp:
        body = resp.read()
    request_ms = _ms(start)

    decode_start = time.perf_counter()
    decoded = json.loads(body)
    decode_ms = _ms(decode_start)

    profile_meta = decoded.get("meta", {}).get("profile", {})
    server_timings = profile_meta.get("timingsMs", {})
    payload_gzip_bytes = profile_meta.get("payloadGzipBytes")
    if payload_gzip_bytes is None:
        payload_gzip_bytes = len(gzip.compress(body))
    return {
        "post_compute_ms": request_ms,
        "decode_response_json_ms": decode_ms,
        "server_samples_ms": server_timings.get("samples_for_system"),
        "server_events_ms": server_timings.get("events_for_system"),
        "server_serialize_ms": server_timings.get("serialize_response_json"),
        "payload_bytes": profile_meta.get("payloadBytes", len(body)),
        "payload_gzip_bytes": payload_gzip_bytes,
    }


def _write_trace(rows: List[Dict[str, object]]) -> None:
    with open("profiling_runs.csv", "a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        if f.tell() == 0:
            writer.writeheader()
        for row in rows:
            writer.writerow(row)


def _summary_line(values: List[float]) -> str:
    if not values:
        return "min=0.0 p50=0.0 p95=0.0 max=0.0"
    return (
        f"min={min(values):.1f} ms "
        f"p50={_percentile(values, 50):.1f} ms "
        f"p95={_percentile(values, 95):.1f} ms "
        f"max={max(values):.1f} ms"
    )


def main() -> None:
    run_timestamp = datetime.now(timezone.utc).isoformat()
    backend_proc: Optional[subprocess.Popen] = None
    spawn_ms = 0.0
    ready_ms = 0.0
    all_rows: List[Dict[str, object]] = []

    try:
        spawn_start = time.perf_counter()
        backend_proc = start_backend()
        spawn_ms = _ms(spawn_start)

        ready_ms = wait_for_backend(backend_proc)

        for scenario in SCENARIOS:
            payload = _planet_payload(
                scenario.planet_count, scenario.duration_sec, DEFAULT_DT
            )
            scenario_rows: List[Dict[str, object]] = []

            for iteration in range(ITERATIONS_PER_SCENARIO):
                compute_result = post_compute(payload)
                is_first_request = len(all_rows) == 0
                row = {
                    "timestamp": run_timestamp,
                    "scenario": scenario.name,
                    "iteration": iteration,
                    "run_kind": "cold" if is_first_request else "warm",
                    "spawn_backend_process_ms": spawn_ms if is_first_request else 0.0,
                    "wait_for_server_ready_ms": ready_ms if is_first_request else 0.0,
                    "post_compute_ms": compute_result["post_compute_ms"],
                    "decode_response_json_ms": compute_result["decode_response_json_ms"],
                    "server_samples_ms": compute_result["server_samples_ms"],
                    "server_events_ms": compute_result["server_events_ms"],
                    "server_serialize_ms": compute_result["server_serialize_ms"],
                    "payload_bytes": compute_result["payload_bytes"],
                    "payload_gzip_bytes": compute_result["payload_gzip_bytes"],
                    "dt_sec": DEFAULT_DT,
                    "duration_sec": scenario.duration_sec,
                    "planet_count": scenario.planet_count,
                }
                scenario_rows.append(row)
                all_rows.append(row)

            print(f"\nScenario: {scenario.name} ({scenario.planet_count} planets, "
                  f"{scenario.duration_sec}s, dt={DEFAULT_DT})")
            cold = [r for r in scenario_rows if r["run_kind"] == "cold"]
            warm = [r for r in scenario_rows if r["run_kind"] == "warm"]

            for label, runs in [("Cold start", cold), ("Warm", warm)]:
                if not runs:
                    continue
                req_times = [r["post_compute_ms"] for r in runs]
                decode_times = [r["decode_response_json_ms"] for r in runs]
                physics = [
                    r["server_samples_ms"]
                    for r in runs
                    if r["server_samples_ms"] is not None
                ]
                music = [
                    r["server_events_ms"]
                    for r in runs
                    if r["server_events_ms"] is not None
                ]
                serialize = [
                    r["server_serialize_ms"]
                    for r in runs
                    if r["server_serialize_ms"] is not None
                ]
                sizes = [r["payload_bytes"] for r in runs if r["payload_bytes"] is not None]
                gzip_sizes = [
                    r["payload_gzip_bytes"]
                    for r in runs
                    if r["payload_gzip_bytes"] is not None
                ]

                print(f"- {label} request: {_summary_line(req_times)}")
                print(f"- {label} decode: {_summary_line(decode_times)}")
                print(f"- {label} physics samples: {_summary_line(physics)}")
                print(f"- {label} music events: {_summary_line(music)}")
                print(f"- {label} serialize json: {_summary_line(serialize)}")
                if sizes:
                    print(
                        f"- {label} payload size: "
                        f"avg={sum(sizes)/len(sizes):.0f}B "
                        f"gzip_avg={(sum(gzip_sizes)/len(gzip_sizes)) if gzip_sizes else 0:.0f}B"
                    )

        _write_trace(all_rows)
    finally:
        if backend_proc is not None:
            backend_proc.terminate()
            try:
                backend_proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                backend_proc.kill()

    print("\nPer-run traces appended to profiling_runs.csv")


if __name__ == "__main__":
    main()
