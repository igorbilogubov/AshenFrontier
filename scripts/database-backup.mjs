import {chmod, mkdir, open, rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {localDatabaseUrl, postgresBinary, root} from './postgres-runtime.mjs';
let file, destination, succeeded = false;
try {
  const url = new URL(process.env.DATABASE_URL || await localDatabaseUrl());
  if (!['postgresql:', 'postgres:'].includes(url.protocol)) throw new Error('Expected PostgreSQL DATABASE_URL.');
  destination = path.resolve(process.argv[2] || path.join(root, 'backups', `postgres-${new Date().toISOString().replaceAll(':', '-')}.dump`));
  await mkdir(path.dirname(destination), {recursive: true, mode: 0o700});
  file = await open(destination, 'wx', 0o600);
  const command = process.env.PG_DUMP || await postgresBinary('pg_dump');
  const result = await new Promise((resolve, reject) => {
    const child = spawn(command, ['--format=custom', '--no-owner', '--no-acl'], {
      stdio: ['ignore', file.fd, 'pipe'],
      env: {...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
        PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
        PGSSLMODE: url.searchParams.get('sslmode') || process.env.PGSSLMODE || 'prefer'},
    });
    // Connection errors may contain usernames/hosts; never forward raw credential diagnostics.
    child.stderr.resume(); child.once('error', reject); child.once('exit', resolve);
  });
  if (result !== 0) throw new Error('PostgreSQL backup failed; verify connection and pg_dump major version.');
  await file.sync(); await chmod(destination, 0o600); succeeded = true;
  console.log(`PostgreSQL backup saved: ${destination}`);
} catch { console.error('Backup failed; no existing backup was overwritten. Check PostgreSQL connection and pg_dump version.'); process.exitCode = 1; }
finally { if (file) { await file.close(); if (!succeeded) await rm(destination, {force: true}); } }
