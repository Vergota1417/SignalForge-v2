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
  const reason=String(strategy.reason||'Portfolio strategy state changed.');
  const payload={kind:'portfolio-strategy-change',title:`${symbol} · ${strategy.state}`,body:`${previousState?`${previousState} → `:''}${strategy.state}\n$${price.toFixed(2)} · P/L ${gainPct>=0?'+':''}${(gainPct*100).toFixed(1)}%${floorText}\n${reason}`,symbol,status:strategy.state,previousStatus:previousState||null,price,gainPct,protectedPrice:floor||null,reason,url:buildAlertUrl({symbol,status:strategy.state,previousStatus:previousState,reason,occurredAt,kind:'portfolio-strategy-change'}),occurredAt:new Date(occurredAt).toISOString()};
  return broadcast(env,payload,`portfolio-${symbol}-${strategy.state}`,1800);
}

export async function broadcastWeeklyOpportunityPush(env,{weekKey,row,occurredAt=Date.now()}) {
  const symbol=row?.symbol,strategy=row?.strategy;if(!pushConfigured(env)||!symbol||!strategy)return {sent:0,failed:0,removed:0,skipped:true};
  if(!['BUY WINDOW','BUY CANDIDATE'].includes(strategy.state))return {sent:0,failed:0,removed:0,skipped:true};
  const price=Number(strategy.price)||0,rr=Number(strategy.rr)||0,score=Number(strategy.opportunityScore)||0,reason=String(strategy.reason||'Weekly opportunity changed.');
  const payload={kind:'weekly-opportunity',title:`Weekly #1 · ${symbol} · ${strategy.state}`,body:`Opportunity ${score}/100 · ${rr.toFixed(2)}:1 R/R · $${price.toFixed(2)}\n${reason}`,symbol,status:strategy.state,price,score,rr,weekKey:weekKey||null,reason,url:buildAlertUrl({symbol,status:strategy.state,reason,occurredAt,kind:'weekly-opportunity'}),occurredAt:new Date(occurredAt).toISOString()};
  return broadcast(env,payload,`weekly-${weekKey||'research'}-${symbol}`,21_600);
}

export async function broadcastBackgroundSummaryPush(env,{dayLabel='Today',top=null,research=null,weekend=false,occurredAt=Date.now()}={}) {
  if(!pushConfigured(env)) return {sent:0,failed:0,removed:0,skipped:true};
  const symbol=String(top?.symbol||'').toUpperCase(),bucket=String(top?.bucket||top?.status||'NO ACTIONABLE SETUP'),score=Number(top?.screenScore),researched=Number(research?.researchCount)||0,lastRunCount=Array.isArray(research?.lastRun?.researched)?research.lastRun.researched.length:0,quotaUsed=Number(research?.budget?.used)||0,quotaMax=Number(research?.budget?.max)||0;
  const candidate=symbol?`${symbol} · ${bucket}${Number.isFinite(score)?` · score ${score.toFixed(1)}`:''}`:'No promoted candidate cleared the current filters.';
  const work=weekend?`${lastRunCount} historical review${lastRunCount===1?'':'s'} completed · ${researched} symbols researched total`:`${researched} symbols have historical confirmation`;
  const quota=quotaMax>0?` · API ${quotaUsed}/${quotaMax}`:'',reason=`${candidate}. ${work}${quota}`;
  const payload={kind:'background-summary',title:`SignalForge · ${dayLabel} background update`,body:`${candidate}\n${work}${quota}`,symbol:symbol||null,status:bucket,reason,url:buildAlertUrl({symbol:symbol||null,status:bucket,reason,occurredAt,kind:'background-summary'}),occurredAt:new Date(occurredAt).toISOString()};
  const dayKey=new Date(occurredAt).toISOString().slice(0,10).replace(/-/g,'');
  return broadcast(env,payload,`summary-${dayKey}`,43_200,'normal');
}

export async function sendTestPush(env, subscription) {
  if(!pushConfigured(env)) throw new Error('Push notifications are not configured yet.');
  const occurredAt=Date.now(),reason='Push notifications are working on this device.';
  const payload=JSON.stringify({kind:'push-test',title:'SignalForge Test Alert',body:reason,url:buildAlertUrl({status:'TEST',reason,occurredAt,kind:'push-test'}),status:'TEST',reason,occurredAt:new Date(occurredAt).toISOString()});
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
function buildSignalPayload(analysis,previousStatus,occurredAt){const price=Number(analysis?.latest?.close)||0,readiness=Number(analysis?.readiness)||0,symbol=String(analysis?.symbol||'').toUpperCase(),status=String(analysis?.status||'WAIT — SETUP NOT READY'),reason=String(analysis?.reason||'SignalForge status changed.'),transition=previousStatus&&previousStatus!==status?`${previousStatus} → ${status}`:status;return {kind:'signal-status-change',title:`${symbol} · ${status}`,body:`${transition}\n$${price.toFixed(2)} · ${readiness}% readiness\n${reason}`,symbol,status,previousStatus:previousStatus||null,readiness,price,reason,url:buildAlertUrl({symbol,status,previousStatus,reason,occurredAt,kind:'signal-status-change'}),occurredAt:new Date(occurredAt).toISOString()};}
function buildAlertUrl({symbol=null,status='',previousStatus='',reason='',occurredAt=Date.now(),kind='signal-alert'}={}){const params=new URLSearchParams();if(symbol)params.set('symbol',String(symbol).toUpperCase());params.set('alert','1');if(symbol)params.set('alertSymbol',String(symbol).toUpperCase());if(kind)params.set('alertKind',String(kind));if(status)params.set('alertStatus',String(status));if(previousStatus)params.set('alertPrevious',String(previousStatus));if(reason)params.set('alertReason',String(reason).replace(/\s+/g,' ').trim().slice(0,240));params.set('alertAt',new Date(occurredAt).toISOString());return `/?${params.toString()}`;}
function topicFor(analysis){return `${analysis?.symbol||'SF'}-${analysis?.status||'alert'}`;}
function sanitizeTopic(value){const base=String(value||'signalforge-alert').replace(/[^A-Za-z0-9_-]/g,'').slice(0,32);return base||'signalforge-alert';}
