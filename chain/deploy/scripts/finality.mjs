/** Require two RPC observations of a canonical, finalized deployment block. */
export async function verifyFinality(providers,{blockNumber,blockHash}) {
 if(providers.length!==2||providers[0]===providers[1])throw new Error('Two independent RPC providers required');
 for(const provider of providers) {
  const finalized=await provider.getBlock('finalized');
  if(!finalized||finalized.number<blockNumber)throw new Error('Deployment block is not finalized');
  const block=await provider.getBlock(blockNumber);
  if(!block||block.hash!==blockHash)throw new Error('Deployment canonical block mismatch');
 }
 return 'finalized-two-rpc';
}

export async function waitForFinality(providers,observation,{timeoutMs=120000,intervalMs=2000}={}) {
 const deadline=Date.now()+timeoutMs;
 while(true){
  try{return await verifyFinality(providers,observation);}catch(error){
   if(error.message!=='Deployment block is not finalized'||Date.now()>=deadline)throw error;
   await new Promise(resolve=>setTimeout(resolve,Math.min(intervalMs,Math.max(0,deadline-Date.now()))));
  }
 }
}
