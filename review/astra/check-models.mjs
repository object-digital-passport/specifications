// Pure Node.js checks. State machines below are explicit models, not Solidity implementations.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const nfc=x=>typeof x==='string'?x.normalize('NFC'):Array.isArray(x)?x.map(nfc):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,nfc(v)])):x;
const sort=x=>Array.isArray(x)?x.map(sort):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sort(x[k])])):x;
const canon=x=>JSON.stringify(sort(nfc(x)));
const doc=JSON.parse(fs.readFileSync('review/astra/baseline-schema/vectors/physical.passport.json'));
const bytes=canon({...doc,passportId:null}), anchors=canon(doc.anchors);
assert.equal(bytes,fs.readFileSync('review/astra/baseline-schema/vectors/physical.canonical.json','utf8'));
assert.equal(anchors,fs.readFileSync('review/astra/baseline-schema/vectors/physical.anchors.canonical.json','utf8'));
const expected=JSON.parse(fs.readFileSync('review/astra/baseline-schema/vectors/physical.expected.json'));
assert.equal('0x'+sha(bytes),expected.dataHash);
assert.equal('0x'+sha(anchors),expected.anchorsHash);
assert.notEqual(doc.registeredAt,Date.parse(doc.registration.utcIso8601)/1000);
assert.equal(JSON.stringify(1e21),'1e+21');
assert.equal(canon({'2':'b','10':'a'}),'{"2":"b","10":"a"}');
const literalUtf16='{"10":"a","2":"b"}';
assert.notEqual(canon({'2':'b','10':'a'}),literalUtf16);
const unicodeEscape=JSON.stringify('\ud800');assert.equal(unicodeEscape,'"\\ud800"');
// Redesign 4.3 predicate; no claim of execution against new Solidity.
const canRevoke=(t,issue,stopped,sender,issuer)=>!stopped&&sender===issuer&&t<=issue+72*3600;
assert.equal(canRevoke(100+259200,100,false,'issuer','issuer'),true);
assert.equal(canRevoke(101+259200,100,false,'issuer','issuer'),false);
assert.equal(canRevoke(101,100,true,'issuer','issuer'),false);
assert.equal(canRevoke(101,100,false,'agent','issuer'),false);
// Concern state transitions implementing the document literally.
// Revocation freezes actions; it does not withdraw historical statements.
const records=new Map(), counts=new Map(), seen=new Set(), lists=new Map(), stopped=new Set();
let seed=0x41535452, accepted=0,rejected=0;
function rnd(n){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;}
for(let i=0;i<100000;i++){
 const p=rnd(31),who=rnd(47),op=rnd(20),k=JSON.stringify([p,who]);
 if(op===0&&i>=99000){stopped.add(who);continue;}
 const active=records.get(k)===true;
 if(stopped.has(who)||(op<11?active:!active)){rejected++;continue;}
 const raise=op<11;records.set(k,raise);counts.set(p,(counts.get(p)||0)+(raise?1:-1));accepted++;
 if(raise&&!seen.has(k)){seen.add(k);lists.set(p,[...(lists.get(p)||[]),who]);}
 const sum=[...records].filter(([key,a])=>a&&JSON.parse(key)[0]===p).length;
 assert.equal(counts.get(p),sum);assert.equal(new Set(lists.get(p)||[]).size,(lists.get(p)||[]).length);
}
// Controlled episode/revocation witness, otherwise random profile stops eventually prevent all actions.
let c=0,active=false;for(const op of ['raise','withdraw','raise','withdraw']){active=op==='raise';c+=active?1:-1;}assert.equal(c,0);
const entropy=[5000,100000,1048576,1048577,4294967295].map(n=>({units:n,required:80+Math.ceil(Math.log2(n)),effectiveBits:100-Math.log2(n),fits100:80+Math.ceil(Math.log2(n))<=100}));
// Exact mismatch interval calculation, 2026-01-01 through 2036-01-01, not sampled days.
const from=Date.UTC(2026,0,1)/1000,to=Date.UTC(2036,0,1)/1000,Y=31556952,M=2629746;
const points=new Set([from,to]);const resets=[];
for(let k=Math.floor(from/M);k<=Math.ceil(to/M);k++){const t=k*M;if(t>from&&t<to){points.add(t);resets.push(t);}}
for(let y=2026;y<=2036;y++)for(let m=0;m<12;m++){const t=Date.UTC(y,m,1)/1000;if(t>=from&&t<=to)points.add(t);}
const utc=t=>{const d=new Date(t*1000);return d.getUTCFullYear()*100+d.getUTCMonth()+1;};
const approximate=t=>(1970+Math.floor(t/Y))*100+Math.min(12,Math.floor((t%Y)/M)+1);
const ordered=[...points].sort((a,b)=>a-b);let mismatch=0,longest=0,run=0;
for(let i=0;i<ordered.length-1;i++){const t=ordered[i],d=ordered[i+1]-t;if(utc(t)!==approximate(t)){mismatch+=d;run+=d;longest=Math.max(longest,run);}else run=0;}
const buckets={};for(const t of resets)buckets[utc(t)]=(buckets[utc(t)]||0)+1;
const failure=[5000,100000,1000000,10000000,100000000,500000000,900000000,990000000].map(n=>({occupied:n,failureAfter25:(n/1e9)**25}));
const cost=151340*30e-9*.25;
console.log(JSON.stringify({canonicalVectors:true,registration:{unix:doc.registeredAt,actualISO:new Date(doc.registeredAt*1000).toISOString(),claimedISO:doc.registration.utcIso8601},jsonCounterexamples:{positiveExponent:JSON.stringify(1e21),numericKeys:canon({'2':'b','10':'a'}),literalUtf16,loneSurrogate:unicodeEscape},revocationBoundary:'inclusive at exactly 259200 seconds',concernModel:{seed:'0x41535452',steps:100000,accepted,rejected,invariant:true},entropy,cost:{one:cost,units5000:cost*5000,units5000Busy:151340*80e-9*.4*5000},calendar:{from,to,mismatchPercent:100*mismatch/(to-from),longestSeconds:longest,longestDays:longest/86400,monthsWithTwoResets:Object.values(buckets).filter(n=>n===2).length},failure},null,2));
