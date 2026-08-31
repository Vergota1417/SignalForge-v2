import app from './entry.js';
import { getMarketData } from './market.js';
import { assessAuctionContext } from './auction-context.js';

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname!=='/api/auction-context')return app.fetch(request,env,ctx);
    if(request.method!=='GET')return json({error:'Method not allowed.'},405);
    try{
      const symbol=sanitizeSymbol(url.searchParams.get('symbol'));if(!symbol)return json({error:'Valid symbol is required.'},400);
      const market=await getMarketData(env,symbol,'5D',false,{completedOnly:false});
      const auction=assessAuctionContext(market.candles,{symbol,currentPrice:market.candles.at(-1)?.close});
      return json({symbol,source:market.source,cached:Boolean(market.cached),fetchedAt:market.fetchedAt,auction});
    }catch(error){console.error(JSON.stringify({event:'auction_context_request_error',message:error?.message||String(error)}));return json({error:'Auction context is temporarily unavailable.'},500);}
  },
  scheduled(controller,env,ctx){return app.scheduled(controller,env,ctx);}
};

function sanitizeSymbol(v){const s=String(v||'').trim().toUpperCase().replace(/[^A-Z.]/g,'').slice(0,6);return/^[A-Z]{1,5}(?:\.[A-Z])?$/.test(s)?s:'';}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}
