"""Invisible process launcher — pythonw.exe (GUI subsystem, zero console)
Usage: pythonw.exe _launch.pyw <target> [args...]
Spawns target with CREATE_NO_WINDOW | DETACHED_PROCESS."""
import subprocess, sys, os

if len(sys.argv) < 2:
    sys.exit(1)

CREATE_NO_WINDOW = 0x08000000
DETACHED_PROCESS = 0x00000008
CREATE_BREAKAWAY_FROM_JOB = 0x01000000

target = sys.argv[1]
args = sys.argv[2:] if len(sys.argv) > 2 else []

subprocess.Popen(
    [target] + args,
    creationflags=CREATE_NO_WINDOW | DETACHED_PROCESS | CREATE_BREAKAWAY_FROM_JOB,
    stdin=subprocess.DEVNULL,
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
    close_fds=True,
)
