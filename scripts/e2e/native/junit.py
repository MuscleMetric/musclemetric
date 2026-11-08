"""Fail closed on missing, malformed, empty, skipped or failing Maestro results."""
import sys
import xml.etree.ElementTree as ET

def check(path):
    root = ET.parse(path).getroot()
    cases = list(root.iter('testcase'))
    if not cases:
        raise ValueError('Maestro returned no test cases')
    for case in cases:
        for tag in ('failure', 'error', 'skipped'):
            entry = case.find(tag)
            if entry is not None:
                raise ValueError(f'{case.get("name")}: {tag}: {entry.get("message", "")} {entry.text or ""}')
        if case.get('status', '').upper() in ('FAILED', 'FAILURE', 'ERROR', 'SKIPPED'):
            raise ValueError(f'{case.get("name")}: {case.get("status")}')
    return len(cases)

if __name__ == '__main__':
    try:
        print(f'{check(sys.argv[1])} native flow(s) passed')
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
