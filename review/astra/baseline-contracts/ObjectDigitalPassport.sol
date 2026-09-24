// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ODPErrors.sol";
import {
    ODPAnchorBits,
    ODPEventKinds,
    PassportCoreMintInputs,
    PassportMintInputs
} from "./ODPPassportTypes.sol";
import "./ODPPassportLib.sol";

/**
 * Object Digital Passport — Smart Contract
 * @author Andrei Chernikov
 * Specification 0.6 draft (reference branch)
 * License: MIT
 *
 * Deployed on: Polygon PoS (chain ID 137)
 * Testnet:     Polygon Amoy (chain ID 80002)
 *
 * Two registries in one contract:
 *   1. Creator Registry  — C / B / P / M identifiers
 *   2. Passport Registry — physical, digital, and mixed object records
 * (Proofs, counterfeit flags, relations, extension mints live in satellites.)
 *
 * STORAGE MODEL 0.6 (docs/ru/REQUIREMENTS_FIELDS_V0.6.md):
 *   Layer A — immutable on-chain core: a human-readable card (`title`, `authorName`,
 *   `shortDescription`, `domain`) readable without the `.odpass` bundle, classification,
 *   and content anchors (`dataHash`, `anchorsHash` + `anchorTypesMask`, `imageHash`, `fileHash`).
 *   The card is written once at mint and has NO edit path: a typo means revoke + re-mint.
 *   Card values MUST match `passport.json` byte-for-byte; verifiers reject on any mismatch.
 *
 *   Layer B — append-only events: ownership transfers, `recordPassportEvent`
 *   (status / location / rights / condition / damage / restoration / custom), revocation.
 *   No overwritable current-state fields exist; current value = latest event, full
 *   history stays in the event log.
 *
 *   Layer C — `.odpass` bundle anchored by `dataHash`; the identification anchors array
 *   (photos, dimensions, materials, distinguishing features, marks, NFC seal, fingerprint, …)
 *   is additionally anchored by `anchorsHash` so it can be verified in isolation.
 *   Hard identification minimum is enforced at mint via `anchorTypesMask`:
 *   physical/mixed require photo+dimensions+materials+distinguishing_features and a primary
 *   `imageHash`; digital/mixed require `fileHash`.
 *
 * IMMUTABILITY:
 *   This contract is not upgradeable by design.
 *   No owner. No admin. No pause function. No selfdestruct.
 *   Rules cannot change after deployment.
 *   Protocol updates require a new contract (each reference line is a separate registry).
 *
 * SECURITY NOTES:
 *   - No protocol fee — native token only pays network gas
 *   - Extension mint uses staticcalls to registered `IODPExtension` (view) then state writes — no reentrancy loop into core
 *   - Solidity 0.8.20 — overflow/underflow protection built in
 *   - Access control enforced via `if (!(…)) revert EC(n);` on write paths
 *   - On-chain randomness (block.prevrandao + gasleft) is not cryptographically secure but is
 *     acceptable here since IDs carry no financial value — only human-readability
 *   - Proof institutions (P) and museums (M) are open registration — verifiers must warn
 *     users to confirm P/M-type IDs on official institution websites
 *   - Duplicate/competing passports are a reputation-layer concern (registration time,
 *     attestations, counterfeit flags); the protocol does not enforce global hash uniqueness
 *   - Mint agent: optional two-step handshake via the relations satellite
 *   - Anti-spam: monthly mint-rate limit per wallet (C = 1000, B = 100_000, P/M = unlimited)
 *   - Passport namespace: 100M IDs per year+month
 *
 * SOURCE CODE:
 *   Published at: https://github.com/object-digital-passport/object-digital-passport
 *   Anyone can read, verify, fork, or deploy their own instance.
 *
 * DEPLOY (EIP-170):
 *   Deploy linked library `ODPPassportLib` first, then deploy this contract with compiler linker
 *   metadata pointing at that library address (see `deploy/scripts/deploy.js`).
 */
interface IODPRelationsLookup {
    function mintAgentForCreator(string calldata creatorId) external view returns (address);
    function getCreatorPublishingDelegation(address creatorWallet) external view returns (address agent, uint256 expiresAt);
}

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

    // Anti-spam: per-wallet, per-calendar-month mint caps (no protocol fee). Tier follows profile ID prefix (C/B/P/M).
    uint32 internal constant MONTHLY_LIMIT_C = 1000;
    uint32 internal constant MONTHLY_LIMIT_B = 100_000;

    // ─── Structs ──────────────────────────────────────────────────────────────

    struct CreatorRecord {
        string  creatorId;    // "C-482-930-174-005"
        address wallet;
        bytes1  typePrefix;   // "C", "B", "P", or "M" — stored as bytes1 for gas efficiency
        uint256 timestamp;
        uint256 revokedAt;    // 0 = active; otherwise the block time the owner stopped this profile (SPEC §3)
    }

    struct Passport {
        string  passportId;      // Passport ID (SPEC); ODP-… string
        uint8   contractVersion; // packed SPEC_MAJOR/SPEC_MINOR (see CONTRACT_VERSION) at mint
        address creator;         // immutable issuer wallet at mint
        address owner;           // current holder; starts as creator; changes via transferPassport
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
        uint8   contentClass;     // 1..6 taxonomy: static/time_based/spatial/textual/composite/executable
        uint8   lifecycleStatus;  // current status; changes only via STATUS events (append-only)
        uint8   aiStatus;
        uint8   verificationMethod;
        uint8   editionModel;
        /// Commitment to canonical `passport.json` (layer C). Immutable after mint.
        bytes32 dataHash;
        /// Commitment to the canonical minified `anchors` array inside passport.json,
        /// verifiable in isolation (e.g. against an offline carrier payload).
        bytes32 anchorsHash;
        uint32  anchorTypesMask; // OR of ODPAnchorBits; mint enforces the hard minimum per objectType
        bytes32 imageHash;       // SHA-256 of primary photo; required non-zero for physical/mixed
        bytes32 fileHash;        // SHA-256 of digital original; bytes32(0) for physical
        string  dataUrl;         // mutable hosting hint (.odpass only)
        string  imageUrl;        // mutable hosting hint
        uint256 timestamp;       // mint block time — proof of the registration moment
        bool    revoked;         // passport revoked (creator or governance)
        uint256 revokedAt;
        bytes32 revocationReasonHash; // keccak256 of UTF-8 reason; 0 if not revoked
        /// Wallet that executed the mint for `creator`’s profile; `address(0)` = principal minted themselves.
        address mintAgent;
        // Append-only event summary (full history lives in the event log).
        uint32  eventCount;
        uint8   lastEventKind;
        uint256 lastEventAt;
    }

    struct PassportHeaderView {
        string  passportId;
        uint8   contractVersion;
        address creator;
        address owner;
        string  creatorId;
        uint32  year;
        uint8   month;
        string  title;
        string  authorName;
        string  shortDescription;
        string  domain;
        string  objectType;
    }

    /// @dev Shape consumed by satellite contracts (proofs, counterfeit flags) — keep stable.
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
        address mintAgent;
    }

    struct PassportMediaView {
        bytes32 dataHash;
        string  dataUrl;
        bytes32 imageHash;
        string  imageUrl;
        bytes32 fileHash;
        bytes32 anchorsHash;
        uint32  anchorTypesMask;
    }

    struct PassportEventsView {
        uint32  eventCount;
        uint8   lastEventKind;
        uint256 lastEventAt;
        uint8   lifecycleStatus;
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

    // Rate limiting — mints per wallet per calendar month (C/B tiers; P skips limit)
    // key = address → (yearMonth uint32 e.g. 202603) → count
    mapping(address => mapping(uint32 => uint32)) private _mintCount;

    /// Governance address (multisig / DAO): may revoke passports alongside creator.
    address public governance;

    /// Deployer wallet, captured at construction. The only address allowed to `freeze()`.
    address public immutable deployer;

    /// v0.x safety hatch: once frozen the registry accepts no new writes (reads stay open).
    /// Irreversible. PLANNED FOR REMOVAL IN STABLE v1 (see docs/ru/IDEAS_V1.md).
    bool public frozen;

    /// SPEC 0.7 §20.13 — paired `ODPEditionUnits` satellite, set by governance.
    address public editionUnits;

    /// SPEC 0.7 §20.13 — one-way: set on the first activation of any unit of an edition,
    /// never cleared. Only ever *blocks* revocation, so a mis-wired satellite cannot enable it.
    mapping(string => bool) private _revocationLocked;

    /// Optional satellite for P-affiliation, mint-agent delegation, and creator publishing delegation.
    address private relationsSatellite;
    /// Optional trusted router for extension mints; when calling through it, `_resolveMintPrincipal` uses `tx.origin`.
    address private extensionRouter;

    // ─── Events ───────────────────────────────────────────────────────────────

    event CreatorRegistered(
        string  indexed creatorId,
        address indexed wallet,
        bytes1          typePrefix,
        uint256         timestamp
    );

    /**
     * A profile owner stopped their own profile (SPEC §3). Irreversible, and carries no
     * date the caller chooses: the only timestamp is when the call landed. Whoever holds
     * the key can call this — including a thief — so the deliberate limit is that it can
     * only stop future issuance. It cannot reach back and mark passports already minted,
     * because a thief would use that to discredit the owner's entire history. Dating a
     * compromise is done off-chain, where the key alone is not enough to speak: the
     * issuer's own domain (§3).
     */
    event CreatorRevoked(
        string  indexed creatorId,
        address indexed wallet,
        uint256         timestamp
    );

    event PassportMinted(
        string  indexed passportId,
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
        address         mintAgent    // address(0) if principal called mint; else delegate wallet
    );

    event PassportUrlsUpdated(
        string indexed passportId,
        string         newDataUrl,
        string         newImageUrl
    );

    event PassportTransferred(
        string  indexed passportId,
        address indexed from,
        address indexed to,
        uint256 timestamp
    );

    event PassportRevoked(
        string  indexed passportId,
        address indexed revokedBy,
        bytes32 reasonHash,
        uint256 timestamp
    );

    /// Append-only state/history record (layer B). Full payload lives in the log;
    /// on-chain storage keeps only the summary counters.
    event PassportEventRecorded(
        string  indexed passportId,
        uint8   indexed kind,       // ODPEventKinds: 1=status 2=location 3=rights 4=condition 5=damage 6=restoration 7=custom
        uint8           value,      // new lifecycleStatus for kind=1; 0 otherwise
        string          note,
        bytes32         attachmentHash,
        string          attachmentUrl,
        address         recordedBy,
        uint256         timestamp
    );

    event RegistryFrozen(address indexed by, uint256 timestamp);

    /// Reverts once the registry has been frozen. Applied to every state-changing user path.
    modifier notFrozen() {
        if (frozen) revert EC(58);
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor() {
        deployer = msg.sender;
        governance = msg.sender;
    }

    /**
     * Irreversibly freeze the registry: no further mints, events, transfers,
     * revocations, URL updates, or registrations. All reads remain available.
     * Only the deploying wallet may call this. This is a v0.x safety hatch and
     * is planned to be removed in stable v1 (docs/ru/IDEAS_V1.md).
     */
    function freeze() external {
        if (!(msg.sender == deployer)) revert EC(57);
        frozen = true;
        emit RegistryFrozen(msg.sender, block.timestamp);
    }

    /// Governance may be a multisig or DAO-controlled address off-chain.
    function transferGovernance(address newGovernance) external {
        if (!(msg.sender == governance)) revert EC(56);
        if (!(newGovernance != address(0))) revert EC(55);
        governance = newGovernance;
    }

    /// @notice Register or clear the optional relations satellite used for affiliation and delegation flows.
    function setRelationsSatellite(address satellite) external {
        if (!(msg.sender == governance)) revert EC(56);
        relationsSatellite = satellite;
    }

    /// @notice Register or clear the optional extension mint router.
    function setExtensionRouter(address router) external {
        if (!(msg.sender == governance)) revert EC(56);
        extensionRouter = router;
    }

    /// SPEC 0.7 §20.13 — pair the `ODPEditionUnits` satellite. Governance only.
    function setEditionUnits(address units) external {
        if (!(msg.sender == governance)) revert EC(56);
        editionUnits = units;
    }

    /**
     * SPEC 0.7 §20.13 — close an edition's revocation window, permanently.
     * Called by the paired units satellite on the first activation of any unit.
     * One-way by construction: there is no unlock, for any caller, `governance` included.
     */
    function lockEditionRevocation(string calldata passportId) external {
        if (!(editionUnits != address(0) && msg.sender == editionUnits)) revert EC(117);
        if (!(_passports[passportId].creator != address(0))) revert EC(12);
        _revocationLocked[passportId] = true;
    }

    /// SPEC 0.7 §20.13 — true once the edition's revocation window has closed.
    function isRevocationLocked(string calldata passportId) external view returns (bool) {
        return _revocationLocked[passportId];
    }

    /**
     * SPEC 0.7 §20.10 — mint a passport for one unit of an edition.
     *
     * The fourth core hook, and the only mint path whose authority is **not** a registered
     * profile. `_resolveMintPrincipal` resolves a principal from `msg.sender` (or `tx.origin`
     * behind the extension router) and requires it to be a creator or a confirmed mint agent;
     * a unit-key signature is neither, and the sender here is deliberately a courier that
     * gains nothing (§20.9). So the units satellite vouches instead: it has already verified
     * a signature over `(edition, unitIndex, unitOwner)` against the edition's Merkle root
     * before calling.
     *
     * `creator` becomes the edition's issuer, `owner` the address the unit key named.
     *
     * Monthly mint caps are deliberately **not** applied. They exist to stop a wallet
     * spraying arbitrary records; here every mint costs the caller a distinct printed secret
     * from a committed set, which is the tighter bound, and charging a popular drop against
     * its issuer's cap would let buyers exhaust the issuer's own ability to mint.
     */
    function mintUnitPassport(
        PassportMintInputs calldata m,
        string calldata editionPassportId,
        address unitOwner,
        bool dataUrlIsFolderBase
    ) external returns (string memory passportId) {
        if (!(editionUnits != address(0) && msg.sender == editionUnits)) revert EC(117);
        if (frozen) revert EC(58);
        if (!(unitOwner != address(0))) revert EC(22);

        Passport storage ed = _passports[editionPassportId];
        if (!(ed.creator != address(0))) revert EC(12);
        if (!(!ed.revoked)) revert EC(11);

        ODPPassportLib.validatePhysicalMintInputs(m);
        _requireUtcYearMonth(m.core.year, m.core.month);

        PassportMintInputs memory mm = m;
        mm.initialOwner = unitOwner;
        return _mintCommit(ed.creatorId, OBJECT_PHYSICAL, mm, dataUrlIsFolderBase, ed.creator, address(0));
    }

    // ─── Creator Registry ─────────────────────────────────────────────────────

    /**
     * Register as a Creator (C), Brand (B), Proof Institution (P), or Museum (M).
     * One registration per wallet. Permanent.
     * Type prefix must be "C", "B", "P", or "M" — enforced by contract.
     * The 12-digit number is randomly generated — cannot be chosen.
     *
     * Cost: network gas only (no protocol fee).
     */
    function registerCreator(bytes1 typePrefix)
        external
        notFrozen
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
            timestamp:  block.timestamp,
            revokedAt:  0
        });

        _walletToCreatorId[msg.sender] = creatorId;
        _creatorNumberTaken[number]    = true;

        emit CreatorRegistered(creatorId, msg.sender, typePrefix, block.timestamp);
        return creatorId;
    }

    /**
     * Stop this wallet's own profile. Irreversible: there is no un-revoke, because a
     * thief holding the key would call it first. Already-minted passports are untouched —
     * an object does not stop being genuine because its issuer lost a wallet (§3, §11).
     * After this the wallet can no longer mint; the owner registers a new profile from a
     * new wallet and links the two on their own domain.
     */
    function revokeCreator() external notFrozen {
        string memory creatorId = _walletToCreatorId[msg.sender];
        if (!(bytes(creatorId).length > 0)) revert EC(3);
        CreatorRecord storage cr = _creators[creatorId];
        if (!(cr.revokedAt == 0)) revert EC(59);
        cr.revokedAt = block.timestamp;
        emit CreatorRevoked(creatorId, msg.sender, block.timestamp);
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
        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }
        uint256 n = end - offset;
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
        bool dataUrlIsFolderBase,
        address principalWallet,
        address mintAgentForPassport
    ) internal returns (string memory passportId) {
        passportId = _generatePassportId(m.core.year, m.core.month);
        string memory resolvedDataUrl = ODPPassportLib.resolveMintDataUrlMemory(m.dataUrl, dataUrlIsFolderBase, passportId);
        if (!(bytes(resolvedDataUrl).length <= 512)) revert EC(27);

        _passports[passportId] = Passport({
            passportId: passportId,
            contractVersion: CONTRACT_VERSION,
            creator: principalWallet,
            owner: m.initialOwner == address(0) ? principalWallet : m.initialOwner,
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
            imageHash: m.imageHash,
            fileHash: m.fileHash,
            dataUrl: resolvedDataUrl,
            imageUrl: m.imageUrl,
            timestamp: block.timestamp,
            revoked: false,
            revokedAt: 0,
            revocationReasonHash: bytes32(0),
            mintAgent: mintAgentForPassport,
            eventCount: 0,
            lastEventKind: 0,
            lastEventAt: 0
        });

        _creatorPassports[principalWallet].push(passportId);

        emit PassportMinted(
            passportId,
            principalWallet,
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
            mintAgentForPassport
        );
    }

    function mintPhysical(
        PassportMintInputs calldata m,
        bool dataUrlIsFolderBase,
        string calldata mintOnBehalfOfCreatorId
    ) external returns (string memory passportId) {
        (string memory creatorId, address principalWallet, address mintAgentAddr) = _beginMint(mintOnBehalfOfCreatorId);
        ODPPassportLib.validatePhysicalMintInputs(m);
        _requireUtcYearMonth(m.core.year, m.core.month);
        return _mintCommit(creatorId, OBJECT_PHYSICAL, m, dataUrlIsFolderBase, principalWallet, mintAgentAddr);
    }

    function mintDigital(
        PassportMintInputs calldata m,
        bool dataUrlIsFolderBase,
        string calldata mintOnBehalfOfCreatorId
    ) external returns (string memory passportId) {
        (string memory creatorId, address principalWallet, address mintAgentAddr) = _beginMint(mintOnBehalfOfCreatorId);
        ODPPassportLib.validateDigitalMintInputs(m);
        _requireUtcYearMonth(m.core.year, m.core.month);
        return _mintCommit(creatorId, OBJECT_DIGITAL, m, dataUrlIsFolderBase, principalWallet, mintAgentAddr);
    }

    function mintMixed(
        PassportMintInputs calldata m,
        bool dataUrlIsFolderBase,
        string calldata mintOnBehalfOfCreatorId
    ) external returns (string memory passportId) {
        (string memory creatorId, address principalWallet, address mintAgentAddr) = _beginMint(mintOnBehalfOfCreatorId);
        ODPPassportLib.validateMixedMintInputs(m);
        _requireUtcYearMonth(m.core.year, m.core.month);
        return _mintCommit(creatorId, OBJECT_MIXED, m, dataUrlIsFolderBase, principalWallet, mintAgentAddr);
    }

    // ─── Passport — Update ────────────────────────────────────────────────────

    function _canUpdatePassportUrls(Passport storage p) internal view returns (bool) {
        if (msg.sender == p.creator || msg.sender == p.owner) return true;
        address rel = relationsSatellite;
        if (rel == address(0)) return false;
        (address agent, uint256 expiresAt) = IODPRelationsLookup(rel).getCreatorPublishingDelegation(p.creator);
        return agent == msg.sender && expiresAt > block.timestamp;
    }

    /**
     * Update hosting URLs only — dataUrl and imageUrl.
     * Use this when moving the hosted `.odpass` bundle or image to a new host.
     *
     * ALL HASHES ARE IMMUTABLE after minting:
     *   dataHash, anchorsHash, imageHash, fileHash — cannot change ever.
     *
     * The caller must provide confirmedDataHash matching the on-chain dataHash.
     * This proves the caller knows the original content and prevents accidental
     * URL mistakes that would make the passport appear tampered.
     *
     * Note: this does NOT protect against a stolen wallet — dataHash is public
     * on-chain, so anyone with wallet access can read and pass it. This is a
     * UX safeguard, not a security mechanism.
     *
     * Authorized callers: passport **creator** or **owner**, or the **creator’s active publishing agent**
     * (`delegateCreatorPublishing` / `getCreatorPublishingDelegation`).
     *
     * Folder-base mint (`dataUrlIsFolderBase` on mint) only affects the **initial** stored URL.
     * This function always sets **literal** `newDataUrl` / `newImageUrl` (no folder resolution here).
     *
     * @param confirmedDataHash  Must equal the on-chain dataHash. Prevents
     *                           accidental URL updates pointing to wrong content.
     */
    function updatePassportUrls(
        string  calldata passportId,
        string  calldata newDataUrl,
        string  calldata newImageUrl,
        bytes32          confirmedDataHash
    ) external notFrozen {
        Passport storage p = _passports[passportId];
        if (!(p.creator != address(0))) revert EC(12);
        if (!(!p.revoked)) revert EC(11);
        if (!_canUpdatePassportUrls(p)) revert EC(26);
        if (!(p.dataHash == confirmedDataHash)) revert EC(25);
        if (!(bytes(newDataUrl).length <= 512)) revert EC(24);
        if (!(bytes(newImageUrl).length <= 512)) revert EC(23);

        p.dataUrl  = newDataUrl;
        p.imageUrl = newImageUrl;

        emit PassportUrlsUpdated(passportId, newDataUrl, newImageUrl);
    }

    /**
     * Record an append-only passport event (layer B): status / location / rights /
     * condition / damage / restoration / custom. Replaces the overwritable
     * current-state setters of earlier lines — history is never lost; the current
     * value is the latest event of a kind, read from the event log.
     *
     * For kind = STATUS(1), `value` is the new lifecycleStatus (1..4) and the stored
     * summary field is updated; for all other kinds `value` must be 0.
     * Optional attachment (damage report, restoration act, …): SHA-256 + URL hint.
     *
     * Authorized callers: **creator**, **owner**, or **governance**.
     */
    function recordPassportEvent(
        string  calldata passportId,
        uint8            kind,
        uint8            value,
        string  calldata note,
        bytes32          attachmentHash,
        string  calldata attachmentUrl
    ) external notFrozen {
        Passport storage p = _passports[passportId];
        if (!(p.creator != address(0))) revert EC(12);
        if (!(!p.revoked)) revert EC(11);
        if (!(msg.sender == p.creator || msg.sender == p.owner || msg.sender == governance)) revert EC(98);
        ODPPassportLib.validatePassportEventInputs(kind, value, note, attachmentHash, attachmentUrl);

        if (kind == ODPEventKinds.STATUS) {
            p.lifecycleStatus = value;
        }
        p.eventCount += 1;
        p.lastEventKind = kind;
        p.lastEventAt = block.timestamp;

        emit PassportEventRecorded(
            passportId,
            kind,
            value,
            note,
            attachmentHash,
            attachmentUrl,
            msg.sender,
            block.timestamp
        );
    }

    /// Current owner (starts as creator) may transfer the passport record to a new wallet.
    function transferPassport(string calldata passportId, address newOwner) external notFrozen {
        if (!(newOwner != address(0))) revert EC(22);
        Passport storage p = _passports[passportId];
        if (!(p.creator != address(0))) revert EC(12);
        if (!(!p.revoked)) revert EC(11);
        if (!(p.owner == msg.sender)) revert EC(19);
        p.owner = newOwner;
        emit PassportTransferred(passportId, msg.sender, newOwner, block.timestamp);
    }

    /**
     * Irreversible passport revocation. Creator or governance may revoke.
     * reasonHash should be keccak256(utf8(reason)) for verifiers; full text may live off-chain.
     * Revocation is also the only remedy for a card typo — the card has no edit path.
     */
    function revokePassport(string calldata passportId, bytes32 reasonHash) external notFrozen {
        Passport storage p = _passports[passportId];
        if (!(p.creator != address(0))) revert EC(12);
        if (!(!p.revoked)) revert EC(18);
        if (!(msg.sender == p.creator || msg.sender == governance)) revert EC(17);
        if (_revocationLocked[passportId]) revert EC(116);
        if (!(reasonHash != bytes32(0))) revert EC(16);
        p.revoked = true;
        p.revokedAt = block.timestamp;
        p.revocationReasonHash = reasonHash;
        emit PassportRevoked(passportId, msg.sender, reasonHash, block.timestamp);
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
            owner: p.owner,
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
            revocationReasonHash: p.revocationReasonHash,
            mintAgent: p.mintAgent
        });
    }

    function getPassportMedia(string calldata passportId)
        external view returns (PassportMediaView memory out)
    {
        Passport storage p = _passports[passportId];
        if (!(p.creator != address(0))) revert EC(12);
        out = PassportMediaView({
            dataHash: p.dataHash,
            dataUrl: p.dataUrl,
            imageHash: p.imageHash,
            imageUrl: p.imageUrl,
            fileHash: p.fileHash,
            anchorsHash: p.anchorsHash,
            anchorTypesMask: p.anchorTypesMask
        });
    }

    /// Append-only event summary; the full history is read from `PassportEventRecorded` logs.
    function getPassportEvents(string calldata passportId)
        external view returns (PassportEventsView memory out)
    {
        Passport storage p = _passports[passportId];
        if (!(p.creator != address(0))) revert EC(12);
        out = PassportEventsView({
            eventCount: p.eventCount,
            lastEventKind: p.lastEventKind,
            lastEventAt: p.lastEventAt,
            lifecycleStatus: p.lifecycleStatus
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

    /**
     * @return creatorId Profile id written on the passport.
     * @return principalWallet Issuer wallet (`Passport.creator` / initial `owner`).
     * @return mintAgentAddr `address(0)` if principal mints; else `msg.sender` (delegate).
     */
    function _resolveMintPrincipal(string calldata mintOnBehalfOfCreatorId)
        internal
        view
        returns (string memory creatorId, address principalWallet, address mintAgentAddr)
    {
        address actor = msg.sender;
        address router = extensionRouter;
        if (router != address(0) && msg.sender == router) {
            actor = tx.origin;
        }
        if (bytes(mintOnBehalfOfCreatorId).length == 0) {
            creatorId = _walletToCreatorId[actor];
            if (!(bytes(creatorId).length > 0)) revert EC(3);
            return (creatorId, actor, address(0));
        }
        creatorId = mintOnBehalfOfCreatorId;
        CreatorRecord storage cr = _creators[creatorId];
        if (!(bytes(cr.creatorId).length > 0)) revert EC(2);
        principalWallet = cr.wallet;
        if (actor == principalWallet) {
            return (creatorId, principalWallet, address(0));
        }
        address rel = relationsSatellite;
        if (rel == address(0)) revert EC(72);
        if (!(IODPRelationsLookup(rel).mintAgentForCreator(creatorId) == actor)) revert EC(72);
        return (creatorId, principalWallet, actor);
    }

    /** Enforce registration (caller or agent path), monthly limit on **principal** wallet, increment counter. */
    function _beginMint(string calldata mintOnBehalfOfCreatorId)
        internal
        returns (string memory creatorId, address principalWallet, address mintAgentAddr)
    {
        if (frozen) revert EC(58); // covers all mint paths incl. extension router
        (creatorId, principalWallet, mintAgentAddr) = _resolveMintPrincipal(mintOnBehalfOfCreatorId);
        // A revoked profile issues nothing, by any path — direct, agent, or extension router.
        if (!(_creators[creatorId].revokedAt == 0)) revert EC(131);
        _checkAndIncrementMintLimit(creatorId, principalWallet);
    }

    /// @dev `year`/`month` must match Gregorian UTC calendar of `block.timestamp` (ODP-ID prefix binds to mint month).
    function _requireUtcYearMonth(uint32 year, uint8 month) private view {
        (uint32 cy, uint8 cm) = ODPPassportLib.utcYearMonthFromTimestamp(block.timestamp);
        if (!(year == cy && month == cm)) revert EC(68);
    }

    function _isValidType(bytes1 t) internal pure returns (bool) {
        return t == TYPE_C || t == TYPE_B || t == TYPE_P || t == TYPE_M;
    }

    /**
     * Check monthly mint limit and increment counter (C/B only; P and M are unlimited).
     * Counts against **principal** issuer wallet (so an agent consumes the artist’s tier quota).
     * Resets on calendar month boundary (yearMonth key changes).
     */
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
        // Calendar math on block.timestamp, not randomness (triaged: not security-critical).
        // slither-disable-next-line weak-prng
        uint256 secsInYear = block.timestamp % 31_556_952;
        uint256 m = secsInYear / 2_629_746 + 1;
        if (m > 12) m = 12;
        return uint8(m);
    }

    // ─── Internal: ID generation ──────────────────────────────────────────────

    /**
     * Generate a unique profile ID number (0–999,999,999,999).
     * Uses keccak256 entropy with nonce. Retries on collision (max 25 attempts).
     */
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

    /**
     * Generate a unique Passport ID number (0–999,999,999) for year+month.
     * Uses keccak256 entropy with nonce. Retries on collision (max 25 attempts).
     */
    function _generatePassportId(uint32 year, uint8 month)
        internal returns (string memory)
    {
        uint32 key = uint32(year) * 100 + uint32(month);
        uint256 baseNonce = _passportNonce;
        for (uint i = 0; i < 25; i++) {
            // Human-readable ID entropy, not security randomness (see SECURITY NOTES header).
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

    // Approximate calendar from block.timestamp: rate-limit buckets only (±1 month drift acceptable).

}
