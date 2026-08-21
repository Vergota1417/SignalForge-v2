import { sendNotification } from 'web-push-neo';
import { deletePushSubscription, listPushSubscriptions } from './db.js';

const DEFAULT_PUSH_STATUSES = new Set(['SETUP — READY SOON','BUY NOW','SELL / EXIT']);

export function pushConfigured(env) {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
}

export function shouldPushStatus(env, status) {
  const raw=String(env.PUSH_ALERT_STATUSES||'').trim();
  const allowed=raw ? new Set(raw.split('|').map(s=>s.trim()).filter(Boolean)) : DEFAULT_PUSH_STATUSES;
  return allowed.has(status);
}

export async function broadcastSignalPush(env, analysis, previousStatus, occurredAt=Date.now()) {
  if(!pushConfigured(env) || !shouldPushStatus(env, analysis?.status)) return {sent:0,failed:0,removed:0,skipped:true};
  const subscriptions=await listPushSubscriptions(env);
  if(!subscriptions.length) return {sent:0,failed:0,removed:0,skipped:true};

  const payload=JSON.stringify(buildSignalPayload(analysis,previousStatus,occurredAt));
  const vapidDetails=vapid(env);
  let sent=0,failed=0,removed=0;

  await Promise.all(subscriptions.map(async row=>{
    try{
      await sendNotification(row.subscription,payload,{vapidDetails,TTL:900,urgency:'high',topic:topicFor(analysis)});
      sent++;
    }catch(error){
      failed++;
      const statusCode=Number(error?.statusCode||error?.status||0);
      if(statusCode===404 || statusCode===410){
        await deletePushSubscription(env,row.endpoint);
        removed++;
      }
      console.error(JSON.stringify({event:'push_delivery_error',statusCode,message:error?.message||String(error)}));
    }
  }));
  return {sent,failed,removed,skipped:false};
}

export async function sendTestPush(env, subscription) {
  if(!pushConfigured(env)) throw new Error('Push notifications are not configured yet.');
  const payload=JSON.stringify({
    kind:'push-test',
    title:'SignalForge Test Alert',
    body:'Push notifications are working on this device.',
    url:'/',
    status:'TEST',
    occurredAt:new Date().toISOString()
  });
  try{
    await sendNotification(subscription,payload,{vapidDetails:vapid(env),TTL:120,urgency:'high',topic:'signalforge-test'});
    return {sent:true};
  }catch(error){
    const statusCode=Number(error?.statusCode||error?.status||0);
    if(statusCode===404 || statusCode===410) await deletePushSubscription(env,subscription?.endpoint||'');
    const wrapped=new Error(error?.message||'Push test failed.');
    wrapped.statusCode=statusCode;
    throw wrapped;
  }
}

function vapid(env){return {subject:env.VAPID_SUBJECT,publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY};}

function buildSignalPayload(analysis,previousStatus,occurredAt){
  const price=Number(analysis?.latest?.close)||0;
  const readiness=Number(analysis?.readiness)||0;
  return {
    kind:'signal-status-change',
    title:`${analysis.symbol} · ${analysis.status}`,
    body:`$${price.toFixed(2)} · ${readiness}% readiness\n${analysis.reason}`,
    symbol:analysis.symbol,
    status:analysis.status,
    previousStatus:previousStatus||null,
    readiness,
    price,
    reason:analysis.reason,
    url:`/?symbol=${encodeURIComponent(analysis.symbol)}`,
    occurredAt:new Date(occurredAt).toISOString()
  };
}

function topicFor(analysis){
  const base=`${analysis?.symbol||'SF'}-${analysis?.status||'alert'}`.replace(/[^A-Za-z0-9_-]/g,'').slice(0,32);
  return base || 'signalforge-alert';
}
