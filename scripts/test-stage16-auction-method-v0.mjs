import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assessAuctionContext, AUCTION_METHOD_VERSION } from '../src/auction-context.js';

function bars({days=5,start=1756114200000,trend=.18,vol=1000}={}){
  const rows=[];let price=100;
  for(let d=0;d<days;d++){
    for(let i=0;i<26;i++){
      const open=price,move=(i%7===0?-trend*.4:trend),close=Math.max(1,open+move),high=Math.max(open,close)+.08,low=Math.min(open,close)-.08;
      rows.push({time:start+d*86_400_000+i*15*60_000,open,high,low,close,volume:vol+(i%5)*120});price=close;
    }
  }
  return rows;
}

const result=assessAuctionContext(bars(),{symbol:'QQQ'});
assert.equal(result.version,AUCTION_METHOD_VERSION);
assert.equal(result.shadowOnly,true);
assert.equal(result.affectsBuyNow,false);
assert.equal(result.methodSequence.join('>'),'ENVIRONMENT>LOCATION>PATH>CONFIRMATION>EXECUTION');
assert.equal(result.coverage.environment,true);
assert.equal(result.coverage.volumeProfile,true);
assert.equal(result.coverage.footprint,false);
assert.equal(result.coverage.gex,false);
assert.equal(result.coverage.mbo,false);
assert.ok(Number.isFinite(result.location.poc));
assert.ok(Number.isFinite(result.location.VAH));
assert.ok(Number.isFinite(result.location.VAL));
assert.ok(result.location.VAL<=result.location.VAH);
assert.match(result.status,/BUY NOW CANDIDATE|SETUP — READY SOON|WAIT FOR CONFIRMATION|AVOID/);

const insufficient=assessAuctionContext(bars({days:1}),{symbol:'QQQ'});
assert.equal(insufficient.status,'INSUFFICIENT');
assert.equal(insufficient.affectsBuyNow,false);

const entry=read('../src/entry.js'),policy=read('../public/api-request-policy.js'),html=read('../public/index.html'),sw=read('../public/service-worker.js'),wrangler=read('../wrangler.jsonc');
assert.match(entry,/url\.pathname==='\/api\/auction-context'/,'existing production entry must own the auction endpoint');
assert.match(entry,/assessAuctionContext/,'auction endpoint must call the auction engine');
assert.match(entry,/auctionMethodAffectsBuyNow:false/,'health guardrails must state auction V0 cannot authorize BUY NOW');
assert.match(policy,/['"]\/api\/auction-context['"]\s*:\s*FIVE_MINUTES/,'auction polling must be governed by central request policy');
assert.match(html,/auction-method-ui\.js/,'PWA must load the auction panel');
assert.match(sw,/\/auction-method-ui\.js/,'PWA shell must cache the auction panel');
assert.match(wrangler,/"main": "src\/entry\.js"/,'auction V0 must preserve the sole production Worker entry owner');
assert.equal(fs.existsSync(new URL('../src/auction-entry.js',import.meta.url)),false,'temporary competing Worker entry must stay removed');

console.log('Stage 16 auction method V0 regression: PASS');
function read(relative){return fs.readFileSync(new URL(relative,import.meta.url),'utf8');}
