/** Read-only wallet binding. Never imports Hardhat, dotenv, Wallet or a signing key. */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {JsonRpcProvider,getAddress,getCreateAddress} from 'ethers';
import {releaseHash,roles} from './release.mjs';
import {validateSpendPolicy,checkRemainingBudget} from './spend-policy.mjs';
import {parseJSONBytes} from '../../tools/canonical.mjs';
export async function preflightMainnet({providers,deployer,release,approvedHash,spendPolicy}) {
 if(release.abiGeneration!=='0.7-redesign-8'||releaseHash(release)!==approvedHash)throw Error('Unapproved release');
 if(providers.length!==2||providers[0]===providers[1])throw Error('Two RPC providers required');
 deployer=getAddress(deployer);const policy=validateSpendPolicy(spendPolicy),observations=[],warnings=new Set();
 for(const provider of providers){
  if((await provider.getNetwork()).chainId!==137n)throw Error('Polygon chain137 required');
  const latest=await provider.getTransactionCount(deployer,'latest'),pending=await provider.getTransactionCount(deployer,'pending'),finalized=await provider.getBlock('finalized');
  if(latest!==pending)throw Error('Deployer has pending transactions');
  if(!finalized)throw Error('Finalized RPC tag required');
  await checkRemainingBudget(provider,deployer,Object.keys(roles),{},policy);
  const head=await provider.getBlock('latest');
  if(head?.baseFeePerGas==null)throw Error('EIP1559 base fee unavailable');
  const priority=BigInt(await provider.send('eth_maxPriorityFeePerGas',[]));
  // A cap below today's price cannot be included now; a cap below twice the base fee only risks waiting if the price rises.
  const fees={currentFeePerGas:head.baseFeePerGas+priority,conservativeMaxFeePerGas:2n*head.baseFeePerGas+priority,maxPriorityFeePerGas:priority};
  if(fees.currentFeePerGas>BigInt(policy.maxFeePerGas)||fees.maxPriorityFeePerGas>BigInt(policy.maxPriorityFeePerGas))throw Error('Current fee exceeds configured caps');
  if(fees.conservativeMaxFeePerGas>BigInt(policy.maxFeePerGas))warnings.add('maxFeePerGas is below twice the current base fee plus priority fee: a creation may wait until the base fee falls back under the cap');
  observations.push({nonce:pending,balanceWei:String(await provider.getBalance(deployer,'pending')),finalizedNumber:finalized.number,fees:Object.fromEntries(Object.entries(fees).map(([k,v])=>[k,String(v)]))});
 }
 if(observations[0].nonce!==observations[1].nonce)throw Error('RPC nonce disagreement');
 const blockNumber=Math.min(...observations.map(o=>o.finalizedNumber)),blocks=await Promise.all(providers.map(p=>p.getBlock(blockNumber)));
 if(!blocks[0]||!blocks[1]||blocks[0].hash!==blocks[1].hash)throw Error('RPC finalized block disagreement');
 const predicted=Object.fromEntries(Object.keys(roles).map((name,i)=>[name,getCreateAddress({from:deployer,nonce:observations[0].nonce+i})]));
 for(const provider of providers)for(const address of Object.values(predicted))if(await provider.getCode(address)!=='0x')throw Error('Predicted address already has code');
 return {format:'odp-mainnet-preflight-0.7',observedAt:new Date().toISOString(),chainId:'137',deployer,releaseHash:approvedHash,spendPolicy:policy,observations,commonFinalized:{number:blockNumber,hash:blocks[0].hash},predicted,feeWarnings:[...warnings],warning:'Read-only observation, not deployment approval or a reservation of nonce/fees. Use an exclusive deployment account; rerun immediately before deployment.'};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const urls=[process.env.ODP_POLYGON_RPC_URL,process.env.ODP_VERIFY_RPC_URL];
 if(new URL(urls[0]).hostname===new URL(urls[1]).hostname)throw Error('Separate RPC services required');
 const providers=urls.map(url=>new JsonRpcProvider(url,undefined,{cacheTimeout:-1}));
 try{console.log(JSON.stringify(await preflightMainnet({providers,deployer:process.env.ODP_DEPLOYER_ADDRESS,release:parseJSONBytes(fs.readFileSync(process.env.ODP_RELEASE_BUNDLE)),approvedHash:process.env.ODP_RELEASE_HASH,spendPolicy:parseJSONBytes(fs.readFileSync(process.env.ODP_SPEND_POLICY))}),null,2));}finally{providers.forEach(p=>p.destroy());}
}
