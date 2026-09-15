import {mkdtemp, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {runChild, startCluster} from './postgres-runtime.mjs';
let cluster, directory;
try {
  let url = process.env.GAME_TEST_DATABASE_URL;
  if (url) {
    const parsed = new URL(url);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || parsed.pathname !== '/ashen_test_admin') {
      throw new Error('GAME_TEST_DATABASE_URL must target a dedicated local ashen_test_admin database.');
    }
  } else {
    directory = await mkdtemp(path.join(tmpdir(), 'ashen-postgres-tests-'));
    cluster = await startCluster(directory, {database: 'ashen_test_admin'});
    url = cluster.url;
  }
  const tests = process.argv.slice(2);
  const files = tests.length ? tests : (await readdir(new URL('../test/', import.meta.url))).filter(name => name.endsWith('.test.mjs')).sort().map(name => `test/${name}`);
  process.exitCode = await runChild(['--test', ...files], {GAME_TEST_DATABASE_URL: url, DATABASE_URL: '', NODE_ENV: 'test'});
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
  if (cluster) {
    await cluster.stop();
    await rm(directory, {recursive: true, force: true});
  }
}
