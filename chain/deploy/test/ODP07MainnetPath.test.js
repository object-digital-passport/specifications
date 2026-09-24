import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {polygonHarness} from './helpers/polygon-harness.mjs';
import {deployGeneration} from '../scripts/deploy-generation.mjs';
import {preflightMainnet} from '../scripts/preflight-mainnet.mjs';
import {feeOverrides} from '../scripts/spend-policy.mjs';
import {releaseHash,roles} from '../scripts/release.mjs';
const release=JSON.parse(fs.readFileSync(new URL('../../../review/v07-abi8-release/release.json',import.meta.url)));

describe('Polygon137 complete deployment path over two local HTTP RPCs',function(){
 this.timeout(60000);
 let h,dir,options;
 beforeEach(async()=>{h=await polygonHarness();dir=fs.mkdtempSync(path.join(os.tmpdir(),'odp-polygon137-'));options={...h,release,approvedHash:releaseHash(release),chainId:'137',generationId:'LOCAL-137-NOT-MAINNET',manifestPath:path.join(dir,'manifest.json'),confirmations:1,expectedDeployer:await h.signer.getAddress(),spendPolicy:{gasLimits:Object.fromEntries(Object.keys(roles).map(n=>[n,'5000000'])),maxFeePerGas:'100000000000',maxPriorityFeePerGas:'1000000000',maxTotalFeeWei:'5000000000000000000'},finalityOptions:{timeoutMs:40,intervalMs:1}};});
 afterEach(async()=>{await h.close();fs.rmSync(dir,{recursive:true});});
 it('executes all ten pinned creations and finality/runtime checks through both HTTP providers',async()=>{
  const result=await deployGeneration(options);
  assert.equal(result.manifest.status,'complete');assert.equal(result.generation.chainId,'137');
  assert.equal(Object.keys(result.manifest.contracts).length,10);
  for(const entry of Object.values(result.manifest.contracts))assert.equal(entry.finality,'finalized-two-rpc');
  for(const observer of h.observers){assert.ok(observer.calls.includes('eth_getCode'));assert.ok(observer.calls.includes('eth_getTransactionReceipt'));}
  if(process.env.ODP_REHEARSAL_REPORT)fs.writeFileSync(process.env.ODP_REHEARSAL_REPORT,JSON.stringify({warning:'LOCAL SIMULATION ONLY; NOT POLYGON DEPLOYMENT',manifest:result.manifest},null,2));
  const nonce=await h.signer.getNonce();await deployGeneration({...options,resume:true});assert.equal(await h.signer.getNonce(),nonce);
 });
 for(const stage of ['planned','broadcast','pending','verified'])it(`resumes ${stage} failure on Polygon path without duplicate deployments`,async()=>{
  let saved;
  await assert.rejects(deployGeneration({...options,checkpoint:async(where,name,entry)=>{if(where===stage&&name==='ODPAuthorAttestation'){saved=structuredClone(entry);throw Error('simulated failure');}}}),/simulated failure/);
  const before=await h.signer.getNonce();
  const recoveryTransactions={};
  if(stage==='planned'||stage==='broadcast'){
   await assert.rejects(deployGeneration({...options,resume:true}),/Unresolved broadcast/);assert.equal(await h.signer.getNonce(),before);
   if(stage==='planned'){const tx=await h.signer.sendTransaction({data:saved.deploymentData,nonce:saved.nonce,...feeOverrides(options.spendPolicy,'ODPAuthorAttestation')});await tx.wait();saved.transactionHash=tx.hash;}
   recoveryTransactions.ODPAuthorAttestation=saved.transactionHash;
  }
  const result=await deployGeneration({...options,resume:true,recoveryTransactions});assert.equal(result.manifest.status,'complete');assert.equal(await h.signer.getNonce(),10);
 });
 it('refuses unsupported finality and mismatched chain before any transaction',async()=>{
  h.observers[1].finality='unsupported';await assert.rejects(deployGeneration(options),/Finalized RPC tag/);assert.equal(await h.signer.getNonce(),0);
  h.observers[1].finality='ready';await assert.rejects(deployGeneration({...options,chainId:'1'}),/Chain ID/);assert.equal(await h.signer.getNonce(),0);
 });
 it('secondary runtime mismatch interrupts and resumes only after agreement',async()=>{
  h.observers[1].fault=({method,result})=>method==='eth_getCode'?'0x00':result;
  await assert.rejects(deployGeneration(options),/runtime mismatch/);assert.equal(await h.signer.getNonce(),1);
  const interrupted=JSON.parse(fs.readFileSync(options.manifestPath));assert.equal(interrupted.status,'interrupted');assert.equal(fs.existsSync(options.manifestPath+'.generation.json'),false);
  h.observers[1].fault=null;await deployGeneration({...options,resume:true});assert.equal(await h.signer.getNonce(),10);
 });
 it('rechecks the first contract before completing when its evidence changes during the last deployment',async()=>{
  let core;
  await assert.rejects(deployGeneration({...options,checkpoint:async(stage,name,entry)=>{
   if(stage==='verified'&&name==='ObjectDigitalPassport')core=entry.address.toLowerCase();
   if(stage==='verified'&&name===Object.keys(roles).at(-1))h.observers[1].fault=({method,params,result})=>method==='eth_getCode'&&params[0].toLowerCase()===core?'0x00':result;
  }}),/runtime mismatch/);
  assert.equal(fs.existsSync(options.manifestPath+'.generation.json'),false);
 });
 it('halts on finality lag and resumes after both observers finalize',async()=>{
  h.observers[1].finality='lag';
  await assert.rejects(deployGeneration(options),/not finalized/);assert.equal(await h.signer.getNonce(),1);
  assert.equal(fs.existsSync(options.manifestPath+'.generation.json'),false);
  h.observers[1].finality='ready';await deployGeneration({...options,resume:true});assert.equal(await h.signer.getNonce(),10);
 });
 it('rejects consumed nonce from another transaction before the next creation',async()=>{
  await assert.rejects(deployGeneration({...options,checkpoint:async(stage,name)=>{
   if(stage==='verified'&&name==='ObjectDigitalPassport')await (await h.signer.sendTransaction({to:options.expectedDeployer,value:0})).wait();
  }}),/Unexpected pending\/consumed/);
  assert.equal(await h.signer.getNonce(),2);assert.equal(fs.existsSync(options.manifestPath+'.generation.json'),false);
 });
 it('rejects address, budget, gas estimate and insufficient balance before broadcast',async()=>{
  await assert.rejects(deployGeneration({...options,expectedDeployer:'0x'+'11'.repeat(20)}),/address confirmation/);
  await assert.rejects(deployGeneration({...options,spendPolicy:{...options.spendPolicy,maxTotalFeeWei:'1'}}),/approved budget/);
  const lowGas={...options.spendPolicy,gasLimits:{...options.spendPolicy.gasLimits,ObjectDigitalPassport:'21000'}};
  await assert.rejects(deployGeneration({...options,spendPolicy:lowGas}),/Gas estimate/);
  assert.deepEqual(JSON.parse(fs.readFileSync(options.manifestPath)).contracts,{});
  fs.unlinkSync(options.manifestPath);
  await h.connection.provider.request({method:'hardhat_setBalance',params:[options.expectedDeployer,'0x1']});
  await assert.rejects(deployGeneration(options),/Insufficient balance/);assert.equal(await h.signer.getNonce(),0);
 });
 it('rejects tampered plans and missing or noncanonical receipts on resume without further broadcasts',async()=>{
  await assert.rejects(deployGeneration({...options,checkpoint:async(stage)=>{if(stage==='verified')throw Error('stop after core');}}),/stop after core/);
  const original=fs.readFileSync(options.manifestPath),manifest=JSON.parse(original);
  manifest.contracts.ObjectDigitalPassport.nonce=3;fs.writeFileSync(options.manifestPath,JSON.stringify(manifest));
  await assert.rejects(deployGeneration({...options,resume:true}),/nonce sequence/);
  manifest.contracts.ObjectDigitalPassport.nonce=0;manifest.contracts.ObjectDigitalPassport.deploymentData='0x00';fs.writeFileSync(options.manifestPath,JSON.stringify(manifest));
  await assert.rejects(deployGeneration({...options,resume:true}),/creation data/);fs.writeFileSync(options.manifestPath,original);
  h.observers[0].fault=({method,result})=>method==='eth_getTransactionReceipt'?null:result;
  await assert.rejects(deployGeneration({...options,resume:true}),/Pending\/unknown/);
  h.observers[0].fault=({method,params,result})=>method==='eth_getBlockByNumber'&&params[0]==='0x1'?{...result,hash:'0x'+'11'.repeat(32)}:result;
  await assert.rejects(deployGeneration({...options,resume:true}),/Noncanonical/);assert.equal(await h.signer.getNonce(),1);
 });

 it('binds a read-only preflight to release, wallet, budget and predicted addresses',async()=>{
  options.spendPolicy.maxPriorityFeePerGas='100000000000';
  const report=await preflightMainnet({...options,providers:[h.provider,h.verificationProvider],deployer:options.expectedDeployer});
  assert.equal(Object.keys(report.predicted).length,10);assert.equal(report.observations[0].nonce,0);assert.equal(await h.signer.getNonce(),0);
  assert.ok(!h.observers.some(o=>o.calls.some(m=>m==='eth_sendTransaction'||m==='eth_sendRawTransaction')));
 });

});
