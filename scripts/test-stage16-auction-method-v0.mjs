import assert from 'node:assert/strict';
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

console.log('Stage 16 auction method V0 regression: PASS');
