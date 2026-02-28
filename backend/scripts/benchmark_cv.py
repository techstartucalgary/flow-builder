#!/usr/bin/env python3
"""
Benchmark the deterministic CV pipeline against a small curated sample set.

This is a regression harness, not a ground-truth evaluator. It records
wall/opening counts and key debug counters and checks them against broad
guardrail ranges from ``backend/data/cv_benchmark_manifest.json``.

Usage:
    .venv/bin/python scripts/benchmark_cv.py
    .venv/bin/python scripts/benchmark_cv.py --manifest data/cv_benchmark_manifest.json
    .venv/bin/python scripts/benchmark_cv.py --json
"""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.vision.cv import pipeline


DEFAULT_MANIFEST = PROJECT_ROOT / "data" / "cv_benchmark_manifest.json"


@dataclass
class RangeExpectation:
    minimum: int | None
    maximum: int | None

    @classmethod
    def from_payload(cls, payload: dict[str, Any] | None) -> "RangeExpectation":
        payload = payload or {}
        return cls(payload.get("min"), payload.get("max"))

    def contains(self, value: int) -> bool:
        if self.minimum is not None and value < self.minimum:
            return False
        if self.maximum is not None and value > self.maximum:
            return False
        return True


def _guess_mime(path: Path, fallback: str = "application/octet-stream") -> str:
    mime, _ = mimetypes.guess_type(path.name)
    return mime or fallback


def _load_annotation_preview_bytes(path: Path) -> tuple[bytes, str]:
    payload = json.loads(path.read_text())
    document = payload.get("document") if isinstance(payload.get("document"), dict) else payload
    source_url = document.get("baseImage", {}).get("sourceUrl")
    if not isinstance(source_url, str) or not source_url.startswith("data:image/"):
        raise ValueError(f"Annotation preview missing data:image source: {path}")
    header, encoded = source_url.split(",", 1)
    mime = header.split(";")[0].split(":", 1)[1]
    return base64.b64decode(encoded), mime


def _resolve_source_path(raw_path: str) -> Path:
    path = Path(raw_path)
    if path.is_absolute():
        return path
    return (PROJECT_ROOT.parent / raw_path).resolve()


def _load_source(source: dict[str, Any]) -> tuple[bytes, str, int]:
    kind = source.get("kind")
    if kind == "file":
        file_path = _resolve_source_path(source["path"])
        return file_path.read_bytes(), source.get("mime") or _guess_mime(file_path), max(0, int(source.get("page_number", 1)) - 1)
    if kind == "annotation_preview":
        file_path = _resolve_source_path(source["path"])
        file_bytes, mime = _load_annotation_preview_bytes(file_path)
        return file_bytes, mime, 0
    raise ValueError(f"Unsupported source kind: {kind}")


def _range_status(expected: RangeExpectation, actual: int) -> tuple[bool, str]:
    ok = expected.contains(actual)
    if ok:
        return True, "ok"
    return False, f"expected {expected.minimum if expected.minimum is not None else '-inf'}..{expected.maximum if expected.maximum is not None else '+inf'}"


def run_manifest(manifest_path: Path) -> dict[str, Any]:
    manifest = json.loads(manifest_path.read_text())
    results: list[dict[str, Any]] = []

    for sample in manifest.get("samples", []):
        file_bytes, mime, page_number = _load_source(sample["source"])
        result = pipeline.run(
            file_bytes,
            mime,
            page_number=page_number,
        )

        actual = {
            "walls": len(result.walls),
            "doors": sum(1 for opening in result.openings if opening.tag_class == "door"),
            "windows": sum(1 for opening in result.openings if opening.tag_class == "window"),
        }

        expectations = {
            key: RangeExpectation.from_payload(sample.get("expected", {}).get(key))
            for key in ("walls", "doors", "windows")
        }
        checks: dict[str, dict[str, Any]] = {}
        sample_ok = True
        for key, expected in expectations.items():
            ok, detail = _range_status(expected, actual[key])
            checks[key] = {"ok": ok, "detail": detail}
            sample_ok = sample_ok and ok

        results.append(
            {
                "id": sample["id"],
                "label": sample["label"],
                "ok": sample_ok,
                "actual": actual,
                "checks": checks,
                "known_failure_modes": sample.get("known_failure_modes", []),
                "debug": result.debug.model_dump(),
            }
        )

    summary = {
        "manifest": str(manifest_path),
        "sample_count": len(results),
        "passing_samples": sum(1 for row in results if row["ok"]),
        "failing_samples": sum(1 for row in results if not row["ok"]),
        "results": results,
    }
    return summary


def _print_human(summary: dict[str, Any]) -> None:
    print(f"Manifest: {summary['manifest']}")
    print(
        f"Samples: {summary['sample_count']}  "
        f"passing: {summary['passing_samples']}  "
        f"failing: {summary['failing_samples']}"
    )
    print("")
    for row in summary["results"]:
        status = "PASS" if row["ok"] else "FAIL"
        actual = row["actual"]
        debug = row["debug"]
        print(f"[{status}] {row['id']} — {row['label']}")
        print(
            f"  walls={actual['walls']} doors={actual['doors']} windows={actual['windows']}"
        )
        print(
            "  debug:"
            f" candidates_raw={debug['opening_candidates_raw']}"
            f" verified={debug['opening_candidates_verified']}"
            f" rejected={debug['opening_candidates_rejected']}"
            f" solid_wall_rejections={debug['solid_wall_projection_rejections']}"
        )
        failed_checks = [f"{key} ({value['detail']})" for key, value in row["checks"].items() if not value["ok"]]
        if failed_checks:
            print(f"  guardrail failures: {', '.join(failed_checks)}")
        failure_modes = row.get("known_failure_modes") or []
        if failure_modes:
            print(f"  known failure modes: {', '.join(failure_modes)}")
        print("")


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark the FlowBuildr CV pipeline against a curated sample set.")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST, help="Path to benchmark manifest JSON")
    parser.add_argument("--json", action="store_true", help="Emit JSON summary instead of human-readable output")
    args = parser.parse_args()

    summary = run_manifest(args.manifest.resolve())
    if args.json:
        print(json.dumps(summary, indent=2))
    else:
        _print_human(summary)

    return 0 if summary["failing_samples"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
