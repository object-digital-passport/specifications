let operationSequence=0;
import { expect } from 'chai';
import { ethers,deploy,register,inputs,mint,hash,tx,fails,at } from './ODP07.test.js';
import { deriveUnit,editionContext,treeOf,leafOf } from '../../tools/edition.mjs';

describe('0.7 additional adversarial boundaries',()=>{
 it('101 real concern raisers cannot create oversized pages or occupy each other slots',async function(){
  this.timeout(30000);const [issuer]=await ethers.getSigners(),c=await deploy('ObjectDigitalPassport');await register(c,issuer);const pid=await mint(c,issuer),s=await deploy('ODPPassportConcerns',await c.getAddress()),ids=[];
  for(let i=0;i<101;i++){
   const a=new ethers.Wallet(ethers.keccak256(ethers.toUtf8Bytes('public-test-only-institution-'+i)),ethers.provider);await ethers.provider.send('hardhat_setBalance',[a.address,'0x56BC75E2D63100000']);
   ids.push(await register(c,a,i%2?'M':'P'));await tx(s.connect(a).raiseConcern(pid,hash('explanation-'+i),''));
  }
  const [page,total]=await s.getConcernRaisersPaged(pid,0,ethers.MaxUint256);expect(page.length).eq(100);expect(total).eq(101);expect((await s.getConcernRaisersPaged(pid,100,100))[0]).deep.eq([ids[100]]);expect(await s.activeConcernCount(pid)).eq(101);
  expect((await s.getConcernRaisersPaged(pid,ethers.MaxUint256,ethers.MaxUint256))[0]).deep.eq([]);
 });
 it('Gregorian month rollover rejects stale documents while a freshly prepared one mints',async()=>{
  const [w]=await ethers.getSigners(),c=await deploy('ObjectDigitalPassport');await register(c,w);const old=await inputs();const b=await ethers.provider.getBlock('latest'),d=new Date(b.timestamp*1000);const next=Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)/1000;
  await at(next);await ethers.provider.send('evm_mine',[]);await fails(c.mintPhysical(old,ethers.hexlify(ethers.randomBytes(32))),c,68);await mint(c,w);
 });
 it('empty/max-length UTF-8 URL boundaries and missing-document semantics are enforced',async()=>{
  const [w,p]=await ethers.getSigners(),c=await deploy('ObjectDigitalPassport');await register(c,w);await register(c,p,'P');const pid=await mint(c,w),s=await deploy('ODPPassportProofRegistry',await c.getAddress()),m=await inputs();
  await fails(s.connect(p).submitProof(pid,ethers.ZeroHash,'x',m.core.year,m.core.month,hash('operation-'+ ++operationSequence)),s,5);
  await fails(s.connect(p).submitProof(pid,hash('d'),'я'.repeat(257),m.core.year,m.core.month,hash('operation-'+ ++operationSequence)),s,10);
  await tx(s.connect(p).submitProof(pid,hash('d'),'я'.repeat(256),m.core.year,m.core.month,hash('operation-'+ ++operationSequence)));await tx(c.revokePassport(pid,hash('r')));
  await fails(s.connect(p).submitProof(pid,ethers.ZeroHash,'',m.core.year,m.core.month,hash('operation-'+ ++operationSequence)),s,11);
 });
 it('author rejects high-s, wrong-v, wrong data and wrong passport signatures without occupying slot',async()=>{
  const [w,author]=await ethers.getSigners(),c=await deploy('ObjectDigitalPassport'),id=await register(c,w),pid=await mint(c,w),s=await deploy('ODPAuthorAttestation',await c.getAddress());
  const domain={name:'Object Digital Passport',version:'1',chainId:(await ethers.provider.getNetwork()).chainId,verifyingContract:await s.getAddress()},types={AuthorAttestation:[{name:'passportId',type:'string'},{name:'dataHash',type:'bytes32'},{name:'creatorId',type:'string'},{name:'authorSigner',type:'address'}]},value={passportId:pid,dataHash:hash('data'),creatorId:id,authorSigner:author.address};
  const sig=await author.signTypedData(domain,types,value),raw=ethers.getBytes(sig),high=raw.slice();high.fill(255,32,64);const wrongV=raw.slice();wrongV[64]=29;
  await fails(s.attestAuthor(pid,author.address,high),s,114);await fails(s.attestAuthor(pid,author.address,wrongV),s,114);
  for(const change of [{dataHash:hash('wrong')},{passportId:'ODP-2026-01-000000000'}])await fails(s.attestAuthor(pid,author.address,await author.signTypedData(domain,types,{...value,...change})),s,115);
  expect((await s.getAuthorAttestation(pid)).attested).eq(false);await tx(s.attestAuthor(pid,author.address,sig));
 });
 it('activation rejects high-s, invalid-v, overlong proof and another-chain signature',async()=>{
  const [w]=await ethers.getSigners(),c=await deploy('ObjectDigitalPassport');await register(c,w,'B');const s=await deploy('ODPEditionUnits',await c.getAddress()),nonce=hash('nonce'),chain=(await ethers.provider.getNetwork()).chainId;
  const unit=deriveUnit(Buffer.alloc(32,3),editionContext(chain,await c.getAddress(),nonce),0),tree=treeOf([leafOf(0,unit.wallet.address)]),pid=await mint(c,w,'physical',await inputs('physical',{core:{editionModel:2},anchorTypesMask:4111,editionCommitment:await s.commitmentFor(w.address,tree.root,1,ethers.ZeroAddress,nonce)}));await tx(s.openEdition(pid,tree.root,1,ethers.ZeroAddress,nonce));
  const sig=await unit.wallet.signMessage(ethers.getBytes(await s.activationPayloadHash(pid,0))),raw=ethers.getBytes(sig),high=raw.slice();high.fill(255,32,64);const badV=raw.slice();badV[64]=29;
  await fails(s.activate(pid,0,[],high),s,125);await fails(s.activate(pid,0,[],badV),s,125);await fails(s.activate(pid,0,Array(33).fill(hash('sibling')),sig),s,127);
  const other=ethers.solidityPackedKeccak256(['string','uint256','address','string','uint32'],['ODP-UNIT-ACTIVATE-v1',chain+1n,await s.getAddress(),pid,0]);await fails(s.activate(pid,0,[],await unit.wallet.signMessage(ethers.getBytes(other))),s,123);
  expect(await s.isActivated(pid,0)).eq(false);await tx(s.activate(pid,0,[],sig));
 });
 it('affiliation rechecks cycle at confirmation after the pending graph changes',async()=>{
  const w=await ethers.getSigners(),c=await deploy('ObjectDigitalPassport'),s=await deploy('ODPRegistryRelations',await c.getAddress()),a=await register(c,w[0],'B'),b=await register(c,w[1],'B');
  await tx(s.connect(w[0]).proposeAffiliation(b));await tx(s.connect(w[1]).proposeAffiliation(a));await tx(s.connect(w[0]).confirmAffiliation(b));
  await fails(s.connect(w[1]).confirmAffiliation(a),s,67);expect(await s.isAffiliationPending(b,a)).eq(true);
  await tx(s.connect(w[0]).detachAffiliation(b));await tx(s.connect(w[1]).confirmAffiliation(a));expect(await s.getAffiliatedParent(a)).eq(b);
 });
});
