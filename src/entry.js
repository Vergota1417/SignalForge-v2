import app from './index.js';
import { authorizeDevice } from './db.js';
import { getOperationsStatus } from './operations.js';
import { runBackendSelfTest } from './self-test.js';

const SELF_TEST_COOLDOWN_MS=60_000;

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname!=='/api/backend-self-test')return app.fetch(request,env,ctx);
    if(request.method!=='POST')return json({error:'Method not allowed.'},405);
    try{
      const body=await readJson(request),endpoint=String(request.headers.get('x-sf-endpoint')||body?.deviceEndpoint||'').trim(),token=String(request.headers.get('x-sf-token')||body?.deviceToken||'').trim();
      if(!endpoint.startsWith('https://')||!/^[A-Za-z0-9_-]{32,128}$/.test(token)||!await authorizeDevice(env,endpoint,token))return json({error:'Backend self-test requires an authorized SignalForge phone. Enable alerts on this phone first.'},403);
      const operations=await getOperationsStatus(env),lastRun=Number(operations.operations?.['backend-self-test']?.lastRunAt)||0,retryAfterMs=Math.max(0,SELF_TEST_COOLDOWN_MS-(Date.now()-lastRun));
      if(retryAfterMs>0)return json({error:'Backend self-test cooldown is active.',retryAfterMs},429);
      const symbol=sanitizeSymbol(body?.symbol)||'XOM',selfTest=await runBackendSelfTest(env,{symbol,now:Date.now()});
      return json({selfTest});
    }catch(error){console.error(JSON.stringify({event:'backend_self_test_request_error',message:error?.message||String(error)}));return json({error:String(error?.message||'Backend self-test failed.')},500);}
  },
  scheduled(controller,env,ctx){return app.scheduled(controller,env,ctx);}
};

async function readJson(request){const text=await request.text();if(text.length>10_000)throw new Error('Self-test request is too large.');try{return text?JSON.parse(text):{};}catch{throw new Error('Invalid JSON payload.');}}
function sanitizeSymbol(v){const s=String(v||'').trim().toUpperCase().replace(/[^A-Z.]/g,'').slice(0,6);return/^[A-Z]{1,5}(?:\.[A-Z])?$/.test(s)?s:'';}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}
