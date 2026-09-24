/** Deployment state machine. Caller supplies an explicitly authorized signer/provider. */
import fs from 'node:fs';
import path from 'node:path';
import {validateSpendPolicy,feeOverrides,checkRemainingBudget} from './spend-policy.mjs';
import {waitForFinality} from './finality.mjs';
import {getCreateAddress} from 'ethers';
import {parseJSONBytes,canonicalize} from '../../tools/canonical.mjs';
import {roles,releaseHash,deploymentData,verifyDeployment,generationFromManifest} from './release.mjs';
function atomicWrite(file,value) {
 const temporary=file+'.tmp',fd=fs.openSync(temporary,'w',0o600);
 try {fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 fs.renameSync(temporary,file);
 const parent=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(parent);}finally{fs.closeSync(parent);}
}
export async function deployGeneration({provider,verificationProvider,signer,release,approvedHash,chainId,generationId,manifestPath:file,resume=false,recoveryTransactions={},confirmations,expectedDeployer,spendPolicy,finalityOptions,checkpoint=async()=>{}}) {
 if(!file||!generationId||!Number.isSafeInteger(confirmations)||confirmations<1)throw new Error('Manifest, generation and positive confirmation count required');
 if(release.format!=='odp-release-0.7'||release.abiGeneration!=='0.7-redesign-8'||releaseHash(release)!==approvedHash)throw new Error('Unapproved release bundle');
 if(String((await provider.getNetwork()).chainId)!==String(chainId))throw new Error('Chain ID confirmation mismatch');
 const mainnet=String(chainId)==='137';
 if(mainnet){
  if(!verificationProvider||verificationProvider===provider||String((await verificationProvider.getNetwork()).chainId)!=='137')throw new Error('Independent Polygon verification RPC required');
  // Detect unsupported finality before sending anything.
  for(const rpc of [provider,verificationProvider])if(!await rpc.getBlock('finalized'))throw new Error('Finalized RPC tag required');
 }
 const deployer=await signer.getAddress();chainId=String(chainId);
 const policy=mainnet?validateSpendPolicy(spendPolicy):null;
 if(mainnet&&deployer.toLowerCase()!==expectedDeployer?.toLowerCase())throw new Error('Explicit deployer address confirmation mismatch');
 fs.mkdirSync(path.dirname(file),{recursive:true});const lock=fs.openSync(file+'.lock','wx',0o600);
 try {
  const exists=fs.existsSync(file);if(exists&&!resume)throw new Error('Existing manifest requires explicit resume');
  const manifest=exists?parseJSONBytes(fs.readFileSync(file)):{format:'odp-deployment-0.7',generationId,chainId,deployer,releaseHash:approvedHash,confirmations,spendPolicy:policy,startNonce:await signer.getNonce('pending'),status:'in-progress',contracts:{}};
  if(manifest.format!=='odp-deployment-0.7'||manifest.generationId!==generationId||manifest.chainId!==chainId||manifest.deployer!==deployer||manifest.releaseHash!==approvedHash||manifest.confirmations!==confirmations)throw new Error('Resume identity mismatch');
  if(!Number.isSafeInteger(manifest.startNonce)||manifest.startNonce<0||canonicalize(manifest.spendPolicy)!==canonicalize(policy))throw new Error('Resume nonce/policy mismatch');
  const save=()=>atomicWrite(file,manifest);
  // Existing entries must be a prefix of the fixed roster. Never fill gaps around unknown transactions.
  const names=Object.keys(roles),present=Object.keys(manifest.contracts);
  if(present.some((name,i)=>name!==names[i]))throw new Error('Invalid manifest contract roster');
  if(Object.keys(recoveryTransactions).some(n=>!Object.hasOwn(manifest.contracts,n)))throw new Error('Recovery hash has no planned operation');
  async function verify(name,entry) {
   const args=name==='ObjectDigitalPassport'?[]:[manifest.contracts.ObjectDigitalPassport?.address];
   if(JSON.stringify(entry.args)!==JSON.stringify(args))throw new Error('Constructor pin mismatch');
   if(entry.nonce!==manifest.startNonce+names.indexOf(name))throw new Error('Planned nonce sequence mismatch');
   if(entry.deploymentData!==await deploymentData(release.contracts[name],args))throw new Error('Planned creation data mismatch');
   const checked=await verifyDeployment(provider,entry,release.contracts[name],{deployer,chainId,registry:args[0],feeLimits:policy?feeOverrides(policy,name):undefined});
   if(await provider.getBlockNumber()-checked.blockNumber+1<confirmations)throw new Error('Insufficient deployment confirmations');
   if(mainnet){
    await verificationProvider.waitForTransaction(entry.transactionHash,confirmations,120000);
    const second=await verifyDeployment(verificationProvider,entry,release.contracts[name],{deployer,chainId,registry:args[0],feeLimits:policy?feeOverrides(policy,name):undefined});
    if(second.blockHash!==checked.blockHash||second.runtimeHash!==checked.runtimeHash)throw new Error('RPC deployment evidence disagreement');
    checked.finality=await waitForFinality([provider,verificationProvider],checked,finalityOptions);
   }
   return checked;
  }
  // Verify everything before persisting recovery or broadcasting any new transaction.
  for(const [name,entry] of Object.entries(manifest.contracts)) {
   const recovered=recoveryTransactions[name];
   if(recovered&&entry.transactionHash&&recovered!==entry.transactionHash)throw new Error('Conflicting recovery transaction');
   const candidate={...entry,transactionHash:entry.transactionHash??recovered};
   const checked=await verify(name,candidate);Object.assign(entry,candidate,checked);
  }
  save();
  try {
   for(const name of names) {
    if(manifest.contracts[name])continue;
    const contract=release.contracts[name],args=name==='ObjectDigitalPassport'?[]:[manifest.contracts.ObjectDigitalPassport.address];
    const nonce=manifest.startNonce+names.indexOf(name);
    if(await provider.getTransactionCount(deployer,'pending')!==nonce||await provider.getTransactionCount(deployer,'latest')!==nonce)throw new Error('Unexpected pending/consumed deployer nonce');
    if(mainnet){
     if(await verificationProvider.getTransactionCount(deployer,'pending')!==nonce)throw new Error('RPC deployer nonce disagreement');
     await checkRemainingBudget(provider,deployer,names.slice(names.indexOf(name)),manifest.contracts,policy);
    }
    const entry={address:getCreateAddress({from:deployer,nonce}),nonce,args,status:'planned',deploymentData:await deploymentData(contract,args)};
    if(mainnet){
     const estimated=await provider.estimateGas({from:deployer,data:entry.deploymentData,nonce});
     if(estimated>BigInt(policy.gasLimits[name]))throw new Error('Gas estimate exceeds approved limit');
    }
    manifest.contracts[name]=entry;save();
    await checkpoint('planned',name,entry);
    const transaction=await signer.sendTransaction({data:entry.deploymentData,nonce,chainId:BigInt(chainId),...(policy?feeOverrides(policy,name):{})});
    await checkpoint('broadcast',name,{...entry,transactionHash:transaction.hash});
    entry.transactionHash=transaction.hash;entry.status='pending';save();
    await checkpoint('pending',name,entry);
    await transaction.wait(confirmations,120000);Object.assign(entry,await verify(name,entry));save();
    await checkpoint('verified',name,entry);
   }
   // Reconcile the full roster again immediately before emitting the generation candidate.
   for(const [name,entry] of Object.entries(manifest.contracts))Object.assign(entry,await verify(name,entry));
   manifest.status='complete';delete manifest.error;save();
   const generation=generationFromManifest(manifest,release),output=file+'.generation.json';
   if(fs.existsSync(output)) {
    if(canonicalize(parseJSONBytes(fs.readFileSync(output)))!==canonicalize(generation))throw new Error('Existing generation candidate mismatch');
   } else atomicWrite(output,generation);
   return {manifest,generation};
  } catch(error){manifest.status='interrupted';manifest.error=String(error);save();throw error;}
 } finally {fs.closeSync(lock);fs.unlinkSync(file+'.lock');}
}
