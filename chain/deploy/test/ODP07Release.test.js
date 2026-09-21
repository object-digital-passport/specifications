import {expect} from 'chai';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {deployGeneration} from '../scripts/deploy-generation.mjs';
import Ajv2020 from 'ajv/dist/2020.js';
import {ethers} from './ODP07.test.js';
import {buildRelease,releaseHash,roles,verifyDeployment,deploymentData,generationFromManifest} from '../scripts/release.mjs';
function releaseFixture() {
 const dir=new URL('../../artifacts/build-info/',import.meta.url);
 const files=fs.readdirSync(dir).filter(n=>n.endsWith('.json')&&!n.endsWith('.output.json'));
 const infos=files.map(n=>({path:new URL(n,dir),info:JSON.parse(fs.readFileSync(new URL(n,dir)))}));
 const found=infos.find(({info})=>Object.keys(roles).every(n=>Object.keys(info.input.sources).some(k=>k.endsWith('/'+n+'.sol')))&&Object.entries(info.input.sources).every(([n,s])=>fs.readFileSync(new URL('../../'+n.replace(/^project\//,''),import.meta.url),'utf8')===s.content));
 if(!found)throw new Error('A full current compile is required for release tests');
 const output=JSON.parse(fs.readFileSync(new URL(found.path.href.replace(/\.json$/,'.output.json')))).output;
 return buildRelease(found.info,output,{sourceCommit:'a'.repeat(40),compilerHash:'sha256:'+'b'.repeat(64),dependencyHash:'sha256:'+'c'.repeat(64)});
}
describe('0.7 pinned release verification',()=>{
 it('deploys all ten pinned factories and checks complete runtime including every immutable',async()=>{
  const release=releaseFixture(),[signer]=await ethers.getSigners(),chainId=String((await ethers.provider.getNetwork()).chainId);
  const manifest={generationId:'LOCAL-TEST-ONLY',releaseHash:releaseHash(release),chainId,deployer:signer.address,status:'in-progress',contracts:{}};
  for(const name of Object.keys(roles)) {
   const c=release.contracts[name],args=name==='ObjectDigitalPassport'?[]:[manifest.contracts.ObjectDigitalPassport.address],nonce=await signer.getNonce();
   const transaction=await signer.sendTransaction({data:await deploymentData(c,args),nonce});await transaction.wait();
   const entry={nonce,args,address:ethers.getCreateAddress({from:signer.address,nonce}),transactionHash:transaction.hash};
   Object.assign(entry,await verifyDeployment(ethers.provider,entry,c,{deployer:signer.address,chainId,registry:args[0]}));manifest.contracts[name]=entry;
  }
  expect(()=>generationFromManifest(manifest,release)).to.throw('Incomplete');manifest.status='complete';
  const generation=generationFromManifest(manifest,release);
  const schema=JSON.parse(fs.readFileSync(new URL('../../../schema/bundle-0.7/generation.schema.json',import.meta.url)));
  expect(new Ajv2020({strict:false}).compile(schema)(generation)).eq(true);expect(new Set(generation.satellites.map(s=>s.role)).size).eq(9);
  const entry=manifest.contracts.ODPAuthorAttestation,c=release.contracts.ODPAuthorAttestation,ctx={deployer:signer.address,chainId,registry:manifest.contracts.ObjectDigitalPassport.address};
  const wrap={getTransaction:(...a)=>ethers.provider.getTransaction(...a),getTransactionReceipt:(...a)=>ethers.provider.getTransactionReceipt(...a),getBlock:(...a)=>ethers.provider.getBlock(...a),getCode:async()=> '0x00'};
  let error;try{await verifyDeployment(wrap,entry,c,ctx);}catch(e){error=e;}expect(error?.message).eq('Deployment runtime mismatch');
  error=undefined;try{await verifyDeployment(ethers.provider,{...entry,args:[signer.address]},c,ctx);}catch(e){error=e;}expect(error?.message).eq('Deployment transaction mismatch');
  error=undefined;try{await verifyDeployment(ethers.provider,{...entry,transactionHash:undefined},c,ctx);}catch(e){error=e;}expect(error?.message).match(/Unresolved broadcast/);
  const changed=structuredClone(release);changed.contracts.ObjectDigitalPassport.bytecode+='00';expect(releaseHash(changed)).not.eq(releaseHash(release));
 });
 for(const crash of ['planned','broadcast','pending','verified']) it(`recovers ${crash} interruption without creating a second deployment`,async()=>{
  const release=releaseFixture(),[signer]=await ethers.getSigners();const dir=fs.mkdtempSync(path.join(os.tmpdir(),'odp-release-'));
  const options={provider:ethers.provider,signer,release,approvedHash:releaseHash(release),chainId:String((await ethers.provider.getNetwork()).chainId),generationId:'local-recovery',manifestPath:path.join(dir,'manifest.json'),confirmations:1};
  let saved;
  try {
   await assert.rejects(deployGeneration({...options,checkpoint:async(stage,name,entry)=>{if(stage===crash){saved=structuredClone(entry);throw new Error('simulated process failure');}}}),/simulated/);
   const before=await signer.getNonce();
   if(crash==='planned'||crash==='broadcast') {
    await assert.rejects(deployGeneration({...options,resume:true}),/Unresolved broadcast/);expect(await signer.getNonce()).eq(before);
    // A planned operation may be sent once by an explicitly authorized recovery flow.
    // Broadcast recovery uses the original transaction, never a second send.
    if(crash==='planned'){const sent=await signer.sendTransaction({data:saved.deploymentData,nonce:saved.nonce});await sent.wait();saved.transactionHash=sent.hash;}
    options.recoveryTransactions={ObjectDigitalPassport:saved.transactionHash};
   }
   const result=await deployGeneration({...options,resume:true});expect(result.manifest.status).eq('complete');
   const completedNonce=await signer.getNonce();
   const repeated=await deployGeneration({...options,resume:true});expect(repeated.generation).deep.eq(result.generation);expect(await signer.getNonce()).eq(completedNonce);
   expect(Object.keys(result.manifest.contracts)).length(10);
   await assert.rejects(deployGeneration({...options,resume:true,generationId:'wrong'}),/identity mismatch/);
   await assert.rejects(deployGeneration({...options,resume:true,approvedHash:'sha256:'+'0'.repeat(64)}),/Unapproved/);
   const file=options.manifestPath+'.generation.json';const candidate=JSON.parse(fs.readFileSync(file));candidate.generationId='tampered';fs.writeFileSync(file,JSON.stringify(candidate));
   await assert.rejects(deployGeneration({...options,resume:true}),/candidate mismatch/);expect(await signer.getNonce()).eq(completedNonce);
  } finally {fs.rmSync(dir,{recursive:true});}
 });

 it('refuses Polygon mainnet before sending when the second RPC is absent',async()=>{
  const release=releaseFixture();let touchedSigner=false;
  await assert.rejects(deployGeneration({provider:{getNetwork:async()=>({chainId:137n})},signer:{getAddress:async()=>{touchedSigner=true;throw Error('must not reach signer');}},release,approvedHash:releaseHash(release),chainId:'137',generationId:'guard-test',manifestPath:'/unused-mainnet-guard.json',confirmations:1}),/Independent Polygon/);
  expect(touchedSigner).eq(false);
 });

});
