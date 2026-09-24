import { expect } from 'chai';
import { ethers,deploy,register,inputs,mint,hash,tx,fails,at } from './ODP07.test.js';
import { editionContext,deriveUnit,decodeCode,unitWallet,leafOf,treeOf } from '../../tools/edition.mjs';
import { canonicalize,canonicalHash,parseJSON } from '../../tools/canonical.mjs';
import fs from 'node:fs';

describe('0.7 edition preparation and activation',()=>{
 let c,s,w,nonce,ctx;
 beforeEach(async()=>{w=await ethers.getSigners();c=await deploy('ObjectDigitalPassport');await register(c,w[0],'B');s=await deploy('ODPEditionUnits',await c.getAddress());nonce=hash('preselected nonce');ctx=editionContext((await ethers.provider.getNetwork()).chainId,await c.getAddress(),nonce);});
 async function edition(n=3){
  const units=Array.from({length:n},(_,i)=>deriveUnit(Buffer.alloc(32,42),ctx,i)),tree=treeOf(units.map((u,i)=>leafOf(i,u.wallet.address)));
  // Root, nonce and satellite address already exist BEFORE registry assigns an ID.
  const anchor={type:'unit_key_set',data:{merkleRoot:'sha256:'+tree.root.slice(2),unitCount:n,editionNonce:nonce,satellite:await s.getAddress(),registry:await c.getAddress(),chainId:String((await ethers.provider.getNetwork()).chainId),keyDerivation:'odp-unit-v2'}};
  const p=await mint(c,w[0],'physical',await inputs('physical',{anchorsHash:canonicalHash([anchor]),anchorTypesMask:4111,editionCommitment:await s.commitmentFor(w[0].address,tree.root,n,ethers.ZeroAddress,nonce),core:{editionModel:2}}));
  await tx(s.openEdition(p,tree.root,n,ethers.ZeroAddress,nonce));return {units,tree,p,anchor};
 }
 it('prepares immutable root before mint; printed seed reconstructs exactly the same key',async()=>{
  const {units,tree,p,anchor}=await edition();expect((await c.getPassportMedia(p)).anchorsHash).eq(canonicalHash([anchor]));expect((await s.getEdition(p)).merkleRoot).eq(tree.root);
  for(const u of units)expect(unitWallet(decodeCode(u.code),ctx).address).eq(u.wallet.address);
  expect(()=>decodeCode(units[0].code.slice(0,-1)+'!')).throws();
  expect(editionContext(137,await c.getAddress(),nonce).equals(ctx)).eq(false);
 });
 it('permissionless courier gains no rights; duplicate, wrong index and bad signature fail',async()=>{
  const {units,tree,p}=await edition();const sig=await units[1].wallet.signMessage(ethers.getBytes(await s.activationPayloadHash(p,1)));
  await fails(s.activate(p,3,tree.proof(1),sig),s,122);await fails(s.activate(p,0,tree.proof(1),sig),s,123);await fails(s.activate(p,1,tree.proof(1),'0x'),s,125);
  await tx(s.connect(w[4]).activate(p,1,tree.proof(1),sig));expect((await s.getActivation(p,1)).unitAddress).eq(units[1].wallet.address);
  await fails(s.activate(p,1,tree.proof(1),sig),s,124);expect(s.interface.getFunction('mintUnitPassport')).eq(null);
 });
 it('activation does not close B issuer 24h revocation window; revoked edition cannot activate again',async()=>{
  const {units,tree,p}=await edition();let sig=await units[0].wallet.signMessage(ethers.getBytes(await s.activationPayloadHash(p,0)));await tx(s.activate(p,0,tree.proof(0),sig));
  await tx(c.revokePassport(p,hash('correction')));expect(await s.isActivated(p,0)).eq(true);sig=await units[1].wallet.signMessage(ethers.getBytes(await s.activationPayloadHash(p,1)));await fails(s.activate(p,1,tree.proof(1),sig),s,11);
 });
 it('issuer can open a committed edition later; no profile stop can strand it',async()=>{
  const {units,tree,p}=await edition();const laterNonce=hash('later nonce');
  const commitment=await s.commitmentFor(w[0].address,tree.root,3,ethers.ZeroAddress,laterNonce);
  const second=await mint(c,w[0],'physical',await inputs('physical',{anchorTypesMask:4111,editionCommitment:commitment,core:{editionModel:2}}));
  await at(BigInt((await ethers.provider.getBlock('latest')).timestamp)+86400n*90n);
  await tx(s.openEdition(second,tree.root,3,ethers.ZeroAddress,laterNonce));expect((await s.getEdition(second)).open).eq(true);
  const sig=await units[0].wallet.signMessage(ethers.getBytes(await s.activationPayloadHash(p,0)));await tx(s.activate(p,0,tree.proof(0),sig));
 });
 it('rejects invalid edition model, flags, count, nonce, role and revoked passport',async()=>{
  const normal=await mint(c,w[0]);await fails(s.openEdition(normal,hash('root'),1,ethers.ZeroAddress,nonce),s,122);
  const p=await mint(c,w[0],'physical',await inputs('physical',{core:{editionModel:2}}));await fails(s.openEdition(p,hash('root'),1,ethers.ZeroAddress,nonce),s,105);
  const {p:e,tree}=await edition();await fails(s.openEdition(e,tree.root,3,ethers.ZeroAddress,nonce),s,119);
  const valid=await mint(c,w[0],'physical',await inputs('physical',{core:{editionModel:2},anchorTypesMask:4111}));
  for(const n of [0,1048577])await fails(s.openEdition(valid,hash('root'),n,ethers.ZeroAddress,nonce),s,122);
  await fails(s.openEdition(valid,hash('root'),1,ethers.ZeroAddress,ethers.ZeroHash),s,141);await fails(s.connect(w[1]).openEdition(valid,hash('root'),1,ethers.ZeroAddress,nonce),s,120);
  await tx(c.revokePassport(valid,hash('r')));await fails(s.openEdition(valid,hash('root'),1,ethers.ZeroAddress,nonce),s,11);
 });
 it('satellite-specific signatures cannot replay; historical namespace remains independently readable',async()=>{
  const {p,units,tree}=await edition(),s2=await deploy('ODPEditionUnits',await c.getAddress());await expect(s2.openEdition(p,tree.root,3,ethers.ZeroAddress,nonce)).to.be.revertedWithCustomError(s2,'EditionCommitmentMismatch');
  const sig=await units[0].wallet.signMessage(ethers.getBytes(await s.activationPayloadHash(p,0)));await tx(s.activate(p,0,tree.proof(0),sig));
  await fails(s2.activate(p,0,tree.proof(0),sig),s2,118);expect(await s2.isActivated(p,0)).eq(false);expect(await s.isActivated(p,0)).eq(true);
 });
 it('all leaves in odd/even trees verify; mutations never activate or change state',async()=>{
  for(const n of [1,2,3,5,9,17]){
   nonce=hash('unique-run-'+n);ctx=editionContext((await ethers.provider.getNetwork()).chainId,await c.getAddress(),nonce);
   const {p,units,tree}=await edition(n);
   for(let i=0;i<n;i++){
    expect(await s.unitLeaf(i,units[i].wallet.address)).eq(leafOf(i,units[i].wallet.address));const proof=tree.proof(i),sig=await units[i].wallet.signMessage(ethers.getBytes(await s.activationPayloadHash(p,i)));
    if(proof.length){const bad=[...proof];bad[0]=hash('mutation');await fails(s.activate(p,i,bad,sig),s,123);}
    const wrong=await w[3].signMessage(ethers.getBytes(await s.activationPayloadHash(p,i)));await fails(s.activate(p,i,proof,wrong),s,123);expect(await s.isActivated(p,i)).eq(false);
    await tx(s.activate(p,i,proof,sig));expect(await s.isActivated(p,i)).eq(true);
   }
  }
 });
});
describe('0.7 canonicalization',()=>{
 it('sorts integer-like keys by UTF-16, normalizes NFC, and uses ECMAScript numbers',()=>{
  expect(canonicalize({'2':'b','10':'a',z:1e21,a:-0,s:'e\u0301'})).eq('{"10":"a","2":"b","a":0,"s":"é","z":1e+21}');
  expect(canonicalize({'😀':1,'\ufffd':2})).eq('{"😀":1,"�":2}');
 });
 it('rejects ambiguous or non-JSON inputs including normalized duplicate keys',()=>{
  for(const s of ['{"x":1,"x":2}','{"é":1,"e\\u0301":2}','[1,]','01','1e999','{"x":NaN}','"\\ud800"','null trailing'])expect(()=>parseJSON(s)).throws();
  for(const v of [NaN,Infinity,undefined,BigInt(1),new Date(),[,,],{'é':1,'e\u0301':2}])expect(()=>canonicalize(v)).throws();
  expect(canonicalize(parseJSON('{"__proto__":{"x":1},"v":true}'))).eq('{"__proto__":{"x":1},"v":true}');
 });
 it('matches checked-in canonical vectors',()=>{
  const v=JSON.parse(fs.readFileSync(new URL('../../../schema/vectors/canonical-v07.json',import.meta.url)));
  for(const x of v){expect(canonicalize(parseJSON(x.input))).eq(x.canonical);expect(canonicalHash(parseJSON(x.input))).eq(x.sha256);}
 });
});
