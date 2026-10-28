"""Bound a native CLI and its descendants, including children ignoring SIGTERM."""
import os
import signal
import subprocess
import sys


def run(seconds, argv):
    child = subprocess.Popen(argv, start_new_session=True)

    def kill_group():
        try:
            os.killpg(child.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass

    def cancelled(signum, frame):
        kill_group()
        child.wait()
        raise SystemExit(128 + signum)

    signal.signal(signal.SIGTERM, cancelled)
    signal.signal(signal.SIGINT, cancelled)
    try:
        return child.wait(timeout=seconds)
    except subprocess.TimeoutExpired:
        print(f'Native command exceeded {seconds:g}s; terminating process group', file=sys.stderr, flush=True)
        kill_group()
        child.wait()
        return 124
    finally:
        kill_group()


if __name__ == '__main__':
    raise SystemExit(run(float(sys.argv[1]), sys.argv[2:]))
