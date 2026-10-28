"""Prepare only the CI checkout: separate simulator IDs, no signing or production ATS change."""
from pathlib import Path
import plistlib
p=Path('ios/MuscleMetric.xcodeproj/project.pbxproj')
p.write_text(p.read_text().replace('com.musclemetric.app', 'com.musclemetric.app.e2e'))
p=Path('ios/MuscleMetric/Info.plist')
with p.open('rb') as f: info=plistlib.load(f)
info.setdefault('NSAppTransportSecurity', {})['NSAllowsLocalNetworking']=True
with p.open('wb') as f: plistlib.dump(info,f)
