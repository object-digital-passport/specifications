import http from 'node:http';
import {network} from 'hardhat';
import {JsonRpcProvider} from 'ethers';

/** Actual local EVM with chain137, exposed as two fault-injectable HTTP RPC observers.
 * This tests transport/orchestration, not Polygon consensus or independent node operators.
 */
export async function polygonHarness() {
 const connection=await network.create({network:'default',override:{chainId:137}});
 const observers=[],servers=[],providers=[];
 for(let index=0;index<2;index++) {
  const state={calls:[],finality:'ready',fault:null};observers.push(state);
  async function handle(request) {
   const {id,method,params=[]}=request;state.calls.push(method);
   try {
    let result;
    if(method==='eth_getBlockByNumber'&&params[0]==='finalized') {
     if(state.finality==='unsupported')return {jsonrpc:'2.0',id,result:null};
     result=await connection.provider.request({method,params:['latest',false]});
     if(state.finality==='lag')result={...result,number:'0x0'};
    } else result=await connection.provider.request({method,params});
    if(state.fault)result=await state.fault({method,params,result});
    return {jsonrpc:'2.0',id,result};
   } catch(error){return {jsonrpc:'2.0',id,error:{code:error.code??-32000,message:error.message}};}
  }
  const server=http.createServer(async(req,res)=>{
   try {const chunks=[];for await(const chunk of req)chunks.push(chunk);const payload=JSON.parse(Buffer.concat(chunks));const result=Array.isArray(payload)?await Promise.all(payload.map(handle)):await handle(payload);res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(result));}
   catch(error){res.writeHead(500);res.end('local harness error');}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});servers.push(server);
  const provider=new JsonRpcProvider(`http://127.0.0.1:${server.address().port}`,undefined,{cacheTimeout:-1,pollingInterval:20,batchMaxCount:1});providers.push(provider);
 }
 const signer=await providers[0].getSigner(0);
 return {provider:providers[0],verificationProvider:providers[1],signer,observers,connection,async close(){providers.forEach(p=>p.destroy());for(const server of servers){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await connection.close();}};
}
