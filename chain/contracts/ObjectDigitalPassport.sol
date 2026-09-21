// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "./ODPErrors.sol";
import {PassportMintInputs, ODPAnchorBits} from "./ODPPassportTypes.sol";
import "./ODPPassportLib.sol";
/// @notice ODP 0.7 immutable registration core. No administrator or satellite callback.
/// @dev A profile wallet controls only its own issuance, role-bounded revocation and irreversible print finalization.
contract ObjectDigitalPassport {

    // ─── Constants ────────────────────────────────────────────────────────────

    bytes1 constant TYPE_C = "C";
    bytes1 constant TYPE_B = "B";
    bytes1 constant TYPE_P = "P";
    bytes1 constant TYPE_M = "M";

    string constant OBJECT_PHYSICAL = "physical";
    string constant OBJECT_DIGITAL  = "digital";
    string constant OBJECT_MIXED    = "mixed";

    // On-chain spec line (variant: two uint8s, human-readable as major.minor).
    // Not `public` — each public constant adds a getter (~bytecode budget, EIP-170). Use `CONTRACT_VERSION` / 16 and % 16.
    uint8 internal constant SPEC_MAJOR = 0;
    uint8 internal constant SPEC_MINOR = 7;

    /// Packed byte in `Passport.contractVersion`: `SPEC_MAJOR * 16 + SPEC_MINOR` (each < 16).
    /// The reference line (spec 0.7) uses packed byte **7**.
    uint8 public constant CONTRACT_VERSION = SPEC_MAJOR * 16 + SPEC_MINOR;

    // Anti-spam: per-wallet, per approximate month mint caps (no protocol fee). Tier follows profile ID prefix (C/B/P/M).
    uint32 internal constant MONTHLY_LIMIT_C = 1000;
    uint32 internal constant MONTHLY_LIMIT_B = 100_000;

    // ─── Structs ──────────────────────────────────────────────────────────────

    struct CreatorRecord {
        string  creatorId;    // "C-482-930-174-005"
        address wallet;
        bytes1  typePrefix;   // "C", "B", "P", or "M" — stored as bytes1 for gas efficiency
        uint256 timestamp;
    }

    struct Passport {
        string  passportId;      // Passport ID (SPEC); ODP-… string
        uint8   contractVersion; // packed SPEC_MAJOR/SPEC_MINOR (see CONTRACT_VERSION) at mint
        address creator;         // immutable issuer wallet at mint
        string  creatorId;       // Profile ID (SPEC); mandatory
        uint32  year;            // UTC mint calendar year
        uint8   month;
        // On-chain card — immutable, readable without the .odpass bundle,
        // byte-for-byte equal to the same fields in passport.json.
        string  title;            // 1..128 bytes
        string  authorName;       // 1..128 bytes
        string  shortDescription; // 1..256 bytes
        string  domain;           // <=128 bytes
        string  objectType;       // "physical", "digital", or "mixed"
        uint8   contentClass;
        uint8   lifecycleStatus;  // Immutable status at registration.
        uint8   aiStatus;
        uint8   verificationMethod;
        uint8   editionModel;
        /// Commitment to canonical `passport.json` (layer C). Immutable after mint.
        bytes32 dataHash;
        /// Commitment to the canonical minified `anchors` array inside passport.json,
        /// verifiable in isolation (e.g. against an offline carrier payload).
        bytes32 anchorsHash;
        uint32  anchorTypesMask; // OR of ODPAnchorBits; mint enforces the hard minimum per objectType
        bytes32 editionCommitment;
        bytes32 imageHash;       // SHA-256 of primary photo; required non-zero for physical/mixed
        bytes32 fileHash;        // SHA-256 of digital original; bytes32(0) for physical
        uint256 timestamp;       // mint block time — proof of the registration moment
        bool revoked;
        uint256 revokedAt;
        bytes32 revocationReasonHash; // keccak256 of UTF-8 reason; 0 if not revoked
    }

    struct PassportHeaderView {
        string  passportId;
        uint8   contractVersion;
        address creator;
        string  creatorId;
        uint32  year;
        uint8   month;
        string  title;
        string  authorName;
        string  shortDescription;
        string  domain;
        string  objectType;
    }

    /// @dev Shape consumed by satellite contracts (institutional statements) — keep stable.
    struct PassportClassificationView {
        uint8   contentClass;
        uint8   lifecycleStatus;
        uint8   aiStatus;
        uint8   verificationMethod;
        uint8   editionModel;
        uint256 timestamp;
        bool    revoked;
        uint256 revokedAt;
        bytes32 revocationReasonHash;
    }

    struct PassportMediaView {
        bytes32 dataHash;
        bytes32 imageHash;
        bytes32 fileHash;
        bytes32 anchorsHash;
        uint32  anchorTypesMask;
        bytes32 editionCommitment;
    }

    // ─── Storage ──────────────────────────────────────────────────────────────

    // Creator Registry
    mapping(string  => CreatorRecord) private _creators;
    mapping(address => string)        private _walletToCreatorId;
    mapping(uint64  => bool)          private _creatorNumberTaken;
    uint256 private _creatorNonce;

    // Passport Registry
    // key = year * 100 + month → set of random numbers taken
    mapping(uint32 => mapping(uint32 => bool)) private _passportNumberTaken;
    mapping(string => Passport)   private _passports;
    mapping(address => string[])  private _creatorPassports;
    uint256 private _passportNonce;

    // Rate limiting — mints per wallet per approximate month (C/B tiers; P skips limit)
    // key = address → (approximate yearMonth bucket) → count
    mapping(address => mapping(uint32 => uint32)) private _mintCount;

    uint256 public constant PERSONAL_REVOCATION_WINDOW = 72 hours;
    uint256 public constant ISSUER_REVOCATION_WINDOW = 24 hours;
    mapping(string => uint256) private _printFinalizedAt;
    struct PassportReleaseView { uint256 revocationDeadline; uint256 printFinalizedAt; }
    error PassportPrintFinalized();
    event PassportFinalizedForPrint(string indexed passportId, string passportIdText, address indexed issuer, uint256 timestamp);
    uint256 public constant MAX_PAGE_SIZE = 100;
    struct MintOperation { bytes32 digest; string passportId; }
    mapping(address => mapping(bytes32 => MintOperation)) private _mintOperations;
    error InvalidEditionCommitment();
    error InvalidOperationId();
    error MintOperationConflict(bytes32 operationId);
    error AlreadyCommitted(bytes32 operationId, string passportId);
    event MintOperationCommitted(address indexed issuer, bytes32 indexed operationId,
        bytes32 digest, string passportId);

    // ─── Events ───────────────────────────────────────────────────────────────

    event CreatorRegistered(
        string  indexed creatorId,
        string          creatorIdText,
        address indexed wallet,
        bytes1          typePrefix,
        uint256         timestamp
    );


    event PassportMinted(
        string  indexed passportId,
        string          passportIdText,
        address indexed creator,
        string          creatorId,
        string          title,
        string          authorName,
        string          domain,
        string          objectType,
        uint8           contentClass,
        uint32          year,
        uint8           month,
        bytes32         dataHash,
        bytes32         anchorsHash,
        uint32          anchorTypesMask,
        uint256         timestamp,
        bytes32         operationId
    );

    event PassportRevoked(
        string  indexed passportId,
        string          passportIdText,
        address indexed revokedBy,
        bytes32 reasonHash,
        uint256 timestamp
    );

    // ─── Creator Registry ─────────────────────────────────────────────────────

    function registerCreator(bytes1 typePrefix)
        external
        returns (string memory creatorId)
    {
        if (!(_isValidType(typePrefix))) revert EC(54);
        if (!(bytes(_walletToCreatorId[msg.sender]).length == 0)) revert EC(53);

        uint64 number = _generateCreatorNumber();
        creatorId     = ODPPassportLib.buildCreatorId(typePrefix, number);

        _creators[creatorId] = CreatorRecord({
            creatorId:  creatorId,
            wallet:     msg.sender,
            typePrefix: typePrefix,
            timestamp:  block.timestamp
        });

        _walletToCreatorId[msg.sender] = creatorId;
        _creatorNumberTaken[number]    = true;

        emit CreatorRegistered(creatorId, creatorId, msg.sender, typePrefix, block.timestamp);
        return creatorId;
    }


    function getCreator(string calldata creatorId)
        external view returns (CreatorRecord memory)
    {
        if (!(bytes(_creators[creatorId].creatorId).length > 0)) revert EC(2);
        return _creators[creatorId];
    }

    function getCreatorByWallet(address wallet)
        external view returns (string memory)
    {
        return _walletToCreatorId[wallet];
    }

    function _stringArraySlice(string[] storage arr, uint256 offset, uint256 limit)
        internal
        view
        returns (string[] memory result, uint256 total)
    {
        total = arr.length;
        if (offset >= total) {
            return (new string[](0), total);
        }
        uint256 n = limit > MAX_PAGE_SIZE ? MAX_PAGE_SIZE : limit;
        if (n > total - offset) n = total - offset;
        result = new string[](n);
        for (uint256 i = 0; i < n; i++) {
            result[i] = arr[offset + i];
        }
    }

    // ─── Passport Registry — Mint ─────────────────────────────────────────────

    function _mintCommit(
        string memory creatorId,
        string memory objectType,
        PassportMintInputs memory m,
        bytes32 operationId
    ) internal returns (string memory passportId) {
        passportId = _generatePassportId(m.core.year, m.core.month);

        _passports[passportId] = Passport({
            passportId: passportId,
            contractVersion: CONTRACT_VERSION,
            creator: msg.sender,
            creatorId: creatorId,
            year: m.core.year,
            month: m.core.month,
            title: m.core.title,
            authorName: m.core.authorName,
            shortDescription: m.core.shortDescription,
            domain: m.core.domain,
            objectType: objectType,
            contentClass: m.core.contentClass,
            lifecycleStatus: m.core.lifecycleStatus,
            aiStatus: m.core.aiStatus,
            verificationMethod: m.core.verificationMethod,
            editionModel: m.core.editionModel,
            dataHash: m.dataHash,
            anchorsHash: m.anchorsHash,
            anchorTypesMask: m.anchorTypesMask,
            editionCommitment: m.editionCommitment,
            imageHash: m.imageHash,
            fileHash: m.fileHash,
            timestamp: block.timestamp,
            revoked: false,
            revokedAt: 0,
            revocationReasonHash: bytes32(0)
        });

        _creatorPassports[msg.sender].push(passportId);
        bytes32 digest = _mintDigest(objectType, m);
        _mintOperations[msg.sender][operationId] = MintOperation(digest, passportId);
        emit MintOperationCommitted(msg.sender, operationId, digest, passportId);

        emit PassportMinted(
            passportId,
            passportId,
            msg.sender,
            creatorId,
            m.core.title,
            m.core.authorName,
            m.core.domain,
            objectType,
            m.core.contentClass,
            m.core.year,
            m.core.month,
            m.dataHash,
            m.anchorsHash,
            m.anchorTypesMask,
            block.timestamp,
            operationId
        );
    }

    function mintPhysical(
        PassportMintInputs calldata m,
        bytes32 operationId
    ) external returns (string memory passportId) {
        string memory creatorId = _beginMint(OBJECT_PHYSICAL, m, operationId);
        _validateEditionBits(creatorId, m);
        ODPPassportLib.validatePhysicalMintInputs(m);
        _requireUtcYearMonth(m.core.year, m.core.month);
        return _mintCommit(creatorId, OBJECT_PHYSICAL, m, operationId);
    }

    function mintDigital(
        PassportMintInputs calldata m,
        bytes32 operationId
    ) external returns (string memory passportId) {
        string memory creatorId = _beginMint(OBJECT_DIGITAL, m, operationId);
        _validateEditionBits(creatorId, m);
        ODPPassportLib.validateDigitalMintInputs(m);
        _requireUtcYearMonth(m.core.year, m.core.month);
        return _mintCommit(creatorId, OBJECT_DIGITAL, m, operationId);
    }

    function mintMixed(
        PassportMintInputs calldata m,
        bytes32 operationId
    ) external returns (string memory passportId) {
        string memory creatorId = _beginMint(OBJECT_MIXED, m, operationId);
        _validateEditionBits(creatorId, m);
        ODPPassportLib.validateMixedMintInputs(m);
        _requireUtcYearMonth(m.core.year, m.core.month);
        return _mintCommit(creatorId, OBJECT_MIXED, m, operationId);
    }

    // ─── Passport — Update ────────────────────────────────────────────────────

    function revokePassport(string calldata passportId, bytes32 reasonHash) external {
        Passport storage p = _passports[passportId];
        if (!(p.creator != address(0))) revert EC(12);
        if (!(!p.revoked)) revert EC(18);
        if (msg.sender != p.creator) revert EC(17);
        if (_printFinalizedAt[passportId] != 0) revert PassportPrintFinalized();
        if (block.timestamp > _revocationDeadline(p)) revert EC(132);
        if (!(reasonHash != bytes32(0))) revert EC(16);
        p.revoked = true;
        p.revokedAt = block.timestamp;
        p.revocationReasonHash = reasonHash;
        emit PassportRevoked(passportId, passportId, msg.sender, reasonHash, block.timestamp);
    }

    /// @notice Permanently closes revocation before print export, including for unique passports.
    /// Does not observe a printer, open an edition, or alter any satellite lifecycle.
    /// Repeating the same finalized request is a no-op for crash/retry recovery.
    function finalizePassportForPrint(string calldata passportId) external {
        Passport storage p = _passports[passportId];
        if (p.creator == address(0)) revert EC(12);
        if (msg.sender != p.creator) revert EC(17);
        if (p.revoked) revert EC(18);
        if (_printFinalizedAt[passportId] != 0) return;
        _printFinalizedAt[passportId] = block.timestamp;
        emit PassportFinalizedForPrint(passportId, passportId, msg.sender, block.timestamp);
    }

    function getPassportReleaseState(string calldata passportId)
        external view returns (PassportReleaseView memory out)
    {
        Passport storage p = _passports[passportId];
        if (p.creator == address(0)) revert EC(12);
        return PassportReleaseView(_revocationDeadline(p), _printFinalizedAt[passportId]);
    }

    function _revocationDeadline(Passport storage p) private view returns (uint256) {
        return p.timestamp + (_creators[p.creatorId].typePrefix == TYPE_C
            ? PERSONAL_REVOCATION_WINDOW : ISSUER_REVOCATION_WINDOW);
    }

    // ─── Passport — Read ──────────────────────────────────────────────────────

    /// Full on-chain card in one call — the passport is meaningful without the bundle.
    function getPassportHeader(string calldata passportId)
        external view returns (PassportHeaderView memory out)
    {
        Passport storage p = _passports[passportId];
        if (!(p.creator != address(0))) revert EC(12);
        out = PassportHeaderView({
            passportId: p.passportId,
            contractVersion: p.contractVersion,
            creator: p.creator,
            creatorId: p.creatorId,
            year: p.year,
            month: p.month,
            title: p.title,
            authorName: p.authorName,
            shortDescription: p.shortDescription,
            domain: p.domain,
            objectType: p.objectType
        });
    }

    function getPassportClassification(string calldata passportId)
        external view returns (PassportClassificationView memory out)
    {
        Passport storage p = _passports[passportId];
        if (!(p.creator != address(0))) revert EC(12);
        out = PassportClassificationView({
            contentClass: p.contentClass,
            lifecycleStatus: p.lifecycleStatus,
            aiStatus: p.aiStatus,
            verificationMethod: p.verificationMethod,
            editionModel: p.editionModel,
            timestamp: p.timestamp,
            revoked: p.revoked,
            revokedAt: p.revokedAt,
            revocationReasonHash: p.revocationReasonHash
        });
    }

    function getPassportMedia(string calldata passportId)
        external view returns (PassportMediaView memory out)
    {
        Passport storage p = _passports[passportId];
        if (!(p.creator != address(0))) revert EC(12);
        out = PassportMediaView({
            dataHash: p.dataHash,
            imageHash: p.imageHash,
            fileHash: p.fileHash,
            anchorsHash: p.anchorsHash,
            anchorTypesMask: p.anchorTypesMask,
            editionCommitment: p.editionCommitment
        });
    }

    function getPassportsByCreatorPaged(address creator, uint256 offset, uint256 limit)
        external
        view
        returns (string[] memory result, uint256 total)
    {
        return _stringArraySlice(_creatorPassports[creator], offset, limit);
    }

    // ─── Internal: validation ─────────────────────────────────────────────────

    /// @dev The sender is always the issuer. No delegate or tx.origin path exists.
    function _beginMint(string memory kind, PassportMintInputs calldata m, bytes32 operationId)
        internal returns (string memory creatorId)
    {
        if (operationId == bytes32(0)) revert InvalidOperationId();
        MintOperation storage prior = _mintOperations[msg.sender][operationId];
        // Recovery remains available after month rollover; a replay never consumes quota.
        if (bytes(prior.passportId).length != 0) {
            if (prior.digest != _mintDigest(kind, m)) revert MintOperationConflict(operationId);
            revert AlreadyCommitted(operationId, prior.passportId);
        }
        creatorId = _registeredProfile();
        _checkAndIncrementMintLimit(creatorId, msg.sender);
    }

    function _mintDigest(string memory kind, PassportMintInputs memory m) private view returns (bytes32) {
        return keccak256(abi.encode("ODP-MINT-OPERATION-0.7", block.chainid, address(this), msg.sender, kind, m));
    }

    function getMintOperation(address issuer, bytes32 operationId)
        external view returns (bytes32 digest, string memory passportId)
    {
        MintOperation storage op = _mintOperations[issuer][operationId];
        return (op.digest, op.passportId);
    }

    /// @dev `year`/`month` must match Gregorian UTC calendar of `block.timestamp` (ODP-ID prefix binds to mint month).
    function _requireUtcYearMonth(uint32 year, uint8 month) private view {
        (uint32 cy, uint8 cm) = ODPPassportLib.utcYearMonthFromTimestamp(block.timestamp);
        if (!(year == cy && month == cm)) revert EC(68);
    }

    function _isValidType(bytes1 t) internal pure returns (bool) {
        return t == TYPE_C || t == TYPE_B || t == TYPE_P || t == TYPE_M;
    }

    function _checkAndIncrementMintLimit(string memory creatorId, address principalWallet) internal {
        bytes1 t = _creators[creatorId].typePrefix;
        if (t == TYPE_P || t == TYPE_M) {
            return;
        }
        uint32 limit = (t == TYPE_B) ? MONTHLY_LIMIT_B : MONTHLY_LIMIT_C;
        uint32 ym = _currentYearMonth();
        uint32 count = _mintCount[principalWallet][ym];
        if (!(count < limit)) revert EC(1);
        _mintCount[principalWallet][ym] = count + 1;
    }

    function _currentYearMonth() internal view returns (uint32) {
        uint32 year = _currentYear();
        uint8 month = _currentMonth();
        return year * 100 + uint32(month);
    }

    function _currentYear() internal view returns (uint32) {
        return uint32(1970 + block.timestamp / 31_556_952);
    }

    function _currentMonth() internal view returns (uint8) {
        // Approximate quota bucket on block.timestamp, not randomness (triaged: not security-critical).
        // slither-disable-next-line weak-prng
        uint256 secsInYear = block.timestamp % 31_556_952;
        uint256 m = secsInYear / 2_629_746 + 1;
        if (m > 12) m = 12;
        return uint8(m);
    }

    // ─── Internal: ID generation ──────────────────────────────────────────────

    function _generateCreatorNumber() internal returns (uint64) {
        uint256 baseNonce = _creatorNonce;
        for (uint i = 0; i < 25; i++) {
            // Combine multiple sources for better unpredictability.
            // Note: on-chain entropy is never truly random — IDs are not
            // security-critical (no funds at stake), so this is acceptable.
            // slither-disable-next-line weak-prng
            uint64 n = uint64(uint256(keccak256(abi.encodePacked(
                block.timestamp,
                block.prevrandao,   // replaces block.difficulty post-Merge
                msg.sender,
                baseNonce + i,
                gasleft()
            ))) % 1_000_000_000_000);
            if (!_creatorNumberTaken[n]) {
                _creatorNonce = baseNonce + i + 1;
                return n;
            }
        }
        revert EC(62);
    }

    function _generatePassportId(uint32 year, uint8 month)
        internal returns (string memory)
    {
        uint32 key = uint32(year) * 100 + uint32(month);
        uint256 baseNonce = _passportNonce;
        for (uint i = 0; i < 25; i++) {
            // Human-readable ID entropy, not security randomness (see SPEC.md).
            // slither-disable-next-line weak-prng
            uint32 n = uint32(uint256(keccak256(abi.encodePacked(
                block.timestamp,
                block.prevrandao,
                msg.sender,
                baseNonce + i,
                key,
                gasleft()
            ))) % 1_000_000_000);
            if (!_passportNumberTaken[key][n]) {
                _passportNonce = baseNonce + i + 1;
                _passportNumberTaken[key][n] = true;
                return ODPPassportLib.formatOdpPassportId(year, month, n);
            }
        }
        revert EC(61);
    }

    // Approximate quota buckets are deliberately separate from the Gregorian ID calendar.

    function passportExists(string calldata id) external view returns (bool) {
        return _passports[id].creator != address(0);
    }
    function _registeredProfile() internal view returns (string memory id) {
        id = _walletToCreatorId[msg.sender];
        if (bytes(id).length == 0) revert EC(3);
    }
    function _validateEditionBits(string memory id, PassportMintInputs calldata m) internal view {
        if ((m.anchorTypesMask & (ODPAnchorBits.UNIT_KEY_SET | ODPAnchorBits.UNIT_VARIANT_COMMIT)) != 0
            && _creators[id].typePrefix != TYPE_B) revert EC(121);
        // Every non-unique model is B-only, even without unit anchors.
        if (m.core.editionModel >= 2 && m.core.editionModel <= 4
            && _creators[id].typePrefix != TYPE_B) revert EC(121);
        bool hasUnits = (m.anchorTypesMask & ODPAnchorBits.UNIT_KEY_SET) != 0;
        if (hasUnits != (m.editionCommitment != bytes32(0))) revert InvalidEditionCommitment();
        if (hasUnits && m.core.editionModel != 2 && m.core.editionModel != 3) revert EC(122);
    }
}
