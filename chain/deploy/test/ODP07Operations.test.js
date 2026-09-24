import {expect} from 'chai';
import {ethers,deploy,register,inputs,mint,hash,tx,event} from './ODP07.test.js';
import {statementDigest,proofDigest,mintDigest} from '../../tools/operations.mjs';
describe('0.7 append operation recovery',()=>{
 let c,s,p,w,pid,ctx;
 beforeEach(async()=>{w=await ethers.getSigners();c=await deploy('ObjectDigitalPassport');await register(c,w[0]);await register(c,w[1],'P');pid=await mint(c,w[0]);s=await deploy('ODPStatementJournal',await c.getAddress());p=await deploy('ODPPassportProofRegistry',await c.getAddress());ctx={chainId:(await ethers.provider.getNetwork()).chainId,registry:await c.getAddress(),passportId:pid};});
 it('reference mint digest matches the complete contract tuple',async()=>{
  const m=await inputs(),op=hash('digest-op');await tx(c.mintPhysical(m,op));
  expect((await c.getMintOperation(w[0].address,op)).digest).eq(mintDigest({...ctx,issuer:w[0].address,objectType:'physical',mint:m}));
 });
 it('statement replay resolves original after supersession and passport revoke',async()=>{
  const op=hash('op');await tx(s.publishStatement(pid,1,hash('payload'),0,op));
  const stored=await s.statementOperations(w[0].address,op);
  expect(stored.digest).eq(statementDigest({...ctx,satellite:await s.getAddress(),author:w[0].address,kind:1,payloadHash:hash('payload'),previousId:0}));
  await tx(s.publishStatement(pid,1,hash('replacement'),1,hash('replace')));await tx(c.revokePassport(pid,hash('r')));
  await expect(s.publishStatement(pid,1,hash('payload'),0,op)).to.be.revertedWithCustomError(s,'StatementAlreadyCommitted').withArgs(op,1);
  await expect(s.publishStatement(pid,1,hash('changed'),0,op)).to.be.revertedWithCustomError(s,'StatementOperationConflict');
  expect(await s.statementCount()).eq(2);
 });
 it('statement failed attempt does not reserve ID, callers and fresh IDs are independent',async()=>{
  const op=hash('op');await expect(s.publishStatement(pid,1,hash('payload'),0,ethers.ZeroHash)).to.be.revertedWithCustomError(s,'InvalidStatementOperation');
  await expect(s.publishStatement('missing',2,hash('payload'),0,op)).to.revert(ethers);
  expect((await s.statementOperations(w[0].address,op)).statementId).eq(0);
  await tx(s.publishStatement(pid,2,hash('payload'),0,op));await tx(s.connect(w[1]).publishStatement(pid,2,hash('payload'),0,op));await tx(s.publishStatement(pid,2,hash('payload'),0,hash('fresh')));
  expect(await s.statementCount()).eq(3);
 });
 it('proof replay resolves original after withdrawal, calendar rollover and revoke',async()=>{
  const m=await inputs(),op=hash('op'),args=[pid,hash('document'),'ipfs://report',m.core.year,m.core.month,op];
  const r=await tx(p.connect(w[1]).submitProof(...args));const id=event(p,r,'ProofSubmitted').args.proofIdText;
  expect((await p.proofOperations(w[1].address,op)).digest).eq(proofDigest({...ctx,satellite:await p.getAddress(),author:w[1].address,documentHash:args[1],documentUrl:args[2],year:args[3],month:args[4]}));
  await tx(p.connect(w[1]).withdrawProof(id,hash('withdraw')));await tx(c.revokePassport(pid,hash('r')));
  await ethers.provider.send('evm_increaseTime',[35*86400]);await ethers.provider.send('evm_mine',[]);
  await expect(p.connect(w[1]).submitProof(...args)).to.be.revertedWithCustomError(p,'ProofAlreadyCommitted').withArgs(op,id);
  const changed=[...args];changed[2]='other';await expect(p.connect(w[1]).submitProof(...changed)).to.be.revertedWithCustomError(p,'ProofOperationConflict');
  expect((await p.getProofsForPassportPaged(pid,0,100))[1]).eq(1);
 });
 it('proof failures reserve nothing and fresh operations deliberately allow repeated evidence',async()=>{
  const m=await inputs(),op=hash('op'),args=[pid,hash('document'),'',m.core.year,m.core.month];
  await expect(p.connect(w[1]).submitProof(...args,ethers.ZeroHash)).to.be.revertedWithCustomError(p,'InvalidProofOperation');
  await expect(p.submitProof(...args,op)).to.revert(ethers);
  expect((await p.proofOperations(w[0].address,op)).proofId).eq('');
  await tx(p.connect(w[1]).submitProof(...args,op));await tx(p.connect(w[1]).submitProof(...args,hash('fresh')));
  expect((await p.getProofsForPassportPaged(pid,0,100))[1]).eq(2);
 });
});
