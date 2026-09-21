import { expect } from 'chai';
import { ethers,deploy,register,inputs,mint,hash,tx,event,at } from './ODP07.test.js';

describe('0.7 direct issuance and durable operation identity',()=>{
 let c,issuer,other,m,op;
 beforeEach(async()=>{[issuer,other]=await ethers.getSigners();c=await deploy('ObjectDigitalPassport');await register(c,issuer);m=await inputs();op=hash('operation-1');});
 it('removes every mint-agent permission and records only the calling profile',async()=>{
  for(const name of ['requestMintAgentRole','cancelMintAgentRequest','confirmMintAgentRole','revokeMintAgentRole','renounceMintAgentRole','mintAgentForCreator','mintAgentRequestPending'])expect(c.interface.getFunction(name)).eq(null);
  expect(c.interface.getEvent('MintAgentUpdate')).eq(null);
  const otherId=await register(c,other),pid=await mint(c,other,'physical',m,op),header=await c.getPassportHeader(pid);
  expect(header.creator).eq(other.address);expect(header.creatorId).eq(otherId);
  expect((await c.getPassportsByCreatorPaged(issuer.address,0,100))[1]).eq(0);
 });
 it('rejects old on-behalf mint calldata instead of interpreting it as a new operation',async()=>{
  const tuple=c.interface.getFunction('mintPhysical').inputs[0].format('full');
  const old=new ethers.Interface([`function mintPhysical(${tuple},string principal)`]);
  const data=old.encodeFunctionData('mintPhysical',[m,await c.getCreatorByWallet(issuer.address)]);
  await expect(other.sendTransaction({to:await c.getAddress(),data})).to.revert(ethers);
  expect((await c.getPassportsByCreatorPaged(issuer.address,0,100))[1]).eq(0);
 });
 it('reports the existing ID for exact replay, including after revocation and month rollover',async()=>{
  const receipt=await tx(c.mintPhysical(m,op)),pid=event(c,receipt,'PassportMinted').args.passportIdText;
  expect(event(c,receipt,'PassportMinted').args.operationId).eq(op);
  const recorded=await c.getMintOperation(issuer.address,op);expect(recorded.passportId).eq(pid);expect(recorded.digest).not.eq(ethers.ZeroHash);
  expect(event(c,receipt,'MintOperationCommitted').args.digest).eq(recorded.digest);
  await expect(c.mintPhysical(m,op)).to.be.revertedWithCustomError(c,'AlreadyCommitted').withArgs(op,pid);
  await tx(c.revokePassport(pid,hash('withdraw')));
  await expect(c.mintPhysical(m,op)).to.be.revertedWithCustomError(c,'AlreadyCommitted').withArgs(op,pid);
  expect((await c.getPassportsByCreatorPaged(issuer.address,0,100))[1]).eq(1);
 });
 it('binds every mint field and the entrypoint to the operation',async()=>{
  await tx(c.mintPhysical(m,op));
  const changes=[];
  for(const [k,v] of Object.entries(m.core))changes.push({...m,core:{...m.core,[k]:typeof v==='string'?v+'x':Number(v)+1}});
  for(const k of ['dataHash','imageHash','fileHash','anchorsHash','editionCommitment'])changes.push({...m,[k]:hash('changed-'+k)});
  changes.push({...m,anchorTypesMask:m.anchorTypesMask+1});
  for(const next of changes)await expect(c.mintPhysical(next,op)).to.be.revertedWithCustomError(c,'MintOperationConflict').withArgs(op);
  for(const kind of ['mintDigital','mintMixed'])await expect(c[kind](m,op)).to.be.revertedWithCustomError(c,'MintOperationConflict').withArgs(op);
  expect((await c.getPassportsByCreatorPaged(issuer.address,0,100))[1]).eq(1);
 });
 it('does not reserve an operation on a failed mint, and rejects zero operation IDs',async()=>{
  await expect(c.mintPhysical(m,ethers.ZeroHash)).to.be.revertedWithCustomError(c,'InvalidOperationId');
  await expect(c.mintPhysical({...m,dataHash:ethers.ZeroHash},op)).to.be.revertedWithCustomError(c,'EC').withArgs(30);
  expect((await c.getMintOperation(issuer.address,op)).passportId).eq('');
  await tx(c.mintPhysical(m,op));expect((await c.getMintOperation(issuer.address,op)).passportId).not.eq('');
 });
 it('scopes operation IDs to issuer and registry, without reserving global document hashes',async()=>{
  await register(c,other);const p1=await mint(c,issuer,'physical',m,op),p2=await mint(c,other,'physical',m,op);
  expect(p1).not.eq(p2);
  expect((await c.getMintOperation(issuer.address,op)).digest).not.eq((await c.getMintOperation(other.address,op)).digest);
  const c2=await deploy('ObjectDigitalPassport');await register(c2,issuer);await tx(c2.mintPhysical(m,op));
  expect((await c2.getMintOperation(issuer.address,op)).digest).not.eq((await c.getMintOperation(issuer.address,op)).digest);
  await tx(c.mintPhysical(m,hash('intentional-second-operation')));
 });
 it('recovers after a month rollover without re-preparing the committed document',async()=>{
  const pid=await mint(c,issuer,'physical',m,op),d=new Date((await ethers.provider.getBlock('latest')).timestamp*1000);
  await at(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)/1000);await ethers.provider.send('evm_mine',[]);
  await expect(c.mintPhysical(m,op)).to.be.revertedWithCustomError(c,'AlreadyCommitted').withArgs(op,pid);
 });
 it('two pending transactions for one operation cannot create two passports',async()=>{
  await ethers.provider.send('evm_setAutomine',[false]);
  let first,second;
  try{
   const nonce=await issuer.getNonce('pending');
   first=await c.mintPhysical(m,op,{nonce,gasLimit:1500000});
   second=await c.mintPhysical(m,op,{nonce:nonce+1,gasLimit:1500000});
   await ethers.provider.send('evm_mine',[]);
  }finally{await ethers.provider.send('evm_setAutomine',[true]);}
  expect((await ethers.provider.getTransactionReceipt(first.hash)).status).eq(1);
  expect((await ethers.provider.getTransactionReceipt(second.hash)).status).eq(0);
  expect((await c.getPassportsByCreatorPaged(issuer.address,0,100))[1]).eq(1);
 });
});
