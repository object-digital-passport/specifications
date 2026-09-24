import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {preparePassport,prepareIssuance} from '../passport.mjs';
import {parseJSONBytes,sha256} from '../canonical.mjs';
import {editionCommitment} from '../edition-commitment.mjs';
import {verifyAddressList,leafOf,treeOf} from '../edition.mjs';
const fixture = name=>JSON.parse(fs.readFileSync(new URL(`../../../schema/examples/0.7/${name}.json`,import.meta.url)));
test('unknown anchor names including prototype properties set bit 31',()=>{
 for(const type of ['constructor','__proto__','toString','hasOwnProperty','new_custom_type']) {
  const d=fixture('physical'); d.anchors.push({type,data:{note:'custom'}});
  assert.equal(preparePassport(d).mint.anchorTypesMask>>>31,1);
 }
});
test('strict bytes and CLI reject malformed UTF-8 and BOM',()=>{
 for(const b of [[0xff],[0xc0,0xaf],[0xed,0xa0,0x80],[0xef,0xbb,0xbf,0x7b,0x7d]])assert.throws(()=>parseJSONBytes(Buffer.from(b)));
 assert.equal(parseJSONBytes(Buffer.from('"�"')),'�');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'odp-utf8-'));
 try {const file=path.join(dir,'bad.json');const d=fixture('physical');d.title='MARKER';const text=JSON.stringify(d).split('MARKER');fs.writeFileSync(file,Buffer.concat([Buffer.from(text[0]),Buffer.from([0xff]),Buffer.from(text[1])]));
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('../passport.mjs',import.meta.url)),'prepare',file],{encoding:'utf8'});
  assert.notEqual(result.status,0);assert.equal(result.stdout,'');assert.match(result.stderr,/encoded data was not valid/);
 } finally {fs.rmSync(dir,{recursive:true});}
});
test('zero root is rejected in passport and direct commitment preflight',()=>{
 const d=fixture('edition'),a=d.anchors.find(a=>a.type==='unit_key_set').data;a.merkleRoot='sha256:'+'0'.repeat(64);
 assert.throws(()=>preparePassport(d,{issuer:'0x'+'1'.repeat(40)}),/Schema|Zero/);
 assert.throws(()=>editionCommitment({...a,issuer:'0x'+'1'.repeat(40)}),/Zero/);
});
test('address list verifies odd tree and rejects count, order, root and format tampering',()=>{
 const addresses=['1','2','3'].map(x=>'0x'+x.repeat(40));const bytes=Buffer.from(addresses.join('\n')+'\n');
 const a={unitCount:3,addressListHash:'sha256:'+sha256(bytes).slice(2),merkleRoot:'sha256:'+treeOf(addresses.map((a,i)=>leafOf(i,a))).root.slice(2)};
 assert.equal(verifyAddressList(bytes,a).integrity,'verified');
 assert.throws(()=>verifyAddressList(bytes,{...a,unitCount:2}),/count/);
 assert.throws(()=>verifyAddressList(bytes,{...a,merkleRoot:'sha256:'+'f'.repeat(64)}),/root/);
 for(const altered of [Buffer.from(addresses.reverse().join('\n')+'\n'),Buffer.from(bytes.toString().replaceAll('\n','\r\n')),Buffer.from(bytes.toString().slice(0,-1))])assert.throws(()=>verifyAddressList(altered,a));
});

test('address list with one address on two indexes is rejected even with a consistent root',()=>{
 const addresses=['1','2','1'].map(x=>'0x'+x.repeat(40));const bytes=Buffer.from(addresses.join('\n')+'\n');
 const a={unitCount:3,addressListHash:'sha256:'+sha256(bytes).slice(2),merkleRoot:'sha256:'+treeOf(addresses.map((a,i)=>leafOf(i,a))).root.slice(2)};
 assert.throws(()=>verifyAddressList(bytes,a),/Duplicate unit address/);
});

test('statement validator rejects independently changed subject, journal, author and payload',async()=>{
 const {verifyStatement}=await import('../statement.mjs');const {canonicalize,canonicalHash}=await import('../canonical.mjs');
 const d={format:'odp-statement-0.7',subject:{chainId:'1',registry:'0x'+'1'.repeat(40),passportId:'ODP-2026-09-123456789',dataHash:'sha256:'+'a'.repeat(64)},journal:'0x'+'2'.repeat(40),kind:'issuer-correction',author:'0x'+'3'.repeat(40),previousId:'0',body:'Correction'};
 const ctx={chainId:1,registry:d.subject.registry,journal:d.journal},r={passportId:d.subject.passportId,dataHash:'0x'+'a'.repeat(64),author:d.author,kind:1,previousId:0,payloadHash:canonicalHash(d)};
 const bytes=Buffer.from(canonicalize(d));assert.equal(verifyStatement(bytes,ctx,r).truth,'unsupported');
 for(const change of [{author:'0x'+'4'.repeat(40)},{kind:2},{dataHash:'0x'+'b'.repeat(64)},{previousId:1},{payloadHash:'0x'+'c'.repeat(64)}])assert.throws(()=>verifyStatement(bytes,ctx,{...r,...change}));
 assert.throws(()=>verifyStatement(bytes,{...ctx,chainId:2},r));assert.throws(()=>verifyStatement(Buffer.from(JSON.stringify(d,null,2)),ctx,r));
});

test('pinned operation vectors preserve encoding and separate caller, chain and satellite',async()=>{
 const methods=await import('../operations.mjs');const v=JSON.parse(fs.readFileSync(new URL('../../../schema/vectors/operations-redesign-8.json',import.meta.url)));
 // Statement/proof encodings are unchanged since redesign-5; the redesign-8 mint tuple adds previewHash.
 const old=JSON.parse(fs.readFileSync(new URL('../../../schema/vectors/operations-redesign-5.json',import.meta.url)));
 for(const kind of ['statement','proof'])assert.deepEqual(v[kind],old[kind]);
 assert.notEqual(v.mint.digest,old.mint.digest);assert.notEqual(v.mintPreview.digest,v.mint.digest);
 for(const kind of ['statement','proof','mint','mintPreview']) {
  const f=methods[kind.replace('Preview','')+'Digest'],{input,digest}=v[kind];assert.equal(f(input),digest);
  assert.notEqual(f({...input,chainId:80002}),digest);
  assert.notEqual(f({...input,registry:'0x'+'4'.repeat(40)}),digest);
  if(!kind.startsWith('mint'))assert.notEqual(f({...input,satellite:'0x'+'5'.repeat(40)}),digest);
 }
});

test('issuance preflight requires and verifies full edition list before exposing mint tuple',async()=>{
 const {prepareIssuance}=await import('../passport.mjs');const d=fixture('edition'),a=d.anchors.find(a=>a.type==='unit_key_set').data,issuer='0x'+'1'.repeat(40);
 await assert.rejects(prepareIssuance(d,{issuerType:'B',issuer}),/address list required/);
 const addresses=Array.from({length:a.unitCount},(_,i)=>'0x'+(BigInt(i)+1n).toString(16).padStart(40,'0'));const bytes=Buffer.from(addresses.join('\n')+'\n');
 a.addressListHash='sha256:'+sha256(bytes).slice(2);a.merkleRoot='sha256:'+treeOf(addresses.map((x,i)=>leafOf(i,x))).root.slice(2);
 assert.notEqual((await prepareIssuance(d,{issuerType:'B',issuer,addressListBytes:bytes})).mint.editionCommitment,'0x'+'0'.repeat(64));
 await assert.rejects(prepareIssuance(d,{issuerType:'B',issuer,addressListBytes:Buffer.alloc(bytes.length)}),/hash mismatch/);
});

 test('ABI7 issuance checks registered role before any nonunique declaration',async()=>{
 const d=JSON.parse(fs.readFileSync(new URL('../../../schema/examples/0.7/physical.json',import.meta.url)));d.edition={model:'unique'};
 await assert.rejects(prepareIssuance(d),/issuer type required/);
 for(const issuerType of ['C','P','M']){
  await prepareIssuance(d,{issuerType});
  for(const model of ['limited','open','dynamic'])await assert.rejects(prepareIssuance({...d,edition:{model}},{issuerType}),/Only B/);
 }
 for(const model of ['unique','limited','open','dynamic'])await prepareIssuance({...d,edition:{model}},{issuerType:'B'});
 });

 test('preparePassport applies the B-only edition rule only when an issuer type is supplied',()=>{
 const d=fixture('physical');
 const limited={...d,edition:{model:'limited'}};
 // Verifiers pass no issuer type: document preparation is unchanged.
 for(const model of ['unique','limited','open','dynamic'])preparePassport({...d,edition:{model}});
 for(const issuerType of ['C','P','M']){
  preparePassport(d,{issuerType});
  for(const model of ['limited','open','dynamic'])assert.throws(()=>preparePassport({...d,edition:{model}},{issuerType}),/Only B/);
 }
 preparePassport(limited,{issuerType:'B'});
 assert.throws(()=>preparePassport(d,{issuerType:'X'}),/Invalid issuer type/);
 });
