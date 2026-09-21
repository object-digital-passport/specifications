// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "./ODPSatellite.sol";

import "./ODPErrors.sol";
import "./ODPPassportLib.sol";

/**
 * Satellite: passport-bound institutional attestations (P / M profiles).
 * Deploy after `ObjectDigitalPassport`; constructor takes the registry address.
 *
 * Attestation model (SPEC.md §4): an attestation states
 * "this passport/object has been examined" as a whole — no per-anchor granularity.
 * `documentHash` optionally anchors a signed expertise document (PDF, report);
 * details of what exactly was examined belong in that document.
 */

contract ODPPassportProofRegistry is ODPSatellite {

    // Must match the registry this satellite is wired to (SPEC §8): packed
    // `SPEC_MAJOR * 16 + SPEC_MINOR`, each < 16. Derived rather than written out so
    // the two cannot drift the way they did between the 0.6 and 0.7 lines.
    uint8 private constant SPEC_MAJOR = 0;
    uint8 private constant SPEC_MINOR = 7;
    uint8 private constant CONTRACT_VERSION = SPEC_MAJOR * 16 + SPEC_MINOR;

    struct ProofRecord {
        string proofId;
        uint8 contractVersion;
        string prover;
        string passportId;
        bytes32 documentHash; // SHA-256 of the signed expertise document; bytes32(0) = none
        string documentUrl;
        uint256 timestamp;
    }

    mapping(uint32 => mapping(uint32 => bool)) private _proofNumberTaken;
    mapping(string => ProofRecord) private _proofs;
    mapping(string => string[]) private _passportProofs;
    mapping(string => string[]) private _institutionProofs;
    struct Operation { bytes32 digest; string proofId; }
    mapping(address => mapping(bytes32 => Operation)) public proofOperations;
    error InvalidProofOperation();
    error ProofAlreadyCommitted(bytes32 operationId, string proofId);
    error ProofOperationConflict(bytes32 operationId);
    event ProofOperationCommitted(address indexed author, bytes32 indexed operationId, string proofId, bytes32 digest);
    uint256 private _proofNonce;
    mapping(string => address) public proofAuthor;
    mapping(string => uint256) public proofWithdrawnAt;
    mapping(string => bytes32) public proofWithdrawalReason;
    event ProofWithdrawn(string indexed proofId, string proofIdText, address indexed author, bytes32 reasonHash, uint256 timestamp);
    error InvalidProofWithdrawal();

    function withdrawProof(string calldata proofId, bytes32 reasonHash) external {
        if (proofAuthor[proofId] != msg.sender || proofWithdrawnAt[proofId] != 0 || reasonHash == bytes32(0)) revert InvalidProofWithdrawal();
        proofWithdrawnAt[proofId] = block.timestamp;
        proofWithdrawalReason[proofId] = reasonHash;
        emit ProofWithdrawn(proofId, proofId, msg.sender, reasonHash, block.timestamp);
    }

    event ProofSubmitted(
        string indexed proofId,
        string indexed passportId,
        string indexed prover,
        string proofIdText,
        string passportIdText,
        string proverText,
        uint256 timestamp
    );

    constructor(address registry_) ODPSatellite(registry_) {
    }

    function submitProof(
        string calldata passportId,
        bytes32 documentHash,
        string calldata documentUrl,
        uint32 year,
        uint8 month,
        bytes32 operationId
    ) external returns (string memory proofId) {
        if (operationId == bytes32(0)) revert InvalidProofOperation();
        bytes32 digest = keccak256(abi.encode("ODP-PROOF-OPERATION-0.7", block.chainid,
            address(odpRegistry), address(this), msg.sender, passportId, documentHash, documentUrl, year, month));
        Operation storage operation = proofOperations[msg.sender][operationId];
        if (bytes(operation.proofId).length != 0) {
            if (operation.digest != digest) revert ProofOperationConflict(operationId);
            revert ProofAlreadyCommitted(operationId, operation.proofId);
        }
        IODPRegistry.PassportClassificationView memory classification = odpRegistry.getPassportClassification(passportId);
        if (classification.revoked) revert EC(11);
        if (!(bytes(documentUrl).length <= 512)) revert EC(10);
        if (!(year > 0)) revert EC(9);
        if (!(month >= 1 && month <= 12)) revert EC(8);
        _requireUtcYearMonth(year, month);

        string memory callerId = _institution();

        if (documentHash == bytes32(0)) {
            if (!(bytes(documentUrl).length == 0)) revert EC(5);
        }

        proofId = _generateProofId(year, month, passportId);

        _proofs[proofId] = ProofRecord({
            proofId: proofId,
            contractVersion: CONTRACT_VERSION,
            prover: callerId,
            passportId: passportId,
            documentHash: documentHash,
            documentUrl: documentUrl,
            timestamp: block.timestamp
        });

        proofAuthor[proofId] = msg.sender;
        _passportProofs[passportId].push(proofId);
        _institutionProofs[callerId].push(proofId);

        operation.digest = digest;
        operation.proofId = proofId;
        emit ProofOperationCommitted(msg.sender, operationId, proofId, digest);
        emit ProofSubmitted(proofId, passportId, callerId, proofId, passportId, callerId, block.timestamp);
    }

    function getProof(string calldata proofId)
        external
        view
        returns (ProofRecord memory)
    {
        if (!(bytes(_proofs[proofId].proofId).length > 0)) revert EC(4);
        return _proofs[proofId];
    }

    function _requireUtcYearMonth(uint32 year, uint8 month) private view {
        (uint32 cy, uint8 cm) = ODPPassportLib.utcYearMonthFromTimestamp(block.timestamp);
        if (!(year == cy && month == cm)) revert EC(68);
    }

    function _generateProofId(uint32 year, uint8 month, string memory passportId)
        internal
        returns (string memory)
    {
        uint32 key = uint32(year) * 100 + uint32(month);
        uint256 baseNonce = _proofNonce;
        bytes32 passportIdHash = keccak256(bytes(passportId));
        for (uint256 i = 0; i < 25; i++) {
            // Human-readable PRF ID entropy, not security randomness (mirrors main registry triage).
            // slither-disable-next-line weak-prng
            uint32 n = uint32(uint256(keccak256(abi.encodePacked(
                block.timestamp,
                block.prevrandao,
                msg.sender,
                baseNonce + i,
                key,
                passportIdHash,
                gasleft()
            ))) % 100_000_000);
            if (!_proofNumberTaken[key][n]) {
                _proofNonce = baseNonce + i + 1;
                _proofNumberTaken[key][n] = true;
                return ODPPassportLib.formatPrfId(year, month, n);
            }
        }
        revert EC(60);
    }
    function getProofsForPassportPaged(string calldata id, uint256 offset, uint256 limit)
        external view returns (string[] memory, uint256) { return _page(_passportProofs[id], offset, limit); }
    function getProofsByInstitutionPaged(string calldata id, uint256 offset, uint256 limit)
        external view returns (string[] memory, uint256) { return _page(_institutionProofs[id], offset, limit); }
}
