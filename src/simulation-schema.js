export async function ensureSimulationCohortColumns(env){
  await addColumnIfMissing(env,'paper_positions','model_version',`TEXT NOT NULL DEFAULT 'LEGACY/UNKNOWN'`);
  await addColumnIfMissing(env,'paper_trades','model_version',`TEXT NOT NULL DEFAULT 'LEGACY/UNKNOWN'`);
}

async function addColumnIfMissing(env,table,column,definition){
  const info=await env.DB.prepare(`PRAGMA table_info(${table})`).all();
  if((info.results||[]).some(row=>String(row.name)===column))return false;
  await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  return true;
}
