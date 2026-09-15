// Local development/test PostgreSQL only. Never adopts or changes an existing cluster.
import {access, chmod, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const localDirectory = path.join(root, 'data', 'postgres-local');
const marker = 'ashen-postgres-v1';
const exists = async file => access(file).then(() => true, () => false);

export async function runProgram(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {stdio: ['ignore', 'pipe', 'pipe'], ...options});
    let output = '';
    child.stdout?.on('data', chunk => { output += chunk; });
    child.stderr?.on('data', chunk => { output += chunk; });
    child.once('error', () => reject(new Error(`${path.basename(command)} is unavailable. Install PostgreSQL or set PG_BIN.`)));
    child.once('exit', code => resolve({code, output}));
  });
}

export async function postgresBinary(name) {
  if (process.env.PG_BIN) return path.join(process.env.PG_BIN, name);
  const candidates = [name, `/usr/local/bin/${name}`, `/opt/homebrew/bin/${name}`];
  for (const version of [18, 17, 16, 15, 14]) {
    candidates.push(`/opt/homebrew/opt/postgresql@${version}/bin/${name}`, `/usr/local/opt/postgresql@${version}/bin/${name}`);
  }
  for (const command of candidates) {
    try { if ((await runProgram(command, ['--version'])).code === 0) return command; } catch {}
  }
  throw new Error(`PostgreSQL ${name} not found. Install PostgreSQL or set PG_BIN to its bin directory.`);
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

function connectionUrl(config, database = config.database) {
  const url = new URL(`postgresql://127.0.0.1:${config.port}/${database}`);
  url.username = config.user; url.password = config.password;
  return url.href;
}

async function readConfig(directory) {
  const config = JSON.parse(await readFile(path.join(directory, 'connection.json'), 'utf8'));
  if (config.kind !== marker || !Number.isInteger(config.port) || config.port < 1024 || config.port > 65535 ||
      config.user !== 'ashen_local' || !/^[a-f0-9]{48}$/.test(config.password) ||
      !['ashen_frontier', 'ashen_test_admin', 'ashen_stress'].includes(config.database)) {
    throw new Error('Invalid Ashen Frontier local PostgreSQL metadata; refusing to adopt this cluster.');
  }
  return config;
}

export async function startCluster(directory, {database = 'ashen_frontier', port} = {}) {
  const pgCtl = await postgresBinary('pg_ctl');
  const cluster = path.join(directory, 'cluster');
  const configFile = path.join(directory, 'connection.json');
  await mkdir(directory, {recursive: true, mode: 0o700});
  await chmod(directory, 0o700);
  if (!(await exists(configFile))) {
    if (await exists(cluster)) throw new Error('Unrecognized PostgreSQL directory; refusing to initialize over existing data.');
    const config = {kind: marker, user: 'ashen_local', password: randomBytes(24).toString('hex'), port: port || await freePort(), database};
    await writeFile(configFile, JSON.stringify(config), {mode: 0o600, flag: 'wx'});
  }
  const config = await readConfig(directory);
  if (config.database !== database) throw new Error('Local PostgreSQL database purpose mismatch.');
  if (!(await exists(path.join(cluster, 'PG_VERSION')))) {
    if (await exists(cluster)) throw new Error('Incomplete PostgreSQL initialization; inspect the local directory before retrying.');
    const passwordFile = path.join(directory, '.init-password');
    await writeFile(passwordFile, config.password, {mode: 0o600, flag: 'wx'});
    try {
      const result = await runProgram(await postgresBinary('initdb'), ['-D', cluster, '-U', config.user, '--auth=scram-sha-256', '--encoding=UTF8', '--no-locale', '--data-checksums', `--pwfile=${passwordFile}`]);
      if (result.code !== 0) throw new Error('PostgreSQL initialization failed; verify installed binaries and directory ownership.');
    } finally { await rm(passwordFile, {force: true}); }
    await writeFile(path.join(cluster, 'postgresql.auto.conf'),
      `listen_addresses = '127.0.0.1'\nport = ${config.port}\nunix_socket_directories = ''\nmax_connections = 40\nshared_buffers = '32MB'\nwork_mem = '2MB'\nmax_wal_size = '256MB'\n`, {mode: 0o600});
  }
  if ((await runProgram(pgCtl, ['-D', cluster, 'status'])).code !== 0) {
    const result = await runProgram(pgCtl, ['-D', cluster, '-l', path.join(directory, 'postgres.log'), '-w', '-t', '15', 'start']);
    if (result.code !== 0) throw new Error(`Could not start local PostgreSQL. See ${path.join(directory, 'postgres.log')}; another service may own its port.`);
  }
  const client = new pg.Client({connectionString: connectionUrl(config, 'postgres'), connectionTimeoutMillis: 3000});
  try {
    await client.connect();
    const result = await client.query('SELECT 1 FROM pg_database WHERE datname=$1', [database]);
    if (!result.rowCount) await client.query(`CREATE DATABASE "${database}"`);
  } catch { throw new Error('Local PostgreSQL could not initialize the game database.'); }
  finally { await client.end(); }
  return {url: connectionUrl(config), port: config.port, stop: () => stopCluster(directory)};
}

export async function stopCluster(directory) {
  await readConfig(directory); // Only stop a cluster this tool created.
  const result = await runProgram(await postgresBinary('pg_ctl'), ['-D', path.join(directory, 'cluster'), '-m', 'fast', '-w', '-t', '15', 'stop']);
  if (result.code !== 0) {
    const state = await runProgram(await postgresBinary('pg_ctl'), ['-D', path.join(directory, 'cluster'), 'status']);
    if (state.code === 0) throw new Error('Local PostgreSQL did not stop.');
  }
}

export async function localDatabaseUrl() { return connectionUrl(await readConfig(localDirectory)); }

export async function runChild(args, env) {
  const child = spawn(process.execPath, args, {cwd: root, stdio: 'inherit', env: {...process.env, ...env}});
  const forward = signal => child.kill(signal);
  const interrupt = () => forward('SIGINT'), terminate = () => forward('SIGTERM');
  process.on('SIGINT', interrupt); process.on('SIGTERM', terminate);
  try {
    return await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0))); });
  } finally { process.off('SIGINT', interrupt); process.off('SIGTERM', terminate); }
}
