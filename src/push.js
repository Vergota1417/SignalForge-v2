import { sendNotification } from 'web-push-neo';
import { deletePushSubscription, listPushSubscriptions } from './db.js';

const DEFAULT_PUSH_STATUSES = new Set(['SETUP — READY SOON','BUY NOW','SELL / EXIT']);

export function pushConfigured(env) {return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);}
export function shouldPushStatus(env, status) {const raw=String(env.PUSH_ALERT_STATUSES||'').trim();const allowed=raw ? new Set(raw.split('|').map(s=>s.trim()).filter(Boolean)) : DEFAULT_PUSH_STATUSES;return allowed.has(status);}

export async function broadcastSignalPush(env, analysis, previousStatus, occurredAt=Date.now()) {
  if(!pushConfigured(env) || !shouldPushStatus(env, analysis?.status)) return {sent:0,failed:0,removed:0,skipped:true};
  return broadcast(env,buildSignalPayload(analysis,previousStatus,occurredAt),topicFor(analysis),900);
}

export async function broadcastPortfolioStrategyPush(env,{symbol,strategy,previousState,occurredAt=Date.now()}) {
  if(!pushConfigured(env) || !symbol || !strategy?.state) return {sent:0,failed:0,removed:0,skipped:true};
  const important=new Set(['PROTECT PROFIT','REDUCE','SELL / EXIT']);
  if(!important.has(strategy.state)) return {sent:0,failed:0,removed:0,skipped:true};
  const price=Number(strategy.price)||0,gainPct=Number(strategy.gainPct)||0,floor=Number(strategy.protection?.protectedPrice)||0;
  const floorText=floor>0?` · floor $${floor.toFixed(2)}`:'';
  const payload={kind:'portfolio-strategy-change',title:`${symbol} · ${strategy.state}`,body:`$${price.toFixed(2)} · P/L ${gainPct>=0?'+':''}${(gainPct*100).toFixed(1)}%${floorText}\n${strategy.reason}`,symbol,status:strategy.state,previousStatus:previousState||null,price,gainPct,protectedPrice:floor||null,reason:strategy.reason,url:`/?symbol=${encodeURIComponent(symbol)}`,occurredAt:new Date(occurredAt).toISOString()};
  return broadcast(env,payload,`portfolio-${symbol}-${strategy.state}`,1800);
}

export async function broadcastWeeklyOpportunityPush(env,{weekKey,row,occurredAt=Date.now()}) {
  const symbol=row?.symbol,strategy=row?.strategy;if(!pushConfigured(env)||!symbol||!strategy)return {sent:0,failed:0,removed:0,skipped:true};
  if(!['BUY WINDOW','BUY CANDIDATE'].includes(strategy.state))return {sent:0,failed:0,removed:0,skipped:true};
  const price=Number(strategy.price)||0,rr=Number(strategy.rr)||0,score=Number(strategy.opportunityScore)||0;
  const payload={kind:'weekly-opportunity',title:`Weekly #1 · ${symbol} · ${strategy.state}`,body:`Opportunity ${score}/100 · ${rr.toFixed(2)}:1 R/R · $${price.toFixed(2)}\n${strategy.reason}`,symbol,status:strategy.state,price,score,rr,weekKey:weekKey||null,reason:strategy.reason,url:`/?symbol=${encodeURIComponent(symbol)}`,occurredAt:new Date(occurredAt).toISOString()};
  return broadcast(env,payload,`weekly-${weekKey||'research'}-${symbol}`,21_600);
}

export async function broadcastBackgroundSummaryPush(env,{dayLabel='Today',top=null,research=null,weekend=false,occurredAt=Date.now()}={}) {
  if(!pushConfigured(env)) return {sent:0,failed:0,removed:0,skipped:true};
  const symbol=String(top?.symbol||'').toUpperCase();
  const bucket=String(top?.bucket||top?.status||'NO ACTIONABLE SETUP');
  const score=Number(top?.screenScore);
  const researched=Number(research?.researchCount)||0;
  const lastRunCount=Array.isArray(research?.lastRun?.researched)?research.lastRun.researched.length:0;
  const quotaUsed=Number(research?.budget?.used)||0;
  const quotaMax=Number(research?.budget?.max)||0;
  const candidate=symbol?`${symbol} · ${bucket}${Number.isFinite(score)?` · score ${score.toFixed(1)}`:''}`:'No promoted candidate cleared the current filters.';
  const work=weekend?`${lastRunCount} historical review${lastRunCount===1?'':'s'} completed · ${researched} symbols researched total`:`${researched} symbols have historical confirmation`;
  const quota=quotaMax>0?` · API ${quotaUsed}/${quotaMax}`:'';
  const payload={kind:'background-summary',title:`SignalForge · ${dayLabel} background update`,body:`${candidate}\n${work}${quota}`,symbol:symbol||null,status:bucket,url:symbol?`/?symbol=${encodeURIComponent(symbol)}`:'/',occurredAt:new Date(occurredAt).toISOString()};
  const dayKey=new Date(occurredAt).toISOString().slice(0,10).replace(/-/g,'');
  return broadcast(env,payload,`summary-${dayKey}`,43_200,'normal');
}

export async function sendTestPush(env, subscription) {
  if(!pushConfigured(env)) throw new Error('Push notifications are not configured yet.');
  const payload=JSON.stringify({kind:'push-test',title:'SignalForge Test Alert',body:'Push notifications are working on this device.',url:'/',status:'TEST',occurredAt:new Date().toISOString()});
  try{await sendNotification(subscription,payload,{vapidDetails:vapid(env),TTL:120,urgency:'high',topic:'signalforge-test'});return {sent:true};}
  catch(error){const statusCode=Number(error?.statusCode||error?.status||0);if(statusCode===404||statusCode===410)await deletePushSubscription(env,subscription?.endpoint||'');const wrapped=new Error(error?.message||'Push test failed.');wrapped.statusCode=statusCode;throw wrapped;}
}

async function broadcast(env,payload,topic,ttl,urgency='high') {
  const subscriptions=await listPushSubscriptions(env);if(!subscriptions.length)return {sent:0,failed:0,removed:0,skipped:true};
  const body=JSON.stringify(payload),vapidDetails=vapid(env);let sent=0,failed=0,removed=0;
  await Promise.all(subscriptions.map(async row=>{try{await sendNotification(row.subscription,body,{vapidDetails,TTL:ttl,urgency,topic:sanitizeTopic(topic)});sent++;}catch(error){failed++;const statusCode=Number(error?.statusCode||error?.status||0);if(statusCode===404||statusCode===410){await deletePushSubscription(env,row.endpoint);removed++;}console.error(JSON.stringify({event:'push_delivery_error',statusCode,message:error?.message||String(error)}));}}));
  return {sent,failed,removed,skipped:false};
}
function vapid(env){return {subject:env.VAPID_SUBJECT,publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY};}
function buildSignalPayload(analysis,previousStatus,occurredAt){const price=Number(analysis?.latest?.close)||0,readiness=Number(analysis?.readiness)||0;return {kind:'signal-status-change',title:`${analysis.symbol} · ${analysis.status}`,body:`$${price.toFixed(2)} · ${readiness}% readiness\n${analysis.reason}`,symbol:analysis.symbol,status:analysis.status,previousStatus:previousStatus||null,readiness,price,reason:analysis.reason,url:`/?symbol=${encodeURIComponent(analysis.symbol)}`,occurredAt:new Date(occurredAt).toISOString()};}
function topicFor(analysis){return `${analysis?.symbol||'SF'}-${analysis?.status||'alert'}`;}
function sanitizeTopic(value){const base=String(value||'signalforge-alert').replace(/[^A-Za-z0-9_-]/g,'').slice(0,32);return base||'signalforge-alert';}
