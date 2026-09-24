// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "./ODPSatellite.sol";

import "./ODPErrors.sol";

contract ODPEditionUnits is ODPSatellite {
    bytes1 private constant TYPE_B = "B";

    /// Absolute proof-length bound; canonical trees under the count cap need at most 20 levels.
    uint256 private constant MAX_PROOF = 32;

    struct Edition {
        bytes32 merkleRoot;
        uint32 unitCount;
        bool open;
        bytes32 editionNonce;
        // SPEC §20.7 — the key an offline reader checks a signed outer label against.
        // address(0) = this edition prints plain labels. Immutable with the edition.
        address labelSigner;
    }

    struct Activation {
        uint64 timestamp;
        address unitAddress;
    }

    mapping(string => Edition) private _editions;
    mapping(address => mapping(bytes32 => string)) private _editionPassportByNonce;
    error EditionCommitmentMismatch();
    error EditionNonceAlreadyUsed(string passportId);
    mapping(bytes32 => Activation) private _activations;

    event EditionOpened(
        string editionPassportId,
        bytes32 merkleRoot,
        uint32 unitCount,
        address labelSigner,
        bytes32 editionNonce,
        address indexed issuer
    );
    event UnitActivated(string editionPassportId, uint32 indexed unitIndex, address indexed unitAddress, uint256 timestamp);

    constructor(address registry_) ODPSatellite(registry_) {
    }

    // ─── Issuer surface ───────────────────────────────────────────────────────

    function openEdition(
        string calldata editionPassportId,
        bytes32 merkleRoot,
        uint32 unitCount,
        address labelSigner,
        bytes32 editionNonce
    ) external {
        if (_editions[editionPassportId].open) revert EC(119);
        if (!(merkleRoot != bytes32(0))) revert EC(118);
        if (!(unitCount > 0 && unitCount <= 1_048_576)) revert EC(122);

        IODPRegistry.PassportHeaderView memory h = odpRegistry.getPassportHeader(editionPassportId);
        if (!(msg.sender == h.creator)) revert EC(120);
        if (!(odpRegistry.getCreator(h.creatorId).typePrefix == TYPE_B)) revert EC(121);

        _registered();
        IODPRegistry.PassportClassificationView memory c = odpRegistry.getPassportClassification(editionPassportId);
        if (c.revoked) revert EC(11);
        if (c.editionModel != 2 && c.editionModel != 3) revert EC(122);
        if ((odpRegistry.getPassportMedia(editionPassportId).anchorTypesMask & 4096) == 0) revert EC(105);
        if (editionNonce == bytes32(0)) revert EC(141);
        if (odpRegistry.getPassportMedia(editionPassportId).editionCommitment !=
            commitmentFor(h.creator, merkleRoot, unitCount, labelSigner, editionNonce)) {
            revert EditionCommitmentMismatch();
        }
        string storage prior = _editionPassportByNonce[h.creator][editionNonce];
        if (bytes(prior).length != 0) revert EditionNonceAlreadyUsed(prior);
        _editionPassportByNonce[h.creator][editionNonce] = editionPassportId;
        _editions[editionPassportId] = Edition({
            merkleRoot: merkleRoot,
            unitCount: unitCount,
            open: true,
            editionNonce: editionNonce,
            labelSigner: labelSigner
        });

        emit EditionOpened(editionPassportId, merkleRoot, unitCount, labelSigner, editionNonce, msg.sender);
    }

    /// @notice Exact typed commitment to prepare before mint. No passportId circular dependency.
    /// @dev Domain fixes unit derivation v2, SHA256/indexed-address leaves and duplicate-odd tree rules.
    function commitmentFor(address issuer, bytes32 root, uint32 count, address labelSigner, bytes32 nonce)
        public view returns (bytes32)
    {
        return keccak256(abi.encode("ODP-EDITION-COMMITMENT-0.7", block.chainid,
            address(odpRegistry), issuer, address(this), nonce, root, count, labelSigner));
    }

    function editionPassportByNonce(address issuer, bytes32 nonce) external view returns (string memory) {
        return _editionPassportByNonce[issuer][nonce];
    }

    // ─── Activation ───────────────────────────────────────────────────────────

    function activate(
        string calldata editionPassportId,
        uint32 unitIndex,
        bytes32[] calldata proof,
        bytes calldata signature
    ) external {
        Edition storage ed = _editions[editionPassportId];
        if (!ed.open) revert EC(118);
        if (odpRegistry.getPassportClassification(editionPassportId).revoked) revert EC(11);
        if (!(unitIndex < ed.unitCount)) revert EC(122);

        bytes32 slot = _slot(editionPassportId, unitIndex);
        if (_activations[slot].timestamp != 0) revert EC(124);

        address unitAddress = _recoverSigner(activationPayloadHash(editionPassportId, unitIndex), signature);
        if (!_proves(ed.merkleRoot, proof, unitIndex, unitAddress)) revert EC(123);

        _activations[slot] = Activation({ timestamp: uint64(block.timestamp), unitAddress: unitAddress });

        emit UnitActivated(editionPassportId, unitIndex, unitAddress, block.timestamp);
    }

    // ─── Reads ────────────────────────────────────────────────────────────────

    function getEdition(string calldata editionPassportId)
        external view returns (bytes32 merkleRoot, uint32 unitCount, bool open, bytes32 editionNonce, address labelSigner)
    {
        Edition storage ed = _editions[editionPassportId];
        return (ed.merkleRoot, ed.unitCount, ed.open, ed.editionNonce, ed.labelSigner);
    }

    function labelPayloadHash(string calldata editionPassportId, uint32 unitIndex)
        public view returns (bytes32)
    {
        Edition storage ed = _editions[editionPassportId];
        return keccak256(
            abi.encodePacked(
                "ODP-UNIT-LABEL-v1",
                uint256(block.chainid),
                address(this),
                editionPassportId,
                unitIndex,
                ed.merkleRoot
            )
        );
    }

    /// Returns `(0, address(0))` when the unit has never been activated.
    function getActivation(string calldata editionPassportId, uint32 unitIndex)
        external view returns (uint256 timestamp, address unitAddress)
    {
        Activation storage a = _activations[_slot(editionPassportId, unitIndex)];
        return (a.timestamp, a.unitAddress);
    }

    function isActivated(string calldata editionPassportId, uint32 unitIndex) external view returns (bool) {
        return _activations[_slot(editionPassportId, unitIndex)].timestamp != 0;
    }

    /// The message a unit key signs (§20.9), exposed so wallets and tools agree byte-for-byte.
    function activationPayloadHash(string calldata editionPassportId, uint32 unitIndex)
        public view returns (bytes32)
    {
        return keccak256(
            abi.encodePacked(
                "ODP-UNIT-ACTIVATE-v1",
                uint256(block.chainid),
                address(this),
                editionPassportId,
                unitIndex
            )
        );
    }

    /// SPEC §20.3 leaf: `SHA-256( uint32be(index) || address20 )`.
    function unitLeaf(uint32 unitIndex, address unitAddress) public pure returns (bytes32) {
        return sha256(abi.encodePacked(unitIndex, unitAddress));
    }

    // ─── Internals ────────────────────────────────────────────────────────────

    function _slot(string calldata editionPassportId, uint32 unitIndex) private pure returns (bytes32) {
        return keccak256(abi.encode(editionPassportId, unitIndex));
    }

    function _recoverSigner(bytes32 payloadHash, bytes calldata signature) private pure returns (address) {
        if (!(signature.length == 65)) revert EC(125);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        // EIP-2 low-s; rejects the trivially malleable half of the curve.
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) revert EC(125);
        if (v < 27) v += 27;
        if (!(v == 27 || v == 28)) revert EC(125);

        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", payloadHash));
        address signer = ecrecover(digest, v, r, s);
        if (!(signer != address(0))) revert EC(125);
        return signer;
    }

    function _proves(
        bytes32 root,
        bytes32[] calldata proof,
        uint32 unitIndex,
        address unitAddress
    ) private pure returns (bool) {
        if (proof.length > MAX_PROOF) revert EC(127);
        bytes32 node = unitLeaf(unitIndex, unitAddress);
        uint256 idx = unitIndex;
        for (uint256 i = 0; i < proof.length; i++) {
            node = (idx & 1 == 0)
                ? sha256(abi.encodePacked(node, proof[i]))
                : sha256(abi.encodePacked(proof[i], node));
            idx >>= 1;
        }
        return node == root;
    }
}
