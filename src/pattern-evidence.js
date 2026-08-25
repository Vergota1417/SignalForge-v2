export const PATTERN_EVIDENCE_VERSION='sf-pattern-context-shadow-v1';

export async function recordPatternContextShadow(env,analysis,{source='analysis-evidence',now=Date.now()}={}){
  const pattern=analysis?.patternContext,symbol=sanitizeSymbol(analysis?.symbol);
  if(!env?.DB||!symbol||!pattern||pattern.shadowOnly!==true)return null;
  await ensurePatternEvidenceSchema(env);
  const analyzedAt=Number(analysis?.dailyAnalyzedAt)||Number(now)||Date.now();
  const primary=pattern.primaryPattern||null;
  await env.DB.prepare(`INSERT OR IGNORE INTO pattern_context_shadow_observations(
    symbol,model_version,source,analysis_at,observed_at,production_status,price,structure_state,structure_confidence,
    support,resistance,channel_type,channel_confidence,breakout_state,primary_pattern,primary_family,primary_bias,
    primary_state,primary_confidence,pattern_count,payload_json,created_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    symbol,String(pattern.version||PATTERN_EVIDENCE_VERSION),String(source||'analysis-evidence'),analyzedAt,Number(now)||Date.now(),String(analysis?.status||''),numOrNull(analysis?.latest?.close),String(pattern.structureState||''),Number(pattern.structureConfidence)||0,
    numOrNull(pattern.support?.price),numOrNull(pattern.resistance?.price),String(pattern.channel?.type||''),Number(pattern.channel?.confidence)||0,String(pattern.breakout?.state||''),String(primary?.type||''),String(primary?.family||''),String(primary?.bias||''),
    String(primary?.state||''),Number(primary?.confidence)||0,Number(pattern.summary?.patternCount)||0,JSON.stringify(compactPatternPayload(pattern)),Date.now()
  ).run();
  return{symbol,analyzedAt,primaryPattern:primary?.type||null,confidence:Number(primary?.confidence)||0};
}

export async function getPatternContextShadowStatus(env){
  if(!env?.DB)return{modelVersion:PATTERN_EVIDENCE_VERSION,totalObservations:0};
  await ensurePatternEvidenceSchema(env);
  const [total,patterns,last]=await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS count FROM pattern_context_shadow_observations`).first(),
    env.DB.prepare(`SELECT primary_pattern AS pattern,COUNT(*) AS count FROM pattern_context_shadow_observations WHERE primary_pattern<>'' GROUP BY primary_pattern ORDER BY count DESC`).all(),
    env.DB.prepare(`SELECT symbol,structure_state AS structureState,primary_pattern AS primaryPattern,primary_confidence AS primaryConfidence,analysis_at AS analysisAt FROM pattern_context_shadow_observations ORDER BY analysis_at DESC,id DESC LIMIT 1`).first()
  ]);
  return{modelVersion:PATTERN_EVIDENCE_VERSION,totalObservations:Number(total?.count)||0,byPrimaryPattern:Object.fromEntries((patterns.results||[]).map(row=>[row.pattern,Number(row.count)||0])),last:last?{...last,primaryConfidence:Number(last.primaryConfidence)||0,analysisAt:Number(last.analysisAt)||0}:null};
}

async function ensurePatternEvidenceSchema(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS pattern_context_shadow_observations(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    model_version TEXT NOT NULL,
    source TEXT NOT NULL,
    analysis_at INTEGER NOT NULL,
    observed_at INTEGER NOT NULL,
    production_status TEXT NOT NULL DEFAULT '',
    price REAL,
    structure_state TEXT NOT NULL DEFAULT '',
    structure_confidence INTEGER NOT NULL DEFAULT 0,
    support REAL,
    resistance REAL,
    channel_type TEXT NOT NULL DEFAULT '',
    channel_confidence INTEGER NOT NULL DEFAULT 0,
    breakout_state TEXT NOT NULL DEFAULT '',
    primary_pattern TEXT NOT NULL DEFAULT '',
    primary_family TEXT NOT NULL DEFAULT '',
    primary_bias TEXT NOT NULL DEFAULT '',
    primary_state TEXT NOT NULL DEFAULT '',
    primary_confidence INTEGER NOT NULL DEFAULT 0,
    pattern_count INTEGER NOT NULL DEFAULT 0,
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    UNIQUE(symbol,model_version,analysis_at)
  )`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_pattern_context_shadow_time ON pattern_context_shadow_observations(analysis_at DESC)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_pattern_context_shadow_pattern ON pattern_context_shadow_observations(primary_pattern,primary_state)`).run();
}

function compactPatternPayload(pattern){return{
  version:String(pattern?.version||PATTERN_EVIDENCE_VERSION),shadowOnly:true,affectsBuyNow:false,lookbackBars:Number(pattern?.lookbackBars)||0,
  structureState:String(pattern?.structureState||''),structureConfidence:Number(pattern?.structureConfidence)||0,reason:String(pattern?.reason||''),
  support:pattern?.support||null,resistance:pattern?.resistance||null,channel:pattern?.channel||null,breakout:pattern?.breakout||null,
  primaryPattern:pattern?.primaryPattern||null,patterns:Array.isArray(pattern?.patterns)?pattern.patterns:[],summary:pattern?.summary||null
};}
function sanitizeSymbol(v){const s=String(v||'').trim().toUpperCase().replace(/[^A-Z.]/g,'').slice(0,6);return/^[A-Z]{1,5}(?:\.[A-Z])?$/.test(s)?s:'';}
function numOrNull(v){const n=Number(v);return Number.isFinite(n)?n:null;}
