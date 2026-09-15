# Production PostgreSQL backups

The host script `deploy/backup-postgres.py` runs `pg_dump` inside the database
container through the `ashen-frontier` Compose project. It reads the private
`/opt/ashen-frontier/ops/database.env` file only through Docker Compose; it does
not put a password in its command arguments or output. PostgreSQL connects over
the container's local socket as the `postgres` role.

Run it as root on the intended game host after confirming the live Compose
project, database service, and `/opt/ashen-frontier/current` release:

```sh
python3 /opt/ashen-frontier/current/deploy/backup-postgres.py
```

The script creates a new custom-format file in `/opt/ashen-frontier/backups/`
with mode 0600, flushes it to disk, and checks that `pg_restore --list` can read
the archive. It never overwrites or deletes completed backups. A nonblocking
lock prevents overlapping cron runs; a failed dump or archive check removes
its partial file and exits nonzero. The listing check does not prove that the
data can be restored.

After a successful manual dump and full restore test, confirm the host timezone
is UTC (`timedatectl`) and schedule a daily run at 03:35 UTC in
`/etc/cron.d/ashen-frontier-postgres-backup`:

```cron
35 3 * * * root /bin/sh -c 'umask 077; /usr/bin/python3 /opt/ashen-frontier/current/deploy/backup-postgres.py >> /opt/ashen-frontier/ops/postgres-backup.log 2>&1'
```

Keep the log private, rotate it separately, and monitor cron failures and
remaining disk space. This host-local backup is not disaster recovery if the
whole VPS or its disk is lost. The older JSON-only backup cron does not protect
PostgreSQL and should be retired after this schedule is verified.

For a full restore test, use a **separate temporary PostgreSQL 18 database**, not
the active `ashen_frontier` database. Create it in a disposable database service
or cluster, pass one completed `.dump` to `pg_restore --no-owner --no-acl`, and
compare hero counts, item counts, identities, and revisions with a consistent
source snapshot. Destroy only that temporary test database after verification.
Never place a dump, env file, guest key, or restore log containing hero data in Git.
