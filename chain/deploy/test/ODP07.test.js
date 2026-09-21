let operationSequence=0;
import { expect } from 'chai';
import { network, artifacts } from 'hardhat';
import crypto from 'node:crypto';
const { ethers } = await network.connect();
const hash = s => ethers.sha256(ethers.toUtf8Bytes(s));
const Z = ethers.ZeroHash;
const A = ethers.ZeroAddress;
async function tx(p) { return (await p).wait(); }
function event(c, r, name) { return r.logs.map(l=>{try{return c.interface.parseLog(l)}catch{return null}}).find(x=>x?.name===name); }
async function deploy(name, ...args) { const c=await (await ethers.getContractFactory(name)).deploy(...args); await c.waitForDeployment(); return c; }
async function register(c,w,t='C') { await tx(c.connect(w).registerCreator(ethers.hexlify(ethers.toUtf8Bytes(t)))); return c.getCreatorByWallet(w.address); }
async function inputs(type='physical', overrides={}) {
 const b=await ethers.provider.getBlock('latest'),d=new Date(b.timestamp*1000);
 return { core:{year:d.getUTCFullYear(),month:d.getUTCMonth()+1,title:'Object',authorName:'Author',shortDescription:'Description',domain:'art',contentClass:1,lifecycleStatus:3,aiStatus:1,verificationMethod:1,editionModel:1,...overrides.core},
 editionCommitment:(overrides.anchorTypesMask&4096)?hash('test-only-unopened-edition'):Z,dataHash:hash('data'),imageHash:type==='digital'?Z:hash('image'),fileHash:type==='physical'?Z:hash('file'),anchorsHash:hash('anchors'),anchorTypesMask:type==='physical'?15:type==='digital'?32:47,...Object.fromEntries(Object.entries(overrides).filter(([k])=>k!=='core'))};
}
async function mint(c,w,type='physical',args=null,operationId=ethers.hexlify(ethers.randomBytes(32))) {
 const method='mint'+type[0].toUpperCase()+type.slice(1);
 const r=await tx(c.connect(w)[method](args??await inputs(type),operationId));
 return event(c,r,'PassportMinted').args.passportIdText;
}
async function at(t) { await ethers.provider.send('evm_setNextBlockTimestamp',[Number(t)]); }
async function fails(p,c,code) { await expect(p).to.be.revertedWithCustomError(c,'EC').withArgs(code); }
let c,w,id,pid;
beforeEach(async()=>{w=await ethers.getSigners();c=await deploy('ObjectDigitalPassport');id=await register(c,w[0]);pid=await mint(c,w[0]);});
describe('0.7 immutable core',()=>{
 it('has exact shared satellite ABI tuples',async()=>{
  const i=new ethers.Interface((await artifacts.readArtifact('IODPRegistry')).abi);
  for(const n of ['getCreator','getPassportHeader','getPassportMedia','getPassportClassification']) {
   expect(c.interface.getFunction(n).selector).eq(i.getFunction(n).selector);
   expect(c.interface.getFunction(n).outputs.map(x=>x.components.map(y=>y.format('full')))).deep.eq(i.getFunction(n).outputs.map(x=>x.components.map(y=>y.format('full'))));
  }
 });
 it('has no admin, external library, transfer, mutable card or callback entrypoints',async()=>{
  const a=await artifacts.readArtifact('ObjectDigitalPassport');expect(a.linkReferences).deep.eq({});
  for(const n of ['owner','freeze','governance','transferGovernance','transferPassport','recordPassportEvent','updatePassportUrls','setEditionUnits','mintUnitPassport','lockEditionRevocation','setExtensionRouter','setRelationsSatellite']) expect(c.interface.getFunction(n)).eq(null);
  expect((a.deployedBytecode.length-2)/2).lessThan(24577);
 });
 it('reads four-field profiles and unknown identities safely',async()=>{
  const r=await c.getCreator(id);expect(r.wallet).eq(w[0].address);expect(r.length).eq(4);
  expect(await c.passportExists(pid)).eq(true);expect(await c.passportExists('unknown')).eq(false);
  await fails(c.getPassportHeader('unknown'),c,12);await fails(c.getCreator('unknown'),c,2);
 });
 it('enforces profile type, permanent wallet registration and principal authorization',async()=>{
  await fails(c.registerCreator('0x43'),c,53);await fails(c.connect(w[1]).registerCreator('0x58'),c,54);
  await fails(c.connect(w[1]).mintPhysical(await inputs(),ethers.hexlify(ethers.randomBytes(32))),c,3);
 });
 for(const type of ['physical','digital','mixed']) it(`mints ${type} with immutable hashes, card and readable receipt`,async()=>{
  const m=await inputs(type);const p=await mint(c,w[0],type,m);const h=await c.getPassportHeader(p),v=await c.getPassportMedia(p);
  expect(h.title).eq(m.core.title);expect(h.creatorId).eq(id);expect(h.objectType).eq(type);expect(v.dataHash).eq(m.dataHash);expect(v.anchorsHash).eq(m.anchorsHash);
  expect(h.creator).eq(w[0].address);
 });
 it('rejects every invalid core enum and empty/oversized UTF-8 fields',async()=>{
  for(const [field,low,high,code] of [['contentClass',0,7,84],['lifecycleStatus',0,5,85],['aiStatus',0,4,86],['verificationMethod',0,6,87],['editionModel',0,5,88]])
   for(const value of [low,high])await fails(c.mintPhysical(await inputs('physical',{core:{[field]:value}}),ethers.hexlify(ethers.randomBytes(32))),c,code);
  for(const [field,value,code] of [['title','',91],['title','я'.repeat(65),92],['authorName','',99],['authorName','a'.repeat(129),100],['shortDescription','',101],['shortDescription','a'.repeat(257),102],['domain','a'.repeat(129),93]])
   await fails(c.mintPhysical(await inputs('physical',{core:{[field]:value}}),ethers.hexlify(ethers.randomBytes(32))),c,code);
 });
 it('checks hashes, required anchor masks and UTC',async()=>{
  for(const [over,code] of [[{dataHash:Z},30],[{anchorsHash:Z},103],[{anchorTypesMask:0},104],[{anchorTypesMask:1},105],[{imageHash:Z},107],[{fileHash:hash('x')},106],[{core:{year:2020}},68]])
   await fails(c.mintPhysical(await inputs('physical',over),ethers.hexlify(ethers.randomBytes(32))),c,code);
  await fails(c.mintDigital(await inputs('digital',{fileHash:Z}),ethers.hexlify(ethers.randomBytes(32))),c,29);
  await fails(c.mintMixed(await inputs('mixed',{anchorTypesMask:15}),ethers.hexlify(ethers.randomBytes(32))),c,105);
 });
 it('restricts edition anchor flags to B profiles',async()=>{
  await fails(c.mintPhysical(await inputs('physical',{anchorTypesMask:4111}),ethers.hexlify(ethers.randomBytes(32))),c,121);
  await register(c,w[1],'B');await mint(c,w[1],'physical',await inputs('physical',{anchorTypesMask:4111,core:{editionModel:2}}));
 });
 it('accepts issuer revocation at exactly 72h; requires nonzero reason and only once',async()=>{
  const t=(await c.getPassportClassification(pid)).timestamp;
  await fails(c.connect(w[1]).revokePassport(pid,hash('reason')),c,17);
  await fails(c.revokePassport(pid,Z),c,16);
  await at(t+259200n);await tx(c.revokePassport(pid,hash('reason')));
  const r=await c.getPassportClassification(pid);expect(r.revoked).eq(true);expect(r.revocationReasonHash).eq(hash('reason'));
  await fails(c.revokePassport(pid,hash('r')),c,18);
 });
 it('rejects revocation after 72h, including by deployer of another issuer',async()=>{
  const t=(await c.getPassportClassification(pid)).timestamp;await at(t+259201n);await fails(c.revokePassport(pid,hash('r')),c,132);
  await register(c,w[1]);const other=await mint(c,w[1]);await fails(c.revokePassport(other,hash('r')),c,17);
 });
 it('has no profile stop selector, event or field and rejects the retired selector',async()=>{
  expect(c.interface.getFunction('revokeCreator')).eq(null);expect(c.interface.getEvent('CreatorRevoked')).eq(null);
  const before=await c.getCreator(id);
  await expect(w[0].sendTransaction({to:await c.getAddress(),data:ethers.id('revokeCreator()').slice(0,10)})).to.revert(ethers);
  expect(await c.getCreator(id)).deep.eq(before);
  await mint(c,w[0]);await tx(c.revokePassport(pid,hash('r')));
 });
 it('safe paging handles zero, max uint, end and page cap',async()=>{
  const [all,total]=await c.getPassportsByCreatorPaged(w[0].address,0,ethers.MaxUint256);expect(total).eq(1);expect(all).deep.eq([pid]);
  for(const [o,l] of [[0,0],[1,100],[ethers.MaxUint256,ethers.MaxUint256]])expect((await c.getPassportsByCreatorPaged(w[0].address,o,l))[0].length).eq(0);
 });
 it('never invokes external code during mint (trace opcode assertion)',async()=>{
  const r=await tx(c.mintPhysical(await inputs(),ethers.hexlify(ethers.randomBytes(32))));const trace=await ethers.provider.send('debug_traceTransaction',[r.hash,{disableMemory:true,disableStorage:true,disableStack:true}]);
  expect(trace.structLogs.filter(x=>['CALL','CALLCODE','DELEGATECALL','STATICCALL'].includes(x.op))).deep.eq([]);
 });
});
describe('0.7 concerns',()=>{
 let s,p,m;
 beforeEach(async()=>{s=await deploy('ODPPassportConcerns',await c.getAddress());p=await register(c,w[1],'P');m=await register(c,w[2],'M');});
 it('independent P/M records, readable logs, withdraw/re-raise without duplicate indices',async()=>{
  const r=await tx(s.connect(w[1]).raiseConcern(pid,hash('one'),''));expect(event(s,r,'ConcernRaised').args.raisedByText).eq(p);
  await tx(s.connect(w[2]).raiseConcern(pid,hash('two'),'ipfs://reason'));expect(await s.activeConcernCount(pid)).eq(2);
  await fails(s.connect(w[1]).raiseConcern(pid,hash('3'),''),s,135);await tx(s.connect(w[1]).withdrawConcern(pid));
  expect(await s.activeConcernCount(pid)).eq(1);await tx(s.connect(w[1]).raiseConcern(pid,hash('new'),''));
  expect((await s.getConcernRaisersPaged(pid,0,ethers.MaxUint256))[0]).deep.eq([p,m]);expect((await s.getConcernsByRaiserPaged(p,0,100))[0]).deep.eq([pid]);
  expect((await s.getConcern(pid,p)).withdrawnAt).eq(0);expect((await s.getConcern(pid,id)).raisedBy).eq('');
 });
 it('validates existence, roles, hashes, size and missing/withdrawn state',async()=>{
  await fails(s.raiseConcern(pid,hash('r'),''),s,6);await fails(s.connect(w[1]).raiseConcern('missing',hash('r'),''),s,12);
  await fails(s.connect(w[1]).raiseConcern(pid,Z,''),s,133);await fails(s.connect(w[1]).raiseConcern(pid,hash('r'),'a'.repeat(513)),s,134);
  await fails(s.connect(w[1]).withdrawConcern(pid),s,136);await tx(s.connect(w[1]).raiseConcern(pid,hash('r'),''));await tx(s.connect(w[1]).withdrawConcern(pid));await fails(s.connect(w[1]).withdrawConcern(pid),s,136);
 });
 it('permits withdrawal and a new concern episode on a revoked passport',async()=>{
  await tx(c.revokePassport(pid,hash('r')));await tx(s.connect(w[1]).raiseConcern(pid,hash('r'),''));
  await tx(s.connect(w[1]).withdrawConcern(pid));expect(await s.activeConcernCount(pid)).eq(0);await tx(s.connect(w[1]).raiseConcern(pid,hash('r'),''));expect(await s.activeConcernCount(pid)).eq(1);
 });
 it('250 seeded state transitions preserve counter and unique index invariants',async()=>{
  let seed=0x41535452,states=[false,false],seen=[false,false];
  for(let i=0;i<250;i++){
   seed=(Math.imul(seed,1664525)+1013904223)>>>0;const a=(seed>>>16)&1,raise=!!(seed&8),who=w[a+1];
   if(raise){if(states[a])await fails(s.connect(who).raiseConcern(pid,hash('r'+i),''),s,135);else{await tx(s.connect(who).raiseConcern(pid,hash('r'+i),''));states[a]=seen[a]=true;}}
   else {if(!states[a])await fails(s.connect(who).withdrawConcern(pid),s,136);else{await tx(s.connect(who).withdrawConcern(pid));states[a]=false;}}
   expect(await s.activeConcernCount(pid)).eq(states.filter(Boolean).length);
   expect((await s.getConcernRaisersPaged(pid,0,100))[1]).eq(seen.filter(Boolean).length);
  }
 });
});
describe('0.7 hosting and directory',()=>{
 it('publishing permission is separate; expiry, replacement and revoke immediately apply',async()=>{
  const s=await deploy('ODPHosting',await c.getAddress());
  await fails(s.connect(w[1]).updateLocations(pid,'ipfs://x',''),s,137);
  const t=BigInt((await ethers.provider.getBlock('latest')).timestamp)+100n;await tx(s.delegatePublishing(w[2].address,t));
  await tx(s.connect(w[2]).updateLocations(pid,'ipfs://x',''));expect((await s.getLocations(pid)).dataUrl).eq('ipfs://x');
  await at(t);await fails(s.connect(w[2]).updateLocations(pid,'x',''),s,137);
  await tx(s.updateLocations(pid,'',''));await tx(s.delegatePublishing(w[2].address,t+100n));await tx(s.revokePublishing());await fails(s.connect(w[2]).updateLocations(pid,'x',''),s,137);
 });
 it('issuer can clear locations while immutable hashes stay fixed',async()=>{
  const s=await deploy('ODPHosting',await c.getAddress());const before=await c.getPassportMedia(pid);
  await fails(s.updateLocations(pid,'x'.repeat(513),''),s,138);await tx(s.updateLocations(pid,'https://example.test/a',''));
  expect(await c.getPassportMedia(pid)).deep.eq(before);await tx(s.updateLocations(pid,'',''));expect((await s.getLocations(pid)).dataUrl).eq('');expect(await c.getPassportMedia(pid)).deep.eq(before);
 });
 it('domain declarations enforce organisation role and canonical DNS syntax',async()=>{
  const s=await deploy('ODPProfileDirectory',await c.getAddress());await fails(s.setDomain('example.org'),s,71);const b=await register(c,w[1],'B');
  for(const d of ['https://a.test','UPPER.test','-a.test','a-.test','a..test','a.test.','я.test','a'.repeat(64)+'.test'])await fails(s.connect(w[1]).setDomain(d),s,139);
  await tx(s.connect(w[1]).setDomain('xn--e1afmkfd.xn--p1ai'));expect(await s.getDomain(b)).eq('xn--e1afmkfd.xn--p1ai');await tx(s.connect(w[1]).setDomain(''));
  await tx(s.connect(w[1]).setDomain('x.test'));
 });
});
describe('0.7 independent attestations and affiliation',()=>{
 it('proofs enforce P/M registration, passport state and paged access',async()=>{
  const s=await deploy('ODPPassportProofRegistry',await c.getAddress());const p=await register(c,w[1],'P');const m=await inputs();
  await fails(s.submitProof(pid,Z,'',m.core.year,m.core.month,hash('operation-'+ ++operationSequence)),s,6);
  const r=await tx(s.connect(w[1]).submitProof(pid,hash('report'),'ipfs://report',m.core.year,m.core.month,hash('operation-'+ ++operationSequence)));const prf=event(s,r,'ProofSubmitted').args.proofIdText;
  expect((await s.getProof(prf)).prover).eq(p);expect((await s.getProofsForPassportPaged(pid,0,ethers.MaxUint256))[0]).deep.eq([prf]);
  await tx(s.connect(w[1]).submitProof(pid,Z,'',m.core.year,m.core.month,hash('operation-'+ ++operationSequence)));
 });
 it('document anchors reject unregistered issuer and duplicates; scopes hash to wallet',async()=>{
  const s=await deploy('ODPWalletDocumentAnchor',await c.getAddress());await fails(s.connect(w[1]).attestExternalDocument(hash('doc'),''),s,3);
  await tx(s.attestExternalDocument(hash('doc'),''));await fails(s.attestExternalDocument(hash('doc'),''),s,52);await register(c,w[1]);await tx(s.connect(w[1]).attestExternalDocument(hash('doc'),''));
  await tx(s.attestExternalDocument(hash('new'),''));
 });
 it('author signature binds domain and exact passport, cannot be front-run or replayed',async()=>{
  const s=await deploy('ODPAuthorAttestation',await c.getAddress()),other=await deploy('ODPAuthorAttestation',await c.getAddress());
  const domain={name:'Object Digital Passport',version:'1',chainId:(await ethers.provider.getNetwork()).chainId,verifyingContract:await s.getAddress()};
  const types={AuthorAttestation:[{name:'passportId',type:'string'},{name:'dataHash',type:'bytes32'},{name:'creatorId',type:'string'},{name:'authorSigner',type:'address'}]};
  const value={passportId:pid,dataHash:hash('data'),creatorId:id,authorSigner:w[2].address},sig=await w[2].signTypedData(domain,types,value);
  expect(await s.hashAuthorAttestation(pid,value.dataHash,id,w[2].address)).eq(ethers.TypedDataEncoder.hash(domain,types,value));
  await fails(s.connect(w[1]).attestAuthor(pid,w[2].address,sig),s,112);await fails(other.attestAuthor(pid,w[2].address,sig),other,115);
  await tx(s.attestAuthor(pid,w[2].address,sig));expect((await s.getAuthorAttestation(pid)).authorSigner).eq(w[2].address);await fails(s.attestAuthor(pid,w[2].address,sig),s,111);
 });
 it('issuer cannot bind an author key without its signature',async()=>{
  const s=await deploy('ODPAuthorAttestation',await c.getAddress());await fails(s.attestAuthor(pid,w[2].address,'0x'),s,113);
 });
 it('affiliation handshake rejects cycles, is display-only, allows child to leave',async()=>{
  const s=await deploy('ODPRegistryRelations',await c.getAddress());const b=await register(c,w[1],'B'),m=await register(c,w[2],'M');
  await fails(s.proposeAffiliation(b),s,71);await tx(s.connect(w[1]).proposeAffiliation(m));await tx(s.connect(w[2]).confirmAffiliation(b));expect(await s.getAffiliatedParent(b)).eq(m);
  await fails(s.connect(w[2]).proposeAffiliation(b),s,67);const own=await mint(c,w[2]);expect((await c.getPassportHeader(own)).creatorId).eq(m);expect((await c.getPassportsByCreatorPaged(w[1].address,0,100))[1]).eq(0);
  await tx(s.connect(w[1]).leaveAffiliation());expect(await s.getAffiliatedParent(b)).eq('');
 });
 it('cancelled affiliation request cannot be confirmed',async()=>{
  const s=await deploy('ODPRegistryRelations',await c.getAddress());const b=await register(c,w[1],'B'),m=await register(c,w[2],'M');
  await tx(s.connect(w[1]).proposeAffiliation(m));await tx(s.connect(w[1]).cancelAffiliationRequest(m));await expect(s.connect(w[2]).confirmAffiliation(b)).to.revert(ethers);
 });
 for(const name of ['ODPEditionUnits','ODPPassportConcerns','ODPPassportProofRegistry','ODPHosting','ODPProfileDirectory','ODPAuthorAttestation','ODPRegistryRelations','ODPWalletDocumentAnchor','ODPStatementJournal'])
 it(`${name} rejects EOA registry and fits EIP-170`,async()=>{
  await expect((await ethers.getContractFactory(name)).deploy(w[1].address)).to.be.revertedWithCustomError(c,'EC').withArgs(140);
  const a=await artifacts.readArtifact(name);expect((a.deployedBytecode.length-2)/2).lessThan(24577);expect(a.linkReferences).deep.eq({});
 });
});
export {ethers,deploy,register,inputs,mint,hash,event,tx,fails,at};
