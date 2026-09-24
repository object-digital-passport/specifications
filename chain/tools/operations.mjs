import {AbiCoder,keccak256} from 'ethers';
const encode=(types,values)=>keccak256(AbiCoder.defaultAbiCoder().encode(types,values));
export function statementDigest({chainId,registry,satellite,author,passportId,kind,payloadHash,previousId}) {
 return encode(['string','uint256','address','address','address','string','uint8','bytes32','uint256'],['ODP-STATEMENT-OPERATION-0.7',chainId,registry,satellite,author,passportId,kind,payloadHash,previousId]);
}
export function proofDigest({chainId,registry,satellite,author,passportId,documentHash,documentUrl,year,month}) {
 return encode(['string','uint256','address','address','address','string','bytes32','string','uint32','uint8'],['ODP-PROOF-OPERATION-0.7',chainId,registry,satellite,author,passportId,documentHash,documentUrl,year,month]);
}
export function mintDigest({chainId,registry,issuer,objectType,mint}) {
 if(!['physical','digital','mixed'].includes(objectType))throw new Error('Invalid mint kind');
 const core='tuple(uint32 year,uint8 month,string title,string authorName,string shortDescription,string domain,uint8 contentClass,uint8 lifecycleStatus,uint8 aiStatus,uint8 verificationMethod,uint8 editionModel)';
 const tuple=`tuple(${core} core,bytes32 dataHash,bytes32 imageHash,bytes32 previewHash,bytes32 fileHash,bytes32 anchorsHash,uint32 anchorTypesMask,bytes32 editionCommitment)`;
 return encode(['string','uint256','address','address','string',tuple],['ODP-MINT-OPERATION-0.7',chainId,registry,issuer,objectType,mint]);
}
