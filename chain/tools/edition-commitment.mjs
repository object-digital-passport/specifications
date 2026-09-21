import { AbiCoder, getAddress, keccak256, ZeroAddress } from 'ethers';
/** This domain fixes derivation v2 and the SHA256 tree format in SPEC §20. */
export function editionCommitment({chainId,registry,issuer,satellite,editionNonce,merkleRoot,unitCount,labelSigner=ZeroAddress}) {
 const root=merkleRoot.startsWith('sha256:')?'0x'+merkleRoot.slice(7):merkleRoot;
 if(BigInt(root)===0n || BigInt(editionNonce)===0n)throw new Error('Zero edition root/nonce');
 for(const a of [registry,issuer,satellite])if(getAddress(a)===ZeroAddress)throw new Error('Zero edition identity');
 if(BigInt(chainId)<=0n || !Number.isInteger(Number(unitCount)) || Number(unitCount)<1 || Number(unitCount)>1048576)throw new Error('Invalid edition context/count');
 return keccak256(AbiCoder.defaultAbiCoder().encode(
  ['string','uint256','address','address','address','bytes32','bytes32','uint32','address'],
  ['ODP-EDITION-COMMITMENT-0.7',chainId,registry,issuer,satellite,editionNonce,root,unitCount,labelSigner]
 ));
}
