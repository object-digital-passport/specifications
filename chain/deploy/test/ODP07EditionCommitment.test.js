import { expect } from 'chai';
import { ethers,deploy,register,inputs,mint,hash,tx } from './ODP07.test.js';
import { editionCommitment } from '../../tools/edition-commitment.mjs';

describe('0.7 edition commitment enforced across core and satellite',()=>{
 let c,s,w,nonce,root,count,signer,commit,pid;
 beforeEach(async()=>{
  w=await ethers.getSigners();c=await deploy('ObjectDigitalPassport');await register(c,w[0],'B');
  s=await deploy('ODPEditionUnits',await c.getAddress());nonce=hash('run-1');root=hash('test-root');count=10;signer=w[2].address;
  commit=await s.commitmentFor(w[0].address,root,count,signer,nonce);
  pid=await mint(c,w[0],'physical',await inputs('physical',{core:{editionModel:2},anchorTypesMask:4111,editionCommitment:commit}));
 });
 it('matches independent JS typed encoding and persists the commitment in the core',async()=>{
  const context={chainId:(await ethers.provider.getNetwork()).chainId,registry:await c.getAddress(),issuer:w[0].address,satellite:await s.getAddress(),editionNonce:nonce,merkleRoot:root,unitCount:count,labelSigner:signer};
  expect(editionCommitment(context)).eq(commit);expect((await c.getPassportMedia(pid)).editionCommitment).eq(commit);
  for(const change of [{chainId:context.chainId+1n},{registry:w[3].address},{issuer:w[3].address},{satellite:w[3].address}])expect(editionCommitment({...context,...change})).not.eq(commit);
 });
 it('rejects each mismatched parameter without occupying the slot or nonce',async()=>{
  const variants=[[hash('other'),count,signer,nonce],[root,count+1,signer,nonce],[root,count,w[3].address,nonce],[root,count,signer,hash('other-nonce')]];
  for(const v of variants)await expect(s.openEdition(pid,...v)).to.be.revertedWithCustomError(s,'EditionCommitmentMismatch');
  expect((await s.getEdition(pid)).open).eq(false);expect(await s.editionPassportByNonce(w[0].address,nonce)).eq('');
  await tx(s.openEdition(pid,root,count,signer,nonce));expect(await s.editionPassportByNonce(w[0].address,nonce)).eq(pid);
 });
 it('binds the satellite address and issuer, including malicious copied commitments',async()=>{
  const other=await deploy('ODPEditionUnits',await c.getAddress());await expect(other.openEdition(pid,root,count,signer,nonce)).to.be.revertedWithCustomError(other,'EditionCommitmentMismatch');
  await register(c,w[1],'B');const copy=await mint(c,w[1],'physical',await inputs('physical',{core:{editionModel:2},anchorTypesMask:4111,editionCommitment:commit}));
  await expect(s.connect(w[1]).openEdition(copy,root,count,signer,nonce)).to.be.revertedWithCustomError(s,'EditionCommitmentMismatch');
 });
 it('prevents one issuer nonce opening twice under different passports, even after revocation',async()=>{
  await tx(s.openEdition(pid,root,count,signer,nonce));await tx(c.revokePassport(pid,hash('withdraw')));
  const copy=await mint(c,w[0],'physical',await inputs('physical',{core:{editionModel:2},anchorTypesMask:4111,editionCommitment:commit}));
  await expect(s.openEdition(copy,root,count,signer,nonce)).to.be.revertedWithCustomError(s,'EditionNonceAlreadyUsed').withArgs(pid);
  expect((await s.getEdition(copy)).open).eq(false);
  // A reprint uses a fresh nonce and key set, as well as a fresh passport.
  const nextNonce=hash('run-2'),nextRoot=hash('new-key-set'),nextCommit=await s.commitmentFor(w[0].address,nextRoot,count,signer,nextNonce);
  const next=await mint(c,w[0],'physical',await inputs('physical',{core:{editionModel:2},anchorTypesMask:4111,editionCommitment:nextCommit}));
  await tx(s.openEdition(next,nextRoot,count,signer,nextNonce));expect(await s.editionPassportByNonce(w[0].address,nextNonce)).eq(next);
 });
 it('does not let a different issuer reserve another issuer nonce',async()=>{
  await register(c,w[1],'B');const theirs=await s.commitmentFor(w[1].address,root,count,signer,nonce);
  const other=await mint(c,w[1],'physical',await inputs('physical',{core:{editionModel:2},anchorTypesMask:4111,editionCommitment:theirs}));
  await tx(s.connect(w[1]).openEdition(other,root,count,signer,nonce));await tx(s.openEdition(pid,root,count,signer,nonce));
  expect(await s.editionPassportByNonce(w[0].address,nonce)).eq(pid);expect(await s.editionPassportByNonce(w[1].address,nonce)).eq(other);
 });
 it('requires commitment exactly for unit-key anchors, and a supported edition model',async()=>{
  const request=hash('invalid-mint');
  await expect(c.mintPhysical(await inputs('physical',{editionCommitment:commit}),request)).to.be.revertedWithCustomError(c,'InvalidEditionCommitment');
  await expect(c.mintPhysical(await inputs('physical',{core:{editionModel:2},anchorTypesMask:4111,editionCommitment:ethers.ZeroHash}),request)).to.be.revertedWithCustomError(c,'InvalidEditionCommitment');
  await expect(c.mintPhysical(await inputs('physical',{core:{editionModel:1},anchorTypesMask:4111,editionCommitment:commit}),request)).to.be.revertedWithCustomError(c,'EC').withArgs(122);
  expect((await c.getMintOperation(w[0].address,request)).passportId).eq('');
 });
});
