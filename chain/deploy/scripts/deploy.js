/** Explicit opt-in only. No ambient compilation or artifact lookup. */
import {network} from 'hardhat';
import fs from 'node:fs';
import {parseJSONBytes} from '../../tools/canonical.mjs';
import {deployGeneration} from './deploy-generation.mjs';
if(process.env.ODP_ENABLE_DEPLOY!=='1')throw new Error('Deployment disabled');
const spendPolicy=process.env.ODP_SPEND_POLICY?parseJSONBytes(fs.readFileSync(process.env.ODP_SPEND_POLICY)):undefined;
const release=parseJSONBytes(fs.readFileSync(process.env.ODP_RELEASE_BUNDLE));
if(process.env.ODP_DEPLOY_CHAIN_ID==='137'){
 const primary=new URL(process.env.ODP_POLYGON_RPC_URL||'https://polygon-bor-rpc.publicnode.com');
 const secondary=new URL(process.env.ODP_VERIFY_RPC_URL||'');
 if(primary.hostname===secondary.hostname)throw new Error('Use a separate RPC service for mainnet verification');
}
const {ethers}=await network.connect();
const verificationProvider=process.env.ODP_VERIFY_RPC_URL?new ethers.JsonRpcProvider(process.env.ODP_VERIFY_RPC_URL):undefined;const [signer]=await ethers.getSigners();if(!signer)throw new Error('No deployer');
await deployGeneration({provider:ethers.provider,verificationProvider,signer,release,approvedHash:process.env.ODP_RELEASE_HASH,chainId:process.env.ODP_DEPLOY_CHAIN_ID,generationId:process.env.ODP_GENERATION_ID,manifestPath:process.env.ODP_DEPLOY_MANIFEST,resume:process.env.ODP_RESUME==='1',confirmations:Number(process.env.ODP_DEPLOY_CONFIRMATIONS),expectedDeployer:process.env.ODP_DEPLOYER_ADDRESS,spendPolicy,recoveryTransactions:process.env.ODP_RECOVERY_TRANSACTIONS?parseJSONBytes(fs.readFileSync(process.env.ODP_RECOVERY_TRANSACTIONS)):{}});
console.log('Verified generation candidate saved; not published or approved.');
