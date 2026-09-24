let operationSequence=0;
import { expect } from 'chai';
import { ethers, deploy, register, inputs, mint, hash, event, tx, fails, at } from './ODP07.test.js';
describe('0.7 statement lifecycle', () => {
 let c,s,w,pid;
 beforeEach(async()=>{w=await ethers.getSigners(); c=await deploy('ObjectDigitalPassport'); await register(c,w[0]); await register(c,w[1],'P'); await register(c,w[2]); pid=await mint(c,w[0]); s=await deploy('ODPStatementJournal',await c.getAddress());});
 it('author independently publishes; issuer cannot withdraw or replace their declaration',async()=>{
  await tx(s.connect(w[2]).publishStatement(pid,2,hash('author'),0,hash('operation-'+ ++operationSequence)));
  const [a,l]=await s.getStatement(1);expect(a.author).eq(w[2].address);expect(a.dataHash).eq(hash('data'));expect(l.status).eq(1);
  await expect(s.retractStatement(1,hash('r'))).to.be.revertedWithCustomError(s,'NotStatementAuthor');
  await expect(s.publishStatement(pid,2,hash('fake replacement'),1,hash('operation-'+ ++operationSequence))).to.be.revertedWithCustomError(s,'NotStatementAuthor');
 });
 it('replacements preserve history, require matching subject/kind, reject stale branches',async()=>{
  await tx(s.publishStatement(pid,1,hash('first'),0,hash('operation-'+ ++operationSequence)));
  await expect(s.publishStatement(pid,2,hash('wrong kind'),1,hash('operation-'+ ++operationSequence))).to.be.revertedWithCustomError(s,'StatementContextMismatch');
  const other=await mint(c,w[0]);await expect(s.publishStatement(other,1,hash('wrong subject'),1,hash('operation-'+ ++operationSequence))).to.be.revertedWithCustomError(s,'StatementContextMismatch');
  await tx(s.publishStatement(pid,1,hash('second'),1,hash('operation-'+ ++operationSequence)));
  const [old,state]=await s.getStatement(1);expect(old.payloadHash).eq(hash('first'));expect(state.status).eq(3);expect(state.successorId).eq(2);
  expect((await s.getStatement(2))[0].previousId).eq(1);
  await expect(s.publishStatement(pid,1,hash('third'),1,hash('operation-'+ ++operationSequence))).to.be.revertedWithCustomError(s,'StatementNotActive');
  await expect(s.retractStatement(1,hash('r'))).to.be.revertedWithCustomError(s,'StatementNotActive');
  expect(await s.statementCount()).eq(2);
 });
 it('withdrawal is author-only, once, and requires a nonzero reason',async()=>{
  await tx(s.connect(w[1]).publishStatement(pid,3,hash('assessment'),0,hash('operation-'+ ++operationSequence)));
  await expect(s.connect(w[2]).retractStatement(1,hash('foreign'))).to.be.revertedWithCustomError(s,'NotStatementAuthor');
  await expect(s.connect(w[1]).retractStatement(1,ethers.ZeroHash)).to.be.revertedWithCustomError(s,'InvalidStatement');
  await tx(s.connect(w[1]).retractStatement(1,hash('reason')));
  const [a,l]=await s.getStatement(1);expect(a.payloadHash).eq(hash('assessment'));expect(l.status).eq(2);expect(l.reasonHash).eq(hash('reason'));
  await expect(s.connect(w[1]).retractStatement(1,hash('r'))).to.be.revertedWithCustomError(s,'StatementNotActive');
 });
 it('issuer correction on revoked or old passport cannot change core',async()=>{
  await tx(c.revokePassport(pid,hash('revocation')));const before=await c.getPassportMedia(pid);
  await at((await c.getPassportClassification(pid)).timestamp+259201n);
  await tx(s.publishStatement(pid,1,hash('explanation'),0,hash('operation-'+ ++operationSequence)));
  expect(await c.getPassportMedia(pid)).deep.eq(before);expect((await c.getPassportClassification(pid)).revoked).eq(true);
  await fails(s.connect(w[1]).publishStatement(pid,3,hash('positive'),0,hash('operation-'+ ++operationSequence)),s,11);
  await fails(s.connect(w[2]).publishStatement(pid,2,hash('positive'),0,hash('operation-'+ ++operationSequence)),s,11);
  await expect(s.connect(w[1]).publishStatement(pid,1,hash('not issuer'),0,hash('operation-'+ ++operationSequence))).to.be.revertedWithCustomError(s,'NotStatementAuthor');
 });
 it('rejects missing subjects, unregistered authors, wrong roles and empty commitments',async()=>{
  await fails(s.connect(w[3]).publishStatement(pid,2,hash('a'),0,hash('operation-'+ ++operationSequence)),s,3);
  await fails(s.publishStatement('missing',1,hash('a'),0,hash('operation-'+ ++operationSequence)),s,12);
  await fails(s.publishStatement(pid,3,hash('a'),0,hash('operation-'+ ++operationSequence)),s,6);
  for(const [kind,h] of [[0,hash('a')],[2,ethers.ZeroHash]]) await expect(s.publishStatement(pid,kind,h,0,hash('operation-'+ ++operationSequence))).to.be.revertedWithCustomError(s,'InvalidStatement');
  await expect(s.getStatement(0)).to.be.revertedWithCustomError(s,'InvalidStatement');
  await expect(s.getStatement(1)).to.be.revertedWithCustomError(s,'InvalidStatement');
 });
 it('bounded history pagination includes retracted and replaced records',async()=>{
  for(let i=0;i<3;i++)await tx(s.publishStatement(pid,1,hash(String(i)),i,hash('operation-'+ ++operationSequence)));
  await tx(s.retractStatement(3,hash('r')));
  expect((await s.getStatementsForPassportPaged(pid,0,ethers.MaxUint256))[0]).deep.eq([1n,2n,3n]);
  expect((await s.getStatementsByAuthorPaged(w[0].address,1,1))[0]).deep.eq([2n]);
  expect((await s.getStatementsForPassportPaged(pid,ethers.MaxUint256,100))[0]).deep.eq([]);
  expect((await s.getStatementsForPassportPaged(pid,0,0))[1]).eq(3);
 });
 it('institution can withdraw an old proof after passport revocation',async()=>{
  const p=await deploy('ODPPassportProofRegistry',await c.getAddress()),m=await inputs();
  const receipt=await tx(p.connect(w[1]).submitProof(pid,hash('report'),'',m.core.year,m.core.month,hash('operation-'+ ++operationSequence)));const id=event(p,receipt,'ProofSubmitted').args.proofIdText;
  await expect(p.withdrawProof(id,hash('r'))).to.be.revertedWithCustomError(p,'InvalidProofWithdrawal');
  await tx(c.revokePassport(pid,hash('r')));
  await tx(p.connect(w[1]).withdrawProof(id,hash('withdrawal')));
  expect(await p.proofWithdrawnAt(id)).greaterThan(0);expect((await p.getProof(id)).documentHash).eq(hash('report'));
  await expect(p.connect(w[1]).withdrawProof(id,hash('again'))).to.be.revertedWithCustomError(p,'InvalidProofWithdrawal');
 });
 it('separate author signer withdraws one-shot consent without issuer authorization',async()=>{
  const a=await deploy('ODPAuthorAttestation',await c.getAddress());const creatorId=await c.getCreatorByWallet(w[0].address);
  const domain={name:'Object Digital Passport',version:'1',chainId:(await ethers.provider.getNetwork()).chainId,verifyingContract:await a.getAddress()};
  const types={AuthorAttestation:[{name:'passportId',type:'string'},{name:'dataHash',type:'bytes32'},{name:'creatorId',type:'string'},{name:'authorSigner',type:'address'}]};
  const sig=await w[2].signTypedData(domain,types,{passportId:pid,dataHash:hash('data'),creatorId,authorSigner:w[2].address});
  await tx(a.attestAuthor(pid,w[2].address,sig));
  await expect(a.withdrawAuthorAttestation(pid,hash('r'))).to.be.revertedWithCustomError(a,'InvalidAuthorWithdrawal');
  await tx(a.connect(w[2]).withdrawAuthorAttestation(pid,hash('r')));
  expect((await a.getAuthorAttestation(pid)).attested).eq(true);expect(await a.authorWithdrawalAt(pid)).greaterThan(0);
  await expect(a.connect(w[2]).withdrawAuthorAttestation(pid,hash('r'))).to.be.revertedWithCustomError(a,'InvalidAuthorWithdrawal');
 });
 it('contract-wallet caller can register, publish and retract without issuer permission',async()=>{
  const wallet=await deploy('ODPTestWallet'),address=await wallet.getAddress();
  const call=(target,name,args)=>wallet.execute(target.getAddress(),target.interface.encodeFunctionData(name,args));
  await tx(call(c,'registerCreator',['0x43']));
  await tx(call(s,'publishStatement',[pid,2,hash('smart wallet declaration'),0,hash('wallet operation')]));
  expect((await s.getStatement(1))[0].author).eq(address);
  await tx(call(s,'retractStatement',[1,hash('smart wallet withdrawal')]));
  expect((await s.getStatement(1))[1].status).eq(2);
 });
 it('seeded lifecycle sequence preserves terminal records and author isolation',async()=>{
  let seed=713, next=1;const expected=new Map();
  for(let i=0;i<40;i++){
   seed=(Math.imul(seed,1664525)+1013904223)>>>0;
   const owner=seed%3,actor=w[owner],kind=owner===0?1:owner===1?3:2;
   const own=[...expected].filter(([,x])=>x.owner===owner&&x.status===1);
   if(!own.length||seed%4===0){await tx(s.connect(actor).publishStatement(pid,kind,hash(String(i)),0,hash('operation-'+ ++operationSequence)));expected.set(next++,{owner,status:1,successor:0});}
   else {const [id,record]=own[seed%own.length];
    await expect(s.connect(w[(owner+1)%3]).retractStatement(id,hash('intruder'))).to.be.revertedWithCustomError(s,'NotStatementAuthor');
    if(seed%2){await tx(s.connect(actor).retractStatement(id,hash('withdraw')));record.status=2;}
    else{await tx(s.connect(actor).publishStatement(pid,kind,hash(String(i)),id,hash('operation-'+ ++operationSequence)));record.status=3;record.successor=next;expected.set(next++,{owner,status:1,successor:0});}
   }
   expect(await s.statementCount()).eq(next-1);
   for(const [id,x] of expected){const [a,l]=await s.getStatement(id);expect(a.author).eq(w[x.owner].address);expect(l.status).eq(x.status);expect(l.successorId).eq(x.successor);}
  }
 });

});
