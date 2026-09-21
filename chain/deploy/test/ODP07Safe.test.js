import { expect } from 'chai';
import fs from 'node:fs';
import { ethers,deploy,inputs,hash,tx,fails,event } from './ODP07.test.js';

// SPEC §22.5 CA-5.6: one issuer profile = one Safe address with an M-of-N owner policy.
// Uses the canonical Safe v1.4.1 bytecode (fixture provenance inside the JSON); nothing is deployed publicly.
const SAFE=JSON.parse(fs.readFileSync(new URL('./fixtures/safe-1.4.1.json',import.meta.url)));
const A=ethers.ZeroAddress;
const SAFE_TX=[{name:'to',type:'address'},{name:'value',type:'uint256'},{name:'data',type:'bytes'},{name:'operation',type:'uint8'},{name:'safeTxGas',type:'uint256'},{name:'baseGas',type:'uint256'},{name:'gasPrice',type:'uint256'},{name:'gasToken',type:'address'},{name:'refundReceiver',type:'address'},{name:'nonce',type:'uint256'}];

async function safeFor(deployer,owners,threshold){
 const single=await (await new ethers.ContractFactory(SAFE.Safe.abi,SAFE.Safe.bytecode,deployer).deploy()).waitForDeployment();
 const factory=await (await new ethers.ContractFactory(SAFE.SafeProxyFactory.abi,SAFE.SafeProxyFactory.bytecode,deployer).deploy()).waitForDeployment();
 const init=single.interface.encodeFunctionData('setup',[owners.map(o=>o.address),threshold,A,'0x',A,A,0,A]);
 const r=await tx(factory.createProxyWithNonce(await single.getAddress(),init,0));
 return new ethers.Contract(event(factory,r,'ProxyCreation').args.proxy,SAFE.Safe.abi,deployer);
}
// Signs the SafeTx with each signer (EIP-712) and submits it; signatures must be sorted by owner address.
async function exec(safe,target,fn,args,signers,submitter=signers[0]){
 const data=target.interface.encodeFunctionData(fn,args),to=await target.getAddress(),nonce=await safe.nonce();
 const msg={to,value:0,data,operation:0,safeTxGas:0,baseGas:0,gasPrice:0,gasToken:A,refundReceiver:A,nonce};
 const domain={chainId:(await ethers.provider.getNetwork()).chainId,verifyingContract:await safe.getAddress()};
 const sorted=[...signers].sort((a,b)=>BigInt(a.address)<BigInt(b.address)?-1:1);
 const sigs=ethers.concat(await Promise.all(sorted.map(s=>s.signTypedData(domain,{SafeTx:SAFE_TX},msg))));
 return safe.connect(submitter).execTransaction(to,0,data,0,0,0,0,A,A,sigs);
}

describe('Safe 2-of-3 multisig as an ODP issuer (CA-5.6)',()=>{
 let w,c,safe,owners;
 beforeEach(async()=>{
  w=await ethers.getSigners();owners=w.slice(1,4);c=await deploy('ObjectDigitalPassport');
  safe=await safeFor(w[0],owners,2);
  await tx(exec(safe,c,'registerCreator',[ethers.hexlify(ethers.toUtf8Bytes('B'))],owners.slice(0,2)));
 });
 async function mintVia(signers,over={}){
  const r=await tx(exec(safe,c,'mintPhysical',[await inputs('physical',over),ethers.hexlify(ethers.randomBytes(32))],signers));
  return event(c,r,'PassportMinted').args.passportIdText;
 }

 it('registers one B profile on the Safe address; no owner key is an issuer',async()=>{
  const id=await c.getCreatorByWallet(await safe.getAddress());expect((await c.getCreator(id)).wallet).eq(await safe.getAddress());
  for(const o of owners)await fails(c.connect(o).mintPhysical(await inputs(),ethers.hexlify(ethers.randomBytes(32))),c,3);
 });
 it('one stolen owner key cannot mint, finalize or revoke through the Safe',async()=>{
  const p=await mintVia([owners[0],owners[2]]);
  await expect(exec(safe,c,'mintPhysical',[await inputs(),ethers.hexlify(ethers.randomBytes(32))],[owners[1]])).to.be.revertedWith('GS020');
  await expect(exec(safe,c,'finalizePassportForPrint',[p],[owners[1]])).to.be.revertedWith('GS020');
  await expect(exec(safe,c,'revokePassport',[p,hash('r')],[owners[1]])).to.be.revertedWith('GS020');
  expect((await c.getPassportClassification(p)).revoked).eq(false);
 });
 it('any two owners mint; the passport issuer is the Safe',async()=>{
  const p=await mintVia([owners[1],owners[2]]);expect((await c.getPassportHeader(p)).creator).eq(await safe.getAddress());
 });
 it('two owners finalize for print; revocation afterwards fails inside the Safe',async()=>{
  const p=await mintVia(owners.slice(0,2));await tx(exec(safe,c,'finalizePassportForPrint',[p],owners.slice(0,2)));
  expect((await c.getPassportReleaseState(p)).printFinalizedAt).gt(0n);
  await expect(exec(safe,c,'revokePassport',[p,hash('r')],owners.slice(1,3))).to.be.revertedWith('GS013');
  expect((await c.getPassportClassification(p)).revoked).eq(false);
 });
 it('two owners revoke within the 24h B window',async()=>{
  const p=await mintVia(owners.slice(0,2));await tx(exec(safe,c,'revokePassport',[p,hash('reason')],[owners[0],owners[2]]));
  expect((await c.getPassportClassification(p)).revoked).eq(true);
 });
 it('two owners open an edition committed to the Safe address',async()=>{
  const s=await deploy('ODPEditionUnits',await c.getAddress()),root=hash('root'),nonce=hash('nonce'),issuer=await safe.getAddress();
  const p=await mintVia(owners.slice(0,2),{anchorTypesMask:4111,editionCommitment:await s.commitmentFor(issuer,root,3,A,nonce),core:{editionModel:2}});
  await expect(exec(safe,s,'openEdition',[p,root,3,A,nonce],[owners[0]])).to.be.revertedWith('GS020');
  await tx(exec(safe,s,'openEdition',[p,root,3,A,nonce],owners.slice(1,3)));
  const e=await s.getEdition(p);expect(e.open).eq(true);expect(e.merkleRoot).eq(root);
 });
});

for(const role of ['P','M']) describe(`Safe 2-of-3 multisig as an ${role} institution (CA-5.7)`,()=>{
 it('registers, mints, finalizes, submits and withdraws a proof, declares a domain — each only with two owners',async()=>{
  const w=await ethers.getSigners(),owners=w.slice(1,4),c=await deploy('ObjectDigitalPassport'),safe=await safeFor(w[0],owners,2),addr=await safe.getAddress();
  await expect(exec(safe,c,'registerCreator',[ethers.hexlify(ethers.toUtf8Bytes(role))],[owners[0]])).to.be.revertedWith('GS020');
  await tx(exec(safe,c,'registerCreator',[ethers.hexlify(ethers.toUtf8Bytes(role))],owners.slice(0,2)));
  const id=await c.getCreatorByWallet(addr);expect(id.startsWith(role)).eq(true);
  const own=event(c,await tx(exec(safe,c,'mintPhysical',[await inputs(),ethers.hexlify(ethers.randomBytes(32))],owners.slice(1,3))),'PassportMinted').args.passportIdText;
  await tx(exec(safe,c,'finalizePassportForPrint',[own],owners.slice(0,2)));expect((await c.getPassportReleaseState(own)).printFinalizedAt).gt(0n);
  await tx(c.connect(w[4]).registerCreator(ethers.hexlify(ethers.toUtf8Bytes('C'))));
  const other=event(c,await tx(c.connect(w[4]).mintPhysical(await inputs(),ethers.hexlify(ethers.randomBytes(32)))),'PassportMinted').args.passportIdText;
  const proofs=await deploy('ODPPassportProofRegistry',await c.getAddress()),m=await inputs(),args=[other,hash('report'),'ipfs://report',m.core.year,m.core.month,hash('op-'+role)];
  await expect(exec(safe,proofs,'submitProof',args,[owners[2]])).to.be.revertedWith('GS020');
  const prf=event(proofs,await tx(exec(safe,proofs,'submitProof',args,[owners[0],owners[2]])),'ProofSubmitted').args.proofIdText;
  expect((await proofs.getProof(prf)).prover).eq(id);
  await expect(exec(safe,proofs,'withdrawProof',[prf,hash('mistake')],[owners[1]])).to.be.revertedWith('GS020');
  await tx(exec(safe,proofs,'withdrawProof',[prf,hash('mistake')],owners.slice(1,3)));expect(await proofs.proofWithdrawnAt(prf)).gt(0n);
  const dir=await deploy('ODPProfileDirectory',await c.getAddress());
  await expect(exec(safe,dir,'setDomain',['museum.example'],[owners[0]])).to.be.revertedWith('GS020');
  await tx(exec(safe,dir,'setDomain',['museum.example'],owners.slice(0,2)));
  for(const o of owners)await fails(proofs.connect(o).submitProof(...args.slice(0,5),hash('direct')),proofs,3);
 });
});
