const DEFAULT_QUARANTINE_MS=7*86_400_000;

export async function quarantineDiscoverySymbol(env,symbol,{now=Date.now(),cooldownMs=DEFAULT_QUARANTINE_MS,reason='provider-error'}={}){
  const safe=sanitizeSymbol(symbol);if(!safe||!env?.DB)return null;
  const until=now+Math.max(60_000,Number(cooldownMs)||DEFAULT_QUARANTINE_MS);
  await env.DB.prepare(`INSERT INTO discovery_stats(symbol,cooldown_until,updated_at) VALUES(?,?,?) ON CONFLICT(symbol) DO UPDATE SET cooldown_until=MAX(discovery_stats.cooldown_until,excluded.cooldown_until),updated_at=excluded.updated_at`).bind(safe,until,now).run();
  return{symbol:safe,reason,cooldownUntil:until};
}

export function isPermanentProviderSymbolError(error){const status=Number(error?.status)||0,message=String(error?.message||'').toLowerCase();return status===404||message.includes('symbol not found')||message.includes('invalid symbol');}

function sanitizeSymbol(v){const s=String(v||'').trim().toUpperCase();return/^[A-Z]{1,5}(?:\.[A-Z])?$/.test(s)?s:'';}
