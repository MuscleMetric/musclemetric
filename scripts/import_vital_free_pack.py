#!/usr/bin/env python3
"""Import the Vital Animations FREE ZIP into an ignored, local-only Expo asset folder.

This script never connects to Supabase, modifies workouts, or uploads media.
Run from the repository root:
  python3 scripts/import_vital_free_pack.py path/to/free-pack.zip
  python3 scripts/import_vital_free_pack.py path/to/free-pack.zip --inspect
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "assets" / "vital-preview"
MAX_VIDEO_BYTES = 80 * 1024 * 1024
MAX_TOTAL_BYTES = 250 * 1024 * 1024
MAX_VIDEOS = 8
PREVIEW_IDS = {"0051", "0054", "0057", "0060", "0073", "0074", "0087", "0098"}

def key(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value).lower())

def parse_entries(payload: object) -> list[dict]:
    """Find the JSON array of exercise objects without assuming ZIP layout."""
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict) and "name" in row]
    if isinstance(payload, dict):
        for label in ("exercises", "data", "items", "results"):
            if label in payload:
                found = parse_entries(payload[label])
                if found:
                    return found
        if "name" in payload:
            return [payload]
        # Some exports key exercises by their ids.
        found = [v for v in payload.values() if isinstance(v, dict) and "name" in v]
        if found:
            return found
    return []

def strings(value: object) -> list[str]:
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []

def resolve_video(item: dict, videos: list[zipfile.ZipInfo], overrides: dict) -> zipfile.ZipInfo | None:
    exercise_id = str(item.get("exerciseId") or item.get("id") or "").strip()
    name = str(item.get("name") or "").strip()
    forced = overrides.get(exercise_id)
    if forced:
        for video in videos:
            if video.filename == forced or Path(video.filename).name == forced:
                return video
        raise ValueError("Override for " + exercise_id + " points to nonexistent clip " + str(forced))

    ident, name_key = key(exercise_id), key(name)
    candidates: list[zipfile.ZipInfo] = []
    for video in videos:
        stem = key(Path(video.filename).stem)
        parent = key(Path(video.filename).parent.name)
        if name_key and (stem == name_key or name_key in stem):
            candidates.append(video)
        elif ident and (stem == ident or stem.startswith(ident) or stem.endswith(ident) or parent == ident):
            candidates.append(video)
    # The actual uploaded ZIP contains duplicate 0051 and 0098 videos in
    # Character Samples. Prefer the exercise referenced by Free50 JSON.
    if len(candidates) > 1:
        free50 = [clip for clip in candidates if "/Free50/Free50/" in clip.filename]
        return free50[0] if len(free50) == 1 else None
    return candidates[0] if len(candidates) == 1 else None

def inspect_pack(zf: zipfile.ZipFile) -> tuple[list[dict], list[zipfile.ZipInfo]]:
    files = [entry for entry in zf.infolist() if not entry.is_dir()]
    video_files = [entry for entry in files if Path(entry.filename).suffix.lower() == ".mp4"]
    metadata_options: list[tuple[int, list[dict], str]] = []
    for entry in files:
        if Path(entry.filename).suffix.lower() != ".json" or entry.file_size > 10 * 1024 * 1024:
            continue
        try:
            rows = parse_entries(json.loads(zf.read(entry)))
        except (UnicodeError, ValueError, json.JSONDecodeError):
            continue
        if rows:
            metadata_options.append((len(rows), rows, entry.filename))
    metadata_options.sort(key=lambda row: row[0], reverse=True)
    rows = metadata_options[0][1] if metadata_options else []
    print("ZIP:", len(files), "files,", len(video_files), "MP4s,", len(rows), "exercise metadata records")
    print("JSON source:", metadata_options[0][2] if metadata_options else "NOT FOUND")
    print("Example files:")
    for entry in files[:12]:
        print(" ", entry.filename, "(" + str(entry.file_size) + " bytes)")
    if rows:
        print("Example exercise fields:", ", ".join(sorted(rows[0].keys())))
    return rows, video_files

def run(archive: Path, inspect_only: bool, mapping: Path | None) -> int:
    if not archive.is_file():
        raise FileNotFoundError(str(archive))
    overrides = {}
    if mapping:
        overrides = json.loads(mapping.read_text(encoding="utf-8"))
        if not isinstance(overrides, dict):
            raise ValueError("Mapping JSON must be an exerciseId -> filename object.")

    with zipfile.ZipFile(archive) as zf:
        rows, videos = inspect_pack(zf)
        if inspect_only:
            return 0
        if not rows:
            print("No exercise metadata JSON found. Use --inspect and review the ZIP first.", file=sys.stderr)
            return 2

        DEST.mkdir(parents=True, exist_ok=True)
        exported: list[str] = []
        bytes_written = 0
        used_names: set[str] = set()
        for item in rows:
            if str(item.get("exerciseId") or item.get("id") or "") not in PREVIEW_IDS:
                continue
            if len(exported) >= MAX_VIDEOS:
                break
            video = resolve_video(item, videos, overrides)
            if video is None:
                continue
            if video.file_size > MAX_VIDEO_BYTES or bytes_written + video.file_size > MAX_TOTAL_BYTES:
                print("Skipped oversized clip:", video.filename)
                continue
            exercise_id = str(item.get("exerciseId") or item.get("id") or key(item.get("name")))[:40]
            asset_name = re.sub(r"[^a-zA-Z0-9_-]", "-", exercise_id).strip("-") + ".mp4"
            if not asset_name or asset_name in used_names:
                continue
            used_names.add(asset_name)
            destination = DEST / asset_name
            with zf.open(video) as reader, destination.open("wb") as writer:
                shutil.copyfileobj(reader, writer, 1024 * 1024)
            bytes_written += video.file_size
            metadata = {
                "exerciseId": exercise_id,
                "name": str(item.get("name") or "").strip(),
                "bodyPart": str(item.get("bodyPart") or "Unknown"),
                "equipment": str(item.get("equipment") or "Unknown"),
                "target": str(item.get("target") or "Unknown"),
                "secondaryMuscles": strings(item.get("secondaryMuscles")),
                "difficulty": str(item.get("difficulty") or "unknown"),
                "category": str(item.get("category") or "strength"),
                "description": strings(item.get("description")),
                "instructions": strings(item.get("instructions")),
            }
            if exercise_id == "0057":
                metadata["qualityNote"] = (
                    "Potential incorrect animation: appears to show bench press, "
                    "but metadata says barbell hip thrust. Not production-approved."
                )
            exported.append("  { ..."+json.dumps(metadata, ensure_ascii=False)+", source: require('./"+asset_name+"') },")
            print("Imported:", metadata["name"], "<-", video.filename)

    if not exported:
        print("No clips matched uniquely. Pass --mapping overrides.json for filenames; no manifest overwritten.", file=sys.stderr)
        return 3
    manifest = (
        'import type { VitalPreviewAnimation } from "@/features/vitalPreview/types";\n'
        "// Generated from locally licensed free-pack media; do not commit with excluded MP4s.\n"
        "export const PREVIEW_ANIMATIONS: VitalPreviewAnimation[] = [\n"
        + "\n".join(exported) + "\n];\n"
    )
    (DEST / "manifest.ts").write_text(manifest, encoding="utf-8")
    print("\nWrote", len(exported), "local clips to", DEST)
    print("Reminder: do not push raw licensed videos into the public GitHub repository.")
    return 0

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--inspect", action="store_true", help="Only inspect metadata and file structure")
    parser.add_argument("--mapping", type=Path, help="Optional JSON exerciseId-to-MP4 filename mapping")
    args = parser.parse_args()
    try:
        sys.exit(run(args.archive, args.inspect, args.mapping))
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        print("Import failed:", error, file=sys.stderr)
        sys.exit(2)
