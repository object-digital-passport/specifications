// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "./ODPSatellite.sol";

import "./ODPErrors.sol";

/**
 * Optional satellite: EIP-712 author attestation for a passport (SPEC §8, planned option B).
 *
 * Binds a *separate* author key to a passport's integrity anchor (`dataHash`) and issuer
 * profile (`creatorId`), independently of the wallet that sent the mint transaction. This
 * gives verifiers two independent trust signals: "this wallet minted it" and "this author
 * key signed exactly these bytes". This is independent only if the verifier already trusts
 * that author key through a separate channel. An issuer can choose its own key and occupy
 * the one-shot slot; the signature alone does not establish author identity.
 *
 * Deploy after `ObjectDigitalPassport`; the constructor pins one registry address.
 * Keeps the main registry bytecode untouched (EIP-170) — no re-deploy of the canonical
 * registry is required to adopt this feature.
 *
 * Attestation is one-shot and immutable per passport, matching the immutability class of
 * the on-chain card: the signer can withdraw consent without erasing history. Independent author
 * declarations and their replacements use ODPStatementJournal.
 */

contract ODPAuthorAttestation is ODPSatellite {

    /// @dev EIP-712 domain. `verifyingContract` is this satellite, so a signature made for
    ///      one anchor contract is not replayable against another.
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant NAME_HASH = keccak256("Object Digital Passport");
    bytes32 private constant VERSION_HASH = keccak256("1");

    /// @dev The signed struct binds the passport identity, the exact document bytes
    ///      (`dataHash`), the issuing profile, and the declared author key together.
    bytes32 private constant ATTESTATION_TYPEHASH =
        keccak256("AuthorAttestation(string passportId,bytes32 dataHash,string creatorId,address authorSigner)");

    /// @dev Cached for the deployment chain; recomputed if `block.chainid` changes (fork safety).
    bytes32 private immutable _cachedDomainSeparator;
    uint256 private immutable _cachedChainId;

    struct AuthorAttestation {
        address authorSigner;
        bytes32 dataHash;
        string  creatorId;
        uint256 timestamp;
        address submittedBy;
    }

    mapping(string => AuthorAttestation) private _attestation;
    mapping(string => uint256) public authorWithdrawalAt;
    mapping(string => bytes32) public authorWithdrawalReason;
    event AuthorAttestationWithdrawn(string indexed passportId, string passportIdText, address indexed authorSigner, bytes32 reasonHash, uint256 timestamp);
    error InvalidAuthorWithdrawal();

    /// @notice Signer can withdraw consent independently of issuer authorization.
    /// Historical getAuthorAttestation remains true; readers MUST check withdrawal state.
    function withdrawAuthorAttestation(string calldata passportId, bytes32 reasonHash) external {
        if (_attestation[passportId].authorSigner != msg.sender || authorWithdrawalAt[passportId] != 0 || reasonHash == bytes32(0)) revert InvalidAuthorWithdrawal();
        authorWithdrawalAt[passportId] = block.timestamp;
        authorWithdrawalReason[passportId] = reasonHash;
        emit AuthorAttestationWithdrawn(passportId, passportId, msg.sender, reasonHash, block.timestamp);
    }

    event AuthorAttested(
        string  indexed passportId,
        string passportIdText,
        string creatorIdText,
        address indexed authorSigner,
        string  indexed creatorId,
        bytes32 dataHash,
        address submittedBy,
        uint256 timestamp
    );

    constructor(address registry_) ODPSatellite(registry_) {
        _cachedChainId = block.chainid;
        _cachedDomainSeparator = _buildDomainSeparator();
    }

    function _buildDomainSeparator() private view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
    }

    /// @notice EIP-712 domain separator for this satellite on the current chain.
    function domainSeparator() public view returns (bytes32) {
        if (block.chainid == _cachedChainId) return _cachedDomainSeparator;
        return _buildDomainSeparator();
    }

    /**
     * @notice EIP-712 digest the author key must sign. Clients SHOULD compute this locally
     *         (e.g. `signTypedData`) and MAY call this to cross-check.
     */
    function hashAuthorAttestation(
        string calldata passportId,
        bytes32 dataHash,
        string calldata creatorId,
        address authorSigner
    ) external view returns (bytes32) {
        return _hashAuthorAttestation(passportId, dataHash, creatorId, authorSigner);
    }

    function _hashAuthorAttestation(
        string memory passportId,
        bytes32 dataHash,
        string memory creatorId,
        address authorSigner
    ) private view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                ATTESTATION_TYPEHASH,
                keccak256(bytes(passportId)),
                dataHash,
                keccak256(bytes(creatorId)),
                authorSigner
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    /**
     * @notice Record an author attestation for `passportId`.
     * @dev Caller must be the passport's `creator` — this prevents a third party
     *      from squatting the single attestation slot with a key of their own. The signature
     *      itself must come from `authorSigner` over the passport's *current on-chain*
     *      `dataHash` and `creatorId`, so the binding cannot be pointed at other bytes.
     */
    function attestAuthor(
        string calldata passportId,
        address authorSigner,
        bytes calldata signature
    ) external {
        if (authorSigner == address(0)) revert EC(110);
        if (_attestation[passportId].authorSigner != address(0)) revert EC(111);

        // Reverts if the passport does not exist on the paired registry.
        IODPRegistry.PassportHeaderView memory h = odpRegistry.getPassportHeader(passportId);
        if (!(msg.sender == h.creator)) revert EC(112);
        if (odpRegistry.getPassportClassification(passportId).revoked) revert EC(11);

        _registered();
        bytes32 dataHash = odpRegistry.getPassportMedia(passportId).dataHash;
        bytes32 digest = _hashAuthorAttestation(passportId, dataHash, h.creatorId, authorSigner);
        if (_recover(digest, signature) != authorSigner) revert EC(115);

        _attestation[passportId] = AuthorAttestation({
            authorSigner: authorSigner,
            dataHash: dataHash,
            creatorId: h.creatorId,
            timestamp: block.timestamp,
            submittedBy: msg.sender
        });

        emit AuthorAttested(passportId, passportId, h.creatorId, authorSigner, h.creatorId, dataHash, msg.sender, block.timestamp);
    }

    /**
     * @notice Read the attestation for a passport.
     * @return attested   false when no author key has been bound.
     * @return authorSigner the attesting key.
     * @return dataHash   the `dataHash` that was signed — verifiers MUST compare this to the
     *                    passport's current on-chain `dataHash` before trusting the binding.
     * @return creatorId  the issuing profile the signature was bound to.
     * @return timestamp  when the attestation was recorded.
     */
    function getAuthorAttestation(string calldata passportId)
        external
        view
        returns (
            bool attested,
            address authorSigner,
            bytes32 dataHash,
            string memory creatorId,
            uint256 timestamp
        )
    {
        AuthorAttestation storage a = _attestation[passportId];
        if (a.authorSigner == address(0)) {
            return (false, address(0), bytes32(0), "", 0);
        }
        return (true, a.authorSigner, a.dataHash, a.creatorId, a.timestamp);
    }

    /// @dev Minimal ECDSA recover with EIP-2 low-s and valid-v enforcement (no malleable pairs).
    function _recover(bytes32 digest, bytes calldata signature) private pure returns (address) {
        if (signature.length != 65) revert EC(113);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) revert EC(114);
        if (v != 27 && v != 28) revert EC(114);
        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert EC(115);
        return signer;
    }
}
