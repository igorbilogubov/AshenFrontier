#!/usr/bin/env python3
"""Snapshot the atomic hero save; keep 14 daily copies on this host."""
import datetime
import json
import os
from pathlib import Path

os.umask(0o077)
root = Path('/opt/ashen-frontier')
source = root / 'data/heroes.json'
if source.exists():
    payload = source.read_bytes()
    json.loads(payload)
    backups = root / 'backups'
    backups.mkdir(mode=0o700, exist_ok=True)
    date = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d')
    target = backups / f'heroes-{date}.json'
    temporary = target.with_suffix('.tmp')
    temporary.write_bytes(payload)
    temporary.replace(target)
    for old in sorted(backups.glob('heroes-????-??-??.json'))[:-14]:
        old.unlink()
