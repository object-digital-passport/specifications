// ABI 0.7-redesign-8: previewHash (public lightweight copy of the primary photo).
import { expect } from 'chai';
import fs from 'node:fs';
import { ethers,deploy,register,inputs,mint,hash,tx,event,fails } from './ODP07.test.js';
import { mintDigest } from '../../tools/operations.mjs';
import { preparePassport,verifyPassport } from '../../tools/passport.mjs';
import { editionContext,deriveUnit,leafOf,treeOf } from '../../tools/edition.mjs';
import { sha256 } from '../../tools/canonical.mjs';
const Z=ethers.ZeroHash,op=()=>ethers.hexlify(ethers.randomBytes(32));
const kinds=['physical','digital','mixed'],method=k=>'mint'+k[0].toUpperCase()+k.slice(1);

describe('0.7 redesign-8 previewHash',()=>{
 let c,w;
 beforeEach(async()=>{w=await ethers.getSigners();c=await deploy('ObjectDigitalPassport');await register(c,w[0]);});
 it('places previewHash right after imageHash in the mint tuple and media view',async()=>{
  const names=x=>x.components.map(y=>y.name);
  expect(names(c.interface.getFunction('mintPhysical').inputs[0])).deep.eq(['core','dataHash','imageHash','previewHash','fileHash','anchorsHash','anchorTypesMask','editionCommitment']);
  expect(names(c.interface.getFunction('getPassportMedia').outputs[0])).deep.eq(['dataHash','imageHash','previewHash','fileHash','anchorsHash','anchorTypesMask','editionCommitment']);
  expect(c.interface.getEvent('PassportMinted').inputs.map(x=>x.name)).not.include('previewHash');
  expect(await c.CONTRACT_VERSION()).eq(7);
 });
 for(const kind of kinds){
  it(`${kind}: mints without a copy (previewHash zero)`,async()=>{
   const m=await inputs(kind,{imageHash:hash('image')}),p=await mint(c,w[0],kind,m);
   const v=await c.getPassportMedia(p);expect(v.previewHash).eq(Z);expect(v.imageHash).eq(hash('image'));expect(v.fileHash).eq(m.fileHash);
  });
  it(`${kind}: mints with a copy and returns it from getPassportMedia`,async()=>{
   const m=await inputs(kind,{imageHash:hash('image'),previewHash:hash('preview')}),p=await mint(c,w[0],kind,m);
   const v=await c.getPassportMedia(p);
   expect(v.previewHash).eq(hash('preview'));expect(v.imageHash).eq(hash('image'));
   expect(v.dataHash).eq(m.dataHash);expect(v.fileHash).eq(m.fileHash);expect(v.anchorsHash).eq(m.anchorsHash);
   expect(v.anchorTypesMask).eq(m.anchorTypesMask);expect(v.editionCommitment).eq(m.editionCommitment);
  });
  it(`${kind}: rejects a copy equal to the primary photo with EC(143)`,async()=>{
   await fails(c[method(kind)](await inputs(kind,{imageHash:hash('image'),previewHash:hash('image')}),op()),c,143);
  });
 }
 it('rejects a copy without a primary photo with EC(142); physical/mixed report the missing image first',async()=>{
  await fails(c.mintDigital(await inputs('digital',{previewHash:hash('preview')}),op()),c,142);
  for(const kind of ['physical','mixed'])await fails(c[method(kind)](await inputs(kind,{imageHash:Z,previewHash:hash('preview')}),op()),c,107);
  expect((await c.getPassportsByCreatorPaged(w[0].address,0,100))[1]).eq(0);
 });
 it('previewHash is bound into the mint operation digest',async()=>{
  const m=await inputs('physical',{previewHash:hash('preview')}),id=hash('preview-op');
  const r=await tx(c.mintPhysical(m,id)),pid=event(c,r,'PassportMinted').args.passportIdText;
  const ctx={chainId:(await ethers.provider.getNetwork()).chainId,registry:await c.getAddress(),issuer:w[0].address,objectType:'physical'};
  const stored=(await c.getMintOperation(w[0].address,id)).digest;
  expect(stored).eq(mintDigest({...ctx,mint:m}));expect(stored).not.eq(mintDigest({...ctx,mint:{...m,previewHash:Z}}));
  for(const previewHash of [Z,hash('other preview')])await expect(c.mintPhysical({...m,previewHash},id)).to.be.revertedWithCustomError(c,'MintOperationConflict').withArgs(id);
  await expect(c.mintPhysical(m,id)).to.be.revertedWithCustomError(c,'AlreadyCommitted').withArgs(id,pid);
  // The opposite direction: a zero-copy operation conflicts with a later copy.
  const plain=await inputs('physical'),id2=hash('plain-op');await tx(c.mintPhysical(plain,id2));
  await expect(c.mintPhysical({...plain,previewHash:hash('preview')},id2)).to.be.revertedWithCustomError(c,'MintOperationConflict').withArgs(id2);
 });
 it('reference document with a preview anchor mints and verifies end to end',async()=>{
  const d=JSON.parse(fs.readFileSync(new URL('../../../schema/examples/0.7/physical-preview.json',import.meta.url)));
  const b=await ethers.provider.getBlock('latest'),date=new Date(b.timestamp*1000),iso=date.toISOString().replace('.000Z','Z');
  d.registeredAt=b.timestamp;d.registration={utcIso8601:iso,localIso8601:iso.replace('Z','+00:00'),ianaTimeZone:'UTC'};d.year=date.getUTCFullYear();d.month=date.getUTCMonth()+1;
  d.anchors.find(a=>a.data?.role==='preview').hash='sha256:'+sha256(Buffer.from('public preview JPEG')).slice(2);
  const prepared=preparePassport(d,{issuer:w[0].address});
  const r=await tx(c.mintPhysical(prepared.mint,hash('doc-op'))),pid=event(c,r,'PassportMinted').args.passportIdText;
  const h=await c.getPassportHeader(pid),media=await c.getPassportMedia(pid),cl=await c.getPassportClassification(pid);
  expect(media.previewHash).eq(prepared.mint.previewHash);
  expect(verifyPassport(prepared.document,h,media,cl).integrity).eq(true);
  const noCopy=structuredClone(prepared.document);noCopy.anchors=noCopy.anchors.filter(a=>a.data?.role!=='preview');
  expect(()=>verifyPassport(noCopy,h,media,cl)).throws('Hash mismatch');
 });
 it('satellites decode the extended media view: statement journal, author attestation and edition units',async()=>{
  const m=await inputs('physical',{previewHash:hash('preview')}),pid=await mint(c,w[0],'physical',m);
  await register(c,w[2]);
  const s=await deploy('ODPStatementJournal',await c.getAddress());
  await tx(s.connect(w[2]).publishStatement(pid,2,hash('author'),0,hash('statement-op')));
  expect((await s.getStatement(1))[0].dataHash).eq(m.dataHash);
  const a=await deploy('ODPAuthorAttestation',await c.getAddress()),creatorId=await c.getCreatorByWallet(w[0].address);
  const domain={name:'Object Digital Passport',version:'1',chainId:(await ethers.provider.getNetwork()).chainId,verifyingContract:await a.getAddress()};
  const types={AuthorAttestation:[{name:'passportId',type:'string'},{name:'dataHash',type:'bytes32'},{name:'creatorId',type:'string'},{name:'authorSigner',type:'address'}]};
  await tx(a.attestAuthor(pid,w[2].address,await w[2].signTypedData(domain,types,{passportId:pid,dataHash:m.dataHash,creatorId,authorSigner:w[2].address})));
  expect((await a.getAuthorAttestation(pid)).attested).eq(true);
  // Edition units read anchorTypesMask and editionCommitment, which follow previewHash in the tuple.
  await register(c,w[1],'B');const u=await deploy('ODPEditionUnits',await c.getAddress()),nonce=hash('preview edition nonce');
  const ctx=editionContext((await ethers.provider.getNetwork()).chainId,await c.getAddress(),nonce);
  const units=Array.from({length:3},(_,i)=>deriveUnit(Buffer.alloc(32,9),ctx,i)),tree=treeOf(units.map((x,i)=>leafOf(i,x.wallet.address)));
  const commitment=await u.commitmentFor(w[1].address,tree.root,3,ethers.ZeroAddress,nonce);
  const ep=await mint(c,w[1],'physical',await inputs('physical',{anchorTypesMask:4111,editionCommitment:commitment,previewHash:hash('edition preview'),core:{editionModel:2}}));
  await tx(u.connect(w[1]).openEdition(ep,tree.root,3,ethers.ZeroAddress,nonce));
  expect((await u.getEdition(ep)).merkleRoot).eq(tree.root);
  await expect(u.connect(w[1]).openEdition(ep,tree.root,3,ethers.ZeroAddress,hash('wrong nonce'))).to.revert(ethers);
 });
});
