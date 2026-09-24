import { expect } from 'chai';
import fs from 'node:fs';
import { ethers,deploy,register,tx,event,fails,inputs,mint,hash } from './ODP07.test.js';
import { preparePassport,verifyPassport,verifyEditionAnchor } from '../../tools/passport.mjs';
import { canonicalize,canonicalHash,parseJSON,sha256 } from '../../tools/canonical.mjs';
import { editionContext,deriveUnit,treeOf,leafOf } from '../../tools/edition.mjs';

describe('0.7 canonical bundle to local EVM and back',()=>{
 for(const kind of ['physical','digital','mixed','edition'])it(`${kind}: real file bytes → JSON → mint → receipt → independent verification`,async()=>{
  const [issuer]=await ethers.getSigners(),c=await deploy('ObjectDigitalPassport');await register(c,issuer,kind==='edition'?'B':'C');
  const original=JSON.parse(fs.readFileSync(new URL(`../../../schema/examples/0.7/${kind}.json`,import.meta.url)));
  const d=structuredClone(original),b=await ethers.provider.getBlock('latest'),date=new Date(b.timestamp*1000),iso=date.toISOString().replace('.000Z','Z');
  d.registeredAt=b.timestamp;d.registration={utcIso8601:iso,localIso8601:iso.replace('Z','+00:00'),ianaTimeZone:'UTC'};d.year=date.getUTCFullYear();d.month=date.getUTCMonth()+1;
  const photo=Buffer.from('Fixture image bytes, not an authenticity assertion'),file=Buffer.from('Fixture original digital bytes');
  for(const a of d.anchors){if(a.type==='photo')a.hash='sha256:'+sha256(photo).slice(2);if(a.type==='file_hash')a.hash='sha256:'+sha256(file).slice(2);}
  if(d.digital)d.digital.fileHash='sha256:'+sha256(file).slice(2);
  let satellite,units,tree;
  if(kind==='edition'){
   satellite=await deploy('ODPEditionUnits',await c.getAddress());const nonce=hash('pre-mint edition nonce'),chain=(await ethers.provider.getNetwork()).chainId;
   const ctx=editionContext(chain,await c.getAddress(),nonce);units=Array.from({length:5},(_,i)=>deriveUnit(Buffer.alloc(32,7),ctx,i));tree=treeOf(units.map((u,i)=>leafOf(i,u.wallet.address)));
   const addresses=Buffer.from(units.map(u=>u.wallet.address.toLowerCase()).join('\n')+'\n');
   d.edition.total=5;d.anchors.find(a=>a.type==='unit_key_set').data={merkleRoot:'sha256:'+tree.root.slice(2),unitCount:5,hashAlg:'sha256',leafFormat:'sha256(uint32be(index) || address20)',addressListHash:'sha256:'+sha256(addresses).slice(2),editionNonce:nonce,satellite:await satellite.getAddress(),registry:await c.getAddress(),chainId:String(chain),keyDerivation:'odp-unit-v2'};
  }
  const prepared=preparePassport(d,{issuer:issuer.address}),method='mint'+d.objectType[0].toUpperCase()+d.objectType.slice(1);
  const r=await tx(c[method](prepared.mint,hash('bundle-'+kind))),pid=event(c,r,'PassportMinted').args.passportIdText;
  const receipt={passportId:pid,chainId:String((await ethers.provider.getNetwork()).chainId),registry:await c.getAddress(),transactionHash:r.hash,blockNumber:r.blockNumber};
  expect(prepared.document.passportId).eq(null);expect(receipt.passportId).match(/^ODP-/);
  const h=await c.getPassportHeader(pid),media=await c.getPassportMedia(pid),cl=await c.getPassportClassification(pid);
  const decoded=parseJSON(prepared.canonical);expect(verifyPassport(decoded,h,media,cl).integrity).eq(true);
  decoded.title+='tampered';expect(()=>verifyPassport(decoded,h,media,cl)).throws('Hash mismatch');
  if(kind==='edition'){
   const a=prepared.document.anchors.find(x=>x.type==='unit_key_set').data;await tx(satellite.openEdition(pid,tree.root,5,ethers.ZeroAddress,a.editionNonce));
   const anchor=prepared.document.anchors.find(x=>x.type==='unit_key_set'),record=await satellite.getEdition(pid),context={registry:await c.getAddress(),satellite:await satellite.getAddress(),chainId:(await ethers.provider.getNetwork()).chainId};
   expect(verifyEditionAnchor(anchor,context,record)).eq(true);
   expect(()=>verifyEditionAnchor(anchor,{...context,satellite:ethers.ZeroAddress},record)).throws('namespace');
   expect(()=>verifyEditionAnchor(anchor,{...context,chainId:1},record)).throws('chain');
   expect(()=>verifyEditionAnchor({...anchor,data:{...anchor.data,unitCount:6}},context,record)).throws('commitment');
   const sig=await units[4].wallet.signMessage(ethers.getBytes(await satellite.activationPayloadHash(pid,4)));await tx(satellite.activate(pid,4,tree.proof(4),sig));expect(await satellite.isActivated(pid,4)).eq(true);
  }
 });
 it('all checked-in examples satisfy schema and semantic validation',()=>{
  for(const k of ['physical','digital','mixed','edition','physical-preview'])expect(preparePassport(parseJSON(fs.readFileSync(new URL(`../../../schema/examples/0.7/${k}.json`,import.meta.url),'utf8')),{issuer:'0x'+'1'.repeat(40)}).mint.dataHash).match(/^0x[0-9a-f]{64}$/);
 });
 it('rejects time, byte-length, assigned-ID and cross-anchor inconsistencies',()=>{
  const source=JSON.parse(fs.readFileSync(new URL('../../../schema/examples/0.7/digital.json',import.meta.url)));
  for(const mutate of [d=>d.registeredAt++,d=>d.passportId='ODP-2026-03-123456789',d=>d.title='я'.repeat(100),d=>d.digital.fileHash='sha256:'+'ab'.repeat(32),d=>d.anchors.push(d.anchors[0])]){const d=structuredClone(source);mutate(d);expect(()=>preparePassport(d)).throws();}
 });
});

describe('0.7 quota and pagination boundaries',()=>{
 it('1000 direct mints exhaust C bucket; rejected mint is atomic; pages stay bounded',async function(){
  this.timeout(120000);
  const [issuer,agent]=await ethers.getSigners(),c=await deploy('ObjectDigitalPassport'),id=await register(c,issuer);
  const m=await inputs();
  await fails(c.mintPhysical({...m,dataHash:ethers.ZeroHash},ethers.hexlify(ethers.randomBytes(32))),c,30);
  for(let i=0;i<1000;i++)await tx(c.connect(issuer).mintPhysical(m,ethers.zeroPadValue(ethers.toBeHex(i+1),32)));
  await fails(c.mintPhysical(m,ethers.hexlify(ethers.randomBytes(32))),c,1);await fails(c.connect(agent).mintPhysical(m,hash('outsider')),c,3);
  const firstOp=ethers.zeroPadValue(ethers.toBeHex(1),32),first=await c.getMintOperation(issuer.address,firstOp);
  await expect(c.mintPhysical(m,firstOp)).to.be.revertedWithCustomError(c,'AlreadyCommitted').withArgs(firstOp,first.passportId);
  const [page,total]=await c.getPassportsByCreatorPaged(issuer.address,0,ethers.MaxUint256);expect(page.length).eq(100);expect(total).eq(1000);
  expect((await c.getPassportsByCreatorPaged(issuer.address,995,100))[0].length).eq(5);
 });
});
