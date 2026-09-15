import {localDirectory, startCluster, stopCluster} from './postgres-runtime.mjs';
try {
  const action = process.argv[2] || 'start';
  if (action === 'start') {
    const database = await startCluster(localDirectory, {port: Number(process.env.GAME_PG_PORT || 5473)});
    console.log(`Local PostgreSQL ready on 127.0.0.1:${database.port}. Credentials stay in data/postgres-local/.`);
  } else if (action === 'stop') {
    await stopCluster(localDirectory); console.log('Local PostgreSQL stopped.');
  } else throw new Error('Use start or stop.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
