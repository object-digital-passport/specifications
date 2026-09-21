import { expect } from 'chai';
import { ethers,deploy,register,inputs,mint,hash,tx,event } from './ODP07.test.js';

describe('0.7 measured registration costs',()=>{
 it('records gas for the new indexed concern model rather than reusing the legacy number',async()=>{
  const w=await ethers.getSigners(),c=await deploy('ObjectDigitalPassport');
  const registration=await tx(c.registerCreator('0x43'));const minted=await tx(c.mintPhysical(await inputs(),ethers.hexlify(ethers.randomBytes(32)))),pid=event(c,minted,'PassportMinted').args.passportIdText;
  await register(c,w[1],'P');await register(c,w[2],'M');const s=await deploy('ODPPassportConcerns',await c.getAddress());
  const first=await tx(s.connect(w[1]).raiseConcern(pid,hash('reason'),''));const second=await tx(s.connect(w[2]).raiseConcern(pid,hash('reason2'),''));const withdrawn=await tx(s.connect(w[1]).withdrawConcern(pid));const repeated=await tx(s.connect(w[1]).raiseConcern(pid,hash('new'),''));
  expect(await s.activeConcernCount(pid)).eq(2);expect(first.gasUsed).greaterThan(repeated.gasUsed);
  console.log('V07_GAS '+JSON.stringify({registration:String(registration.gasUsed),physicalMint:String(minted.gasUsed),firstConcern:String(first.gasUsed),secondRaiser:String(second.gasUsed),withdraw:String(withdrawn.gasUsed),reRaise:String(repeated.gasUsed)}));
 });
});
