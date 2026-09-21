/** Public fixed TEST vectors. Never use this seed or these codes on a real edition. */
import { editionContext,deriveUnit,leafOf,treeOf,variantLeaf } from './edition.mjs';
import { solidityPackedKeccak256 } from 'ethers';
import { sha256 } from './canonical.mjs';
const chainId='80002',registry='0x'+'03'.repeat(20),satellite='0x'+'02'.repeat(20),nonce='0x'+'01'.repeat(32),master=Buffer.alloc(32,42),passportId='ODP-2026-03-123456789';
const context=editionContext(chainId,registry,nonce),u=Array.from({length:5},(_,i)=>deriveUnit(master,context,i)),tree=treeOf(u.map((x,i)=>leafOf(i,x.wallet.address)));
const addressList=u.map(x=>x.wallet.address.toLowerCase()).join('\n')+'\n';
const variants=u.map((_,i)=>({index:i,variant:['red','blue','green','gold','é'][i],salt:sha256(Buffer.from('PUBLIC TEST VARIANT SALT '+i))}));
const variantTree=treeOf(variants.map(v=>variantLeaf(v.index,v.variant,v.salt)));
const variantCommitment={root:variantTree.root,units:variants.map(v=>({...v,leaf:variantLeaf(v.index,v.variant,v.salt),proof:variantTree.proof(v.index)}))};
const out={variantCommitment,warning:'PUBLIC TEST SECRETS — DO NOT USE IN PRODUCTION',spec:'0.7',keyDerivation:'odp-unit-v2',inputs:{chainId,registry,satellite,editionNonce:nonce,masterSeedHex:'0x'+master.toString('hex'),editionContextHex:'0x'+context.toString('hex'),editionPassportId:passportId,unitCount:u.length},merkleRoot:tree.root,addressList,addressListHash:sha256(Buffer.from(addressList)),units:u.map((x,i)=>({unitIndex:i,printedSeedHex:'0x'+x.seed.toString('hex'),printedCode:x.code,privateKey:x.wallet.privateKey,unitAddress:x.wallet.address,leaf:leafOf(i,x.wallet.address),proof:tree.proof(i),activationPayloadHash:solidityPackedKeccak256(['string','uint256','address','string','uint32'],['ODP-UNIT-ACTIVATE-v1',chainId,satellite,passportId,i]),labelPayloadHash:solidityPackedKeccak256(['string','uint256','address','string','uint32','bytes32'],['ODP-UNIT-LABEL-v1',chainId,satellite,passportId,i,tree.root])}))};
process.stdout.write(JSON.stringify(out,null,2)+'\n');
