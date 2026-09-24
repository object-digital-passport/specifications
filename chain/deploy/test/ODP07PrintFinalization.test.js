import {expect} from 'chai';
import {ethers,deploy,register,inputs,mint,hash,tx,fails,at,event} from './ODP07.test.js';

describe('ABI7 role windows and irreversible print finalization',()=>{
 for(const role of ['C','B','P','M']) for(const delta of [-1,0,1]) it(`${role} revocation at its deadline ${delta}`,async()=>{
  const [w]=await ethers.getSigners(),c=await deploy('ObjectDigitalPassport');await register(c,w,role);const p=await mint(c,w),v=await c.getPassportClassification(p),window=role==='C'?259200n:86400n;
  expect((await c.getPassportReleaseState(p)).revocationDeadline).eq(v.timestamp+window);
  await at(v.timestamp+window+BigInt(delta));
  if(delta>0)await fails(c.revokePassport(p,hash('reason')),c,132);else await tx(c.revokePassport(p,hash('reason')));
 });
 it('only issuer may finalize; missing/revoked passports fail and retry is idempotent',async()=>{
  const [issuer,other]=await ethers.getSigners(),c=await deploy('ObjectDigitalPassport');await register(c,issuer);await register(c,other,'P');const p=await mint(c,issuer),q=await mint(c,issuer);
  await fails(c.finalizePassportForPrint('missing'),c,12);await fails(c.getPassportReleaseState('missing'),c,12);await fails(c.connect(other).finalizePassportForPrint(p),c,17);
  const r=await tx(c.finalizePassportForPrint(p));expect(event(c,r,'PassportFinalizedForPrint').args.issuer).eq(issuer.address);const locked=await c.getPassportReleaseState(p);expect(locked.printFinalizedAt).gt(0n);
  const retry=await tx(c.finalizePassportForPrint(p));expect(event(c,retry,'PassportFinalizedForPrint')).eq(undefined);expect(await c.getPassportReleaseState(p)).deep.eq(locked);
  await fails(c.connect(other).finalizePassportForPrint(p),c,17);
  await expect(c.revokePassport(p,hash('reason'))).to.be.revertedWithCustomError(c,'PassportPrintFinalized');
  await tx(c.revokePassport(q,hash('reason')));await fails(c.finalizePassportForPrint(q),c,18);
 });
 it('finalization is per passport, preserves immutable bytes and remains possible after the window',async()=>{
  const [issuer]=await ethers.getSigners(),c=await deploy('ObjectDigitalPassport');await register(c,issuer,'B');const p=await mint(c,issuer),q=await mint(c,issuer),h=await c.getPassportHeader(p),v=await c.getPassportMedia(p);
  await tx(c.finalizePassportForPrint(p));await tx(c.revokePassport(q,hash('reason')));expect(await c.getPassportHeader(p)).deep.eq(h);expect(await c.getPassportMedia(p)).deep.eq(v);
  const z=await mint(c,issuer);await at((await c.getPassportReleaseState(z)).revocationDeadline+1n);await tx(c.finalizePassportForPrint(z));expect((await c.getPassportReleaseState(z)).printFinalizedAt).gt(0n);
 });
 for(const role of ['C','P','M']) it(`${role} cannot declare any nonunique model via any mint entrypoint without anchors`,async()=>{
  const [w]=await ethers.getSigners(),c=await deploy('ObjectDigitalPassport');await register(c,w,role);
  for(const kind of ['physical','digital','mixed']) for(const editionModel of [2,3,4])await fails(c['mint'+kind[0].toUpperCase()+kind.slice(1)](await inputs(kind,{core:{editionModel}}),ethers.hexlify(ethers.randomBytes(32))),c,121);
 });
 it('B may declare all models and a hosting delegate receives no finalization authority',async()=>{
  const [issuer,agent]=await ethers.getSigners(),c=await deploy('ObjectDigitalPassport');await register(c,issuer,'B');const hosting=await deploy('ODPHosting',await c.getAddress());
  const now=(await ethers.provider.getBlock('latest')).timestamp;await tx(hosting.delegatePublishing(agent.address,now+3600));
  for(const editionModel of [1,2,3,4]){const p=await mint(c,issuer,'physical',await inputs('physical',{core:{editionModel}}));await fails(c.connect(agent).finalizePassportForPrint(p),c,17);await tx(c.finalizePassportForPrint(p));}
 });
 it('print finalization does not prevent author withdrawal or journal lifecycle',async()=>{
  const [issuer,author]=await ethers.getSigners(),c=await deploy('ObjectDigitalPassport');const creatorId=await register(c,issuer);await register(c,author);const p=await mint(c,issuer),s=await deploy('ODPAuthorAttestation',await c.getAddress()),j=await deploy('ODPStatementJournal',await c.getAddress());
  const domain={name:'Object Digital Passport',version:'1',chainId:(await ethers.provider.getNetwork()).chainId,verifyingContract:await s.getAddress()},types={AuthorAttestation:[{name:'passportId',type:'string'},{name:'dataHash',type:'bytes32'},{name:'creatorId',type:'string'},{name:'authorSigner',type:'address'}]};
  await tx(s.attestAuthor(p,author.address,await author.signTypedData(domain,types,{passportId:p,dataHash:(await c.getPassportMedia(p)).dataHash,creatorId,authorSigner:author.address})));
  await tx(c.finalizePassportForPrint(p));await tx(s.connect(author).withdrawAuthorAttestation(p,hash('withdraw')));expect(await s.authorWithdrawalAt(p)).gt(0n);
  await tx(j.connect(author).publishStatement(p,2,hash('claim'),0,hash('claim-op')));await tx(j.connect(author).retractStatement(1,hash('withdraw')));expect((await j.getStatement(1))[1].status).eq(2n);
 });
});
