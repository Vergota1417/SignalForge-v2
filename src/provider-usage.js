import { reserveProviderRequest } from './db.js';

export async function reserveProviderPurpose(env,purpose='general'){
  await reserveProviderRequest(env);
  const now=Date.now(),dayKey=new Date(now).toISOString().slice(0,10),key=sanitizePurpose(purpose);
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS provider_usage_detail(day_key TEXT NOT NULL,purpose TEXT NOT NULL,requests INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL,PRIMARY KEY(day_key,purpose))`).run();
  await env.DB.prepare(`INSERT INTO provider_usage_detail(day_key,purpose,requests,updated_at) VALUES(?,?,1,?) ON CONFLICT(day_key,purpose) DO UPDATE SET requests=requests+1,updated_at=excluded.updated_at`).bind(dayKey,key,now).run();
  return{dayKey,purpose:key};
}

export async function getProviderUsageBreakdown(env,{dayKey=new Date().toISOString().slice(0,10)}={}){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS provider_usage_detail(day_key TEXT NOT NULL,purpose TEXT NOT NULL,requests INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL,PRIMARY KEY(day_key,purpose))`).run();
  const rows=await env.DB.prepare(`SELECT purpose,requests,updated_at AS updatedAt FROM provider_usage_detail WHERE day_key=? ORDER BY requests DESC,purpose`).bind(dayKey).all();
  const byPurpose=Object.fromEntries((rows.results||[]).map(r=>[r.purpose,Number(r.requests)||0]));
  return{dayKey,total:Object.values(byPurpose).reduce((a,b)=>a+b,0),byPurpose,rows:(rows.results||[]).map(r=>({...r,requests:Number(r.requests)||0,updatedAt:Number(r.updatedAt)||0}))};
}

function sanitizePurpose(value){const text=String(value||'general').trim().toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'');return(text||'general').slice(0,48);}
