import {localDirectory, runChild, startCluster} from './postgres-runtime.mjs';
try {
  let url = process.env.DATABASE_URL;
  if (!url) {
    if (process.env.NODE_ENV === 'production' || process.env.GAME_STRESS === '1' || process.env.GAME_DATA_DIR) {
      throw new Error('DATABASE_URL is required for production or isolated server runs.');
    }
    const database = await startCluster(localDirectory, {port: Number(process.env.GAME_PG_PORT || 5473)});
    url = database.url;
    console.log(`PostgreSQL ready on 127.0.0.1:${database.port}; legacy JSON is not imported.`);
  }
  process.exitCode = await runChild(['server.mjs'], {DATABASE_URL: url});
} catch (error) { console.error(error.message); process.exitCode = 1; }
