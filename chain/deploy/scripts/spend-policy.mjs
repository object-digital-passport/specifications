import {roles} from './release.mjs';
const integer=(value,label)=>{if((typeof value!=='string'&&!(typeof value==='number'&&Number.isSafeInteger(value)))||!/^[1-9][0-9]*$/.test(String(value)))throw new Error('Positive integer required: '+label);return BigInt(value);};
export function validateSpendPolicy(policy) {
 if(!policy||!policy.gasLimits)throw new Error('Explicit mainnet gas and fee limits required');
 const names=Object.keys(roles);
 if(Object.keys(policy.gasLimits).length!==names.length||names.some(n=>!Object.hasOwn(policy.gasLimits,n)))throw new Error('Gas-limit contract roster mismatch');
 const maxFeePerGas=integer(policy.maxFeePerGas,'maxFeePerGas'),maxPriorityFeePerGas=integer(policy.maxPriorityFeePerGas,'maxPriorityFeePerGas'),maxTotalFeeWei=integer(policy.maxTotalFeeWei,'maxTotalFeeWei');
 if(maxPriorityFeePerGas>maxFeePerGas)throw new Error('Priority fee exceeds maximum fee');
 const gasLimits=Object.fromEntries(names.map(name=>[name,integer(policy.gasLimits[name],name).toString()]));
 const ceiling=Object.values(gasLimits).reduce((a,v)=>a+BigInt(v),0n)*maxFeePerGas;
 if(ceiling>maxTotalFeeWei)throw new Error('Maximum deployment cost exceeds approved budget');
 return {gasLimits,maxFeePerGas:String(maxFeePerGas),maxPriorityFeePerGas:String(maxPriorityFeePerGas),maxTotalFeeWei:String(maxTotalFeeWei)};
}
export function feeOverrides(policy,name){return {gasLimit:BigInt(policy.gasLimits[name]),maxFeePerGas:BigInt(policy.maxFeePerGas),maxPriorityFeePerGas:BigInt(policy.maxPriorityFeePerGas),type:2};}
export async function checkRemainingBudget(provider,deployer,remainingNames,contracts,policy) {
 const reserve=remainingNames.reduce((n,name)=>n+BigInt(policy.gasLimits[name]),0n)*BigInt(policy.maxFeePerGas);
 const spent=Object.values(contracts).reduce((n,entry)=>n+BigInt(entry.gasUsed??0)*BigInt(entry.effectiveGasPrice??0),0n);
 if(spent+reserve>BigInt(policy.maxTotalFeeWei))throw new Error('Remaining deployment exceeds approved budget');
 if(await provider.getBalance(deployer,'pending')<reserve)throw new Error('Insufficient balance for remaining bounded deployment');
}
