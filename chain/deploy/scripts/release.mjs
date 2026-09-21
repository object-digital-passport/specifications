/** Offline release packaging and exact deployment verification. Never accesses a wallet. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {AbiCoder,ContractFactory,keccak256,toUtf8Bytes,toBeHex,zeroPadValue,getCreateAddress} from 'ethers';
import {canonicalize,parseJSONBytes} from '../../tools/canonical.mjs';
export const roles={ObjectDigitalPassport:null,ODPEditionUnits:'edition-units',ODPAuthorAttestation:'author-attestation',ODPPassportConcerns:'concerns',ODPHosting:'hosting',ODPProfileDirectory:'profile-directory',ODPRegistryRelations:'relations',ODPPassportProofRegistry:'institutional-proofs',ODPWalletDocumentAnchor:'wallet-document-anchor',ODPStatementJournal:'statement-journal'};
export const digest=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
export const releaseHash=release=>digest(canonicalize(release));
function immutableNames(output){const result={};function walk(v){if(!v||typeof v!=='object')return;if(v.nodeType==='VariableDeclaration'&&v.mutability==='immutable')result[v.id]=v.name;for(const x of Object.values(v))if(typeof x==='object')Array.isArray(x)?x.forEach(walk):walk(x);}for(const s of Object.values(output.sources))walk(s.ast);return result;}
export function buildRelease(info,output,{sourceCommit,compilerHash,dependencyHash}) {
 if(info.solcVersion!=='0.8.20'||output.errors?.some(e=>e.severity==='error'))throw new Error('Invalid compiler result');
 const names=immutableNames(output),contracts={};
 for(const name of Object.keys(roles)) {
  const matches=Object.values(output.contracts).flatMap(cs=>cs[name]?[cs[name]]:[]);
  if(matches.length!==1)throw new Error('Ambiguous/missing contract '+name);
  const c=matches[0],b=c.evm.bytecode,r=c.evm.deployedBytecode;
  if(!b.object||Object.keys(b.linkReferences).length||Object.keys(r.linkReferences).length||r.object.length/2>24576)throw new Error('Unlinked/oversized '+name);
  const refs={};for(const [id,locations] of Object.entries(r.immutableReferences)) {
   const key=names[id];if(!['odpRegistry','_cachedChainId','_cachedDomainSeparator'].includes(key))throw new Error('Unknown immutable '+id);
   refs[key]=locations;
  }
  contracts[name]={abi:c.abi,bytecode:'0x'+b.object,runtime:'0x'+r.object,immutableReferences:refs};
 }
 return {format:'odp-release-0.7',abiGeneration:'0.7-redesign-7',sourceCommit,compilerVersion:info.solcLongVersion,compilerHash,dependencyHash,buildInfoHash:digest(canonicalize({info,output})),input:info.input,output,contracts};
}
export function expectedRuntime(contract,{registry,chainId,address}) {
 let bytes=Buffer.from(contract.runtime.slice(2),'hex');
 const values={odpRegistry:registry,_cachedChainId:toBeHex(chainId),_cachedDomainSeparator:keccak256(AbiCoder.defaultAbiCoder().encode(['bytes32','bytes32','bytes32','uint256','address'],[keccak256(toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),keccak256(toUtf8Bytes('Object Digital Passport')),keccak256(toUtf8Bytes('1')),chainId,address]))};
 for(const [key,refs] of Object.entries(contract.immutableReferences)) {
  if(!values[key])throw new Error('Missing immutable '+key);
  for(const {start,length} of refs){if(length!==32||start+length>bytes.length)throw new Error('Invalid immutable reference');Buffer.from(zeroPadValue(values[key],32).slice(2),'hex').copy(bytes,start);}
 }
 return '0x'+bytes.toString('hex');
}
export async function deploymentData(contract,args) {return (await new ContractFactory(contract.abi,contract.bytecode).getDeployTransaction(...args)).data;}
export async function verifyDeployment(provider,entry,contract,{deployer,chainId,registry,feeLimits}) {
 if(!entry.transactionHash)throw new Error('Unresolved broadcast: transaction hash required; never redeploy blindly');
 const transaction=await provider.getTransaction(entry.transactionHash),receipt=await provider.getTransactionReceipt(entry.transactionHash);
 if(!transaction||!receipt)throw new Error('Pending/unknown transaction; no broadcast permitted');
 const address=getCreateAddress({from:deployer,nonce:entry.nonce});
 if(transaction.hash?.toLowerCase()!==entry.transactionHash.toLowerCase()||receipt.hash?.toLowerCase()!==entry.transactionHash.toLowerCase())throw new Error('Deployment transaction identity mismatch');
 if(receipt.status!==1||transaction.to!==null||transaction.from.toLowerCase()!==deployer.toLowerCase()||transaction.nonce!==entry.nonce||transaction.chainId!==BigInt(chainId)||transaction.value!==0n||transaction.data.toLowerCase()!==(await deploymentData(contract,entry.args)).toLowerCase()||receipt.contractAddress?.toLowerCase()!==address.toLowerCase()||entry.address.toLowerCase()!==address.toLowerCase())throw new Error('Deployment transaction mismatch');
 if(transaction.blockHash!==receipt.blockHash||transaction.blockNumber!==receipt.blockNumber)throw new Error('Transaction/receipt inclusion mismatch');
 if(feeLimits&&(transaction.type!==2||transaction.gasLimit>feeLimits.gasLimit||transaction.maxFeePerGas>feeLimits.maxFeePerGas||transaction.maxPriorityFeePerGas>feeLimits.maxPriorityFeePerGas))throw new Error('Deployment fee limits exceeded');
 const block=await provider.getBlock(receipt.blockNumber);if(!block||block.hash!==receipt.blockHash)throw new Error('Noncanonical deployment receipt');
 const runtime=expectedRuntime(contract,{registry,chainId,address});
 if((await provider.getCode(address)).toLowerCase()!==runtime.toLowerCase())throw new Error('Deployment runtime mismatch');
 return {blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,runtimeHash:keccak256(runtime),gasUsed:String(receipt.gasUsed),effectiveGasPrice:String(receipt.gasPrice),status:'deployed'};
}
export function generationFromManifest(manifest,release) {
 if(manifest.status!=='complete'||manifest.releaseHash!==releaseHash(release)||Object.keys(roles).some(n=>manifest.contracts[n]?.status!=='deployed'))throw new Error('Incomplete/unpinned generation');
 if(manifest.chainId==='137'&&Object.values(manifest.contracts).some(entry=>entry.finality!=='finalized-two-rpc'))throw new Error('Mainnet generation requires finalized evidence');
 const core=manifest.contracts.ObjectDigitalPassport;
 return {format:'odp-bundle-generation-0.7',odpVersion:'0.7',generationId:manifest.generationId,chainId:manifest.chainId,registry:core.address.toLowerCase(),abiGeneration:release.abiGeneration,registryRuntimeCodeHash:core.runtimeHash,registryDeploymentBlock:String(core.blockNumber),build:{sourceCommit:release.sourceCommit,compilerVersion:release.compilerVersion,buildInfoHash:release.buildInfoHash},satellites:Object.entries(roles).filter(([,role])=>role).map(([name,role])=>({role,address:manifest.contracts[name].address.toLowerCase(),abiGeneration:release.abiGeneration,runtimeCodeHash:manifest.contracts[name].runtimeHash,deploymentBlock:String(manifest.contracts[name].blockNumber)})),absentSatelliteRoles:[]};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
 const [infoPath,compilerPath,outPath]=process.argv.slice(2);
 if(!outPath||fs.existsSync(outPath))throw new Error('Usage: node release.mjs BUILD_INFO SOLJSON NEW_RELEASE_FILE');
 const info=parseJSONBytes(fs.readFileSync(infoPath));const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
 const current=fs.readdirSync(path.join(root,'contracts'),{recursive:true}).filter(n=>n.endsWith('.sol')).map(n=>'contracts/'+n).sort();
 const included=Object.keys(info.input.sources).map(n=>n.replace(/^project\//,'')).sort();
 if(JSON.stringify(current)!==JSON.stringify(included))throw new Error('Incomplete source roster');
 for(const [name,s] of Object.entries(info.input.sources)) {
  const relative=name.replace(/^project\//,'');if(!relative.startsWith('contracts/')||relative.includes('..')||fs.readFileSync(path.join(root,relative),'utf8')!==s.content)throw new Error('Source/build input mismatch: '+name);
 }
 const compiler=createRequire(import.meta.url)(path.resolve(compilerPath));
 const compile=compiler.cwrap('solidity_compile','string',['string','number','number']);
 const a=compile(JSON.stringify(info.input),0,0),b=compile(JSON.stringify(info.input),0,0);
 if(a!==b)throw new Error('Compiler output is not reproducible');
 const output=JSON.parse(a),recorded=JSON.parse(fs.readFileSync(infoPath.replace(/\.json$/,'.output.json'))).output;
 if(canonicalize(output)!==canonicalize(recorded))throw new Error('Recompiled output differs from build-info');
 const {execFileSync}=await import('node:child_process');
 const release=buildRelease(info,output,{sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),compilerHash:digest(fs.readFileSync(compilerPath)),dependencyHash:digest(fs.readFileSync(path.join(root,'package-lock.json')))});
 fs.writeFileSync(outPath,JSON.stringify(release)+'\n',{flag:'wx',mode:0o600});console.log(releaseHash(release));
}
