#!/usr/bin/env python3
"""Create and check a private PostgreSQL dump from the production Compose database."""

import datetime
import fcntl
import os
from pathlib import Path
import subprocess
import sys


ROOT = Path('/opt/ashen-frontier')
BACKUPS = ROOT / 'backups'
COMPOSE = ROOT / 'current/deploy/compose.yaml'
ENV_FILE = ROOT / 'ops/database.env'


def compose_command(*args):
    return ['docker', 'compose', '--env-file', str(ENV_FILE), '-f', str(COMPOSE),
            'exec', '-T', 'database', *args]


def run_backup():
    os.umask(0o077)
    BACKUPS.mkdir(mode=0o700, parents=True, exist_ok=True)
    BACKUPS.chmod(0o700)
    with (BACKUPS / '.postgres-backup.lock').open('a+b') as lock:
        os.fchmod(lock.fileno(), 0o600)
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RuntimeError('Another PostgreSQL backup is running') from error

        timestamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        destination = BACKUPS / f'postgres-{timestamp}.dump'
        created = False
        try:
            with destination.open('xb') as dump:
                created = True
                os.fchmod(dump.fileno(), 0o600)
                result = subprocess.run(compose_command(
                    'pg_dump', '--username', 'postgres', '--dbname', 'ashen_frontier',
                    '--format', 'custom', '--no-owner', '--no-acl'),
                    stdout=dump, stderr=subprocess.DEVNULL, check=False)
                if result.returncode != 0:
                    raise RuntimeError('pg_dump failed')
                dump.flush()
                os.fsync(dump.fileno())

            if destination.stat().st_size == 0:
                raise RuntimeError('pg_dump produced an empty file')
            with destination.open('rb') as dump:
                result = subprocess.run(compose_command('pg_restore', '--list'),
                                        stdin=dump, stdout=subprocess.DEVNULL,
                                        stderr=subprocess.DEVNULL, check=False)
                if result.returncode != 0:
                    raise RuntimeError('pg_restore could not read the dump archive')
            return destination
        except BaseException:
            if created:
                destination.unlink(missing_ok=True)
            raise


if __name__ == '__main__':
    try:
        saved = run_backup()
    except Exception as error:
        # Docker diagnostics can include connection details; never print subprocess output.
        print(f'PostgreSQL backup failed: {error}', file=sys.stderr)
        sys.exit(1)
    print(f'PostgreSQL backup verified: {saved}')
