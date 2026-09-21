import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyFinality} from '../../deploy/scripts/finality.mjs';
const observation={blockNumber:12,blockHash:'0xabc'};
const rpc=(finalized=15,hash='0xabc')=>({getBlock:async tag=>tag==='finalized'?(finalized===null?null:{number:finalized}):{number:12,hash}});
test('mainnet finality requires two separate RPC observations of the same finalized block',async()=>{
 assert.equal(await verifyFinality([rpc(),rpc()],observation),'finalized-two-rpc');
 const one=rpc();await assert.rejects(verifyFinality([one,one],observation),/independent/);
 for(const other of [rpc(11),rpc(null),rpc(15,'0xdef')])await assert.rejects(verifyFinality([rpc(),other],observation));
});
test('finality waits for lag but rejects a changed canonical block immediately',async()=>{
 const {waitForFinality}=await import('../../deploy/scripts/finality.mjs');let attempts=0;
 const delayed={getBlock:async tag=>tag==='finalized'?{number:++attempts>1?15:11}:{number:12,hash:'0xabc'}};
 assert.equal(await waitForFinality([delayed,rpc()],observation,{timeoutMs:100,intervalMs:1}),'finalized-two-rpc');
 await assert.rejects(waitForFinality([rpc(11),rpc()],observation,{timeoutMs:0}),/not finalized/);
 await assert.rejects(waitForFinality([rpc(),rpc(15,'0xdef')],observation),/canonical block mismatch/);
});
