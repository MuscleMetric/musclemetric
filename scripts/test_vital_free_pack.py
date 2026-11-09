"""Self-contained tests for the Vital Animations free-pack ZIP importer."""
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

import import_vital_free_pack as importer


class VitalPreviewImporterTests(unittest.TestCase):
    def test_imports_unique_id_matching_sample_without_supabase(self):
        with tempfile.TemporaryDirectory() as tmp:
            destination = Path(tmp) / "assets"
            archive = Path(tmp) / "sample.zip"
            with zipfile.ZipFile(archive, "w") as z:
                z.writestr("free/exercises.json", json.dumps({"exercises": [
                    {"exerciseId": "0051", "name": "Barbell Bench Press", "bodyPart": "chest",
                     "equipment": "barbell", "target": "chest", "instructions": ["Keep feet planted"]}
                ]}))
                z.writestr("free/videos/0051_bench.mp4", b"synthetic-video-not-for-playback")
            with patch.object(importer, "DEST", destination):
                self.assertEqual(importer.run(archive, False, None), 0)
            self.assertEqual((destination / "0051.mp4").read_bytes(), b"synthetic-video-not-for-playback")
            manifest = (destination / "manifest.ts").read_text(encoding="utf-8")
            self.assertIn("Barbell Bench Press", manifest)
            self.assertIn('source: require(\'./0051.mp4\')', manifest)

    def test_ambiguous_video_mapping_does_not_import(self):
        with tempfile.TemporaryDirectory() as tmp:
            destination = Path(tmp) / "assets"
            archive = Path(tmp) / "ambiguous.zip"
            with zipfile.ZipFile(archive, "w") as z:
                z.writestr("exercises.json", json.dumps([
                    {"exerciseId": "0051", "name": "Barbell Bench Press"}
                ]))
                z.writestr("A/0051.mp4", b"first")
                z.writestr("B/0051.mp4", b"second")
            with patch.object(importer, "DEST", destination):
                self.assertEqual(importer.run(archive, False, None), 3)
            self.assertFalse((destination / "manifest.ts").exists())

    def test_inspection_only_writes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            destination = Path(tmp) / "assets"
            archive = Path(tmp) / "sample.zip"
            with zipfile.ZipFile(archive, "w") as z:
                z.writestr("exercises.json", json.dumps([{"exerciseId": "1", "name": "Squat"}]))
                z.writestr("1.mp4", b"fake")
            with patch.object(importer, "DEST", destination):
                self.assertEqual(importer.run(archive, True, None), 0)
            self.assertFalse(destination.exists())


if __name__ == "__main__":
    unittest.main()
