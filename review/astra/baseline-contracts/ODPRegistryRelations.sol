// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ODPErrors.sol";

/**
 * Satellite: affiliation, mint-agent delegation, and creator publishing delegation.
 * Deploy after `ObjectDigitalPassport`; constructor takes the registry address.
 * The main registry may consult this contract for mint-agent and publishing-agent reads.
 *
 * Affiliation links one organisation profile to a parent organisation profile through a
 * two-step handshake (child proposes, parent confirms). Eligible types are `B`, `M` and `P`
 * in any combination; `C` is excluded — an individual has no divisions, and `C -> C` would
 * only be a way to attach oneself to somebody else's name. The link is display-only: it
 * grants no rights, no mint allowance and no inherited trust (see SPEC.md section 4).
 */
interface IODPRegistryForRelations {
    struct CreatorRecord {
        string creatorId;
        address wallet;
        bytes1 typePrefix;
        uint256 timestamp;
    }

    function getCreatorByWallet(address wallet) external view returns (string memory);
    function getCreator(string calldata creatorId) external view returns (CreatorRecord memory);
}

contract ODPRegistryRelations {
    IODPRegistryForRelations public immutable odpRegistry;

    bytes1 private constant TYPE_B = "B";
    bytes1 private constant TYPE_M = "M";
    bytes1 private constant TYPE_P = "P";

    uint16 private constant MAX_ACTIVE_CHILDREN_PER_PARENT = 100;
    uint16 private constant MAX_PENDING_PARENTS_PER_CHILD = 100;

    /**
     * Hops the cycle check walks upward from a proposed parent before giving up.
     * Affiliation is multi-level on purpose (a school under a university under a
     * consortium), so depth cannot be forbidden outright — but an unbounded walk is an
     * unbounded gas cost, so a chain whose ancestors do not terminate within this many
     * hops is rejected instead of traversed.
     */
    uint256 private constant MAX_AFFILIATION_WALK = 8;

    mapping(bytes32 => bool) private _pendingAffiliation;
    mapping(string => string) private _parentOf;
    mapping(string => string[]) private _childrenOf;
    mapping(string => uint16) private _activeChildrenCountByParent;
    mapping(string => uint16) private _pendingParentsCountByChild;
    mapping(string => uint256) private _affiliationJoinedAt;
    mapping(string => uint256) private _affiliationDetachedAt;
    mapping(string => string) private _lastDetachedParent;

    struct DelegationInfo {
        address agent;
        uint256 expiresAt;
    }

    mapping(address => DelegationInfo) private _creatorPublishDelegation;
    mapping(string => address) private _mintAgentForCreator;
    mapping(bytes32 => bool) private _mintAgentDelegationPending;

    event MintAgentUpdate(string indexed principalCreatorId, address indexed agent, uint8 kind, uint256 timestamp);
    event AffiliationProposed(string indexed parentId, string indexed childId, uint256 timestamp);
    event AffiliationConfirmed(string indexed parentId, string indexed childId, uint256 timestamp);
    event AffiliationDetached(string indexed parentId, string indexed childId, uint256 timestamp);
    event CreatorPublishingDelegated(address indexed creator, address indexed agent, uint256 expiresAt);
    event CreatorPublishingDelegationRevoked(address indexed creator, uint256 timestamp);

    constructor(address registry_) {
        odpRegistry = IODPRegistryForRelations(registry_);
    }

    function proposeAffiliation(string calldata parentId) external {
        string memory childId = _requireRegistered();
        _requireAffiliationType(childId);
        if (!(bytes(parentId).length > 0)) revert EC(49);
        if (!(keccak256(bytes(parentId)) != keccak256(bytes(childId)))) revert EC(46);
        _requireAffiliationType(parentId);
        if (!(bytes(_parentOf[childId]).length == 0)) revert EC(45);
        if (!(_pendingParentsCountByChild[childId] < MAX_PENDING_PARENTS_PER_CHILD)) revert EC(48);
        // Early feedback only. State can move between propose and confirm, so the
        // authoritative cycle check is the one in confirmAffiliation.
        _requireNoCycle(parentId, childId);

        // Triaged encodePacked collision: both IDs are validated registered profiles with
        // the fixed contract-generated format T-NNN-NNN-NNN-NNN (17 chars) — fixed-length
        // concatenation is unambiguous. Next contract generation should use abi.encode.
        // slither-disable-next-line encode-packed-collision
        bytes32 k = keccak256(abi.encodePacked(parentId, childId));
        if (!(!_pendingAffiliation[k])) revert EC(47);
        _pendingAffiliation[k] = true;
        _pendingParentsCountByChild[childId] = _pendingParentsCountByChild[childId] + 1;

        emit AffiliationProposed(parentId, childId, block.timestamp);
    }

    function confirmAffiliation(string calldata childId) external {
        string memory parentId = _requireRegistered();
        _requireAffiliationType(parentId);
        _requireAffiliationType(childId);
        if (!(keccak256(bytes(parentId)) != keccak256(bytes(childId)))) revert EC(46);
        if (!(bytes(_parentOf[childId]).length == 0)) revert EC(45);

        // Triaged: fixed-format registered IDs — see proposeAffiliation note.
        // slither-disable-next-line encode-packed-collision
        bytes32 k = keccak256(abi.encodePacked(parentId, childId));
        if (!(_pendingAffiliation[k])) revert EC(42);
        delete _pendingAffiliation[k];
        _pendingParentsCountByChild[childId] = _pendingParentsCountByChild[childId] - 1;

        if (!(_activeChildrenCountByParent[parentId] < MAX_ACTIVE_CHILDREN_PER_PARENT)) revert EC(44);
        _requireNoCycle(parentId, childId);

        _parentOf[childId] = parentId;
        _childrenOf[parentId].push(childId);
        _activeChildrenCountByParent[parentId] = _activeChildrenCountByParent[parentId] + 1;

        _affiliationJoinedAt[childId] = block.timestamp;
        delete _affiliationDetachedAt[childId];
        delete _lastDetachedParent[childId];

        emit AffiliationConfirmed(parentId, childId, block.timestamp);
    }

    function detachAffiliation(string calldata childId) external {
        string memory parentId = _requireRegistered();
        _requireAffiliationType(parentId);
        _requireAffiliationType(childId);
        if (!(keccak256(bytes(_parentOf[childId])) == keccak256(bytes(parentId)))) revert EC(43);

        _removeChildFromParentList(parentId, childId);
        delete _parentOf[childId];
        _activeChildrenCountByParent[parentId] = _activeChildrenCountByParent[parentId] - 1;

        _affiliationDetachedAt[childId] = block.timestamp;
        _lastDetachedParent[childId] = parentId;

        emit AffiliationDetached(parentId, childId, block.timestamp);
    }

    function getAffiliationAudit(string calldata childId)
        external
        view
        returns (
            string memory activeParent,
            uint256 joinedAt,
            uint256 detachedAt,
            string memory lastDetachedFromParent
        )
    {
        activeParent = _parentOf[childId];
        joinedAt = _affiliationJoinedAt[childId];
        detachedAt = _affiliationDetachedAt[childId];
        lastDetachedFromParent = _lastDetachedParent[childId];
    }

    function cancelAffiliationRequest(string calldata parentId) external {
        string memory childId = _requireRegistered();
        _requireAffiliationType(childId);
        // Triaged: fixed-format registered IDs — see proposeAffiliation note.
        // slither-disable-next-line encode-packed-collision
        bytes32 k = keccak256(abi.encodePacked(parentId, childId));
        if (!(_pendingAffiliation[k])) revert EC(42);
        delete _pendingAffiliation[k];
        _pendingParentsCountByChild[childId] = _pendingParentsCountByChild[childId] - 1;
    }

    function isAffiliationPending(string calldata parentId, string calldata childId)
        external
        view
        returns (bool)
    {
        // Triaged: view over the same fixed-format key space — see proposeAffiliation note.
        // slither-disable-next-line encode-packed-collision
        return _pendingAffiliation[keccak256(abi.encodePacked(parentId, childId))];
    }

    function getAffiliatedParent(string calldata childId) external view returns (string memory) {
        return _parentOf[childId];
    }

    function getAffiliatedChildren(string calldata parentId) external view returns (string[] memory) {
        return _childrenOf[parentId];
    }

    function getAffiliatedChildrenPaged(string calldata parentId, uint256 offset, uint256 limit)
        external
        view
        returns (string[] memory result, uint256 total)
    {
        return _stringArraySlice(_childrenOf[parentId], offset, limit);
    }

    function requestMintAgentRole(string calldata principalCreatorId) external {
        if (!(bytes(principalCreatorId).length > 0)) revert EC(76);
        IODPRegistryForRelations.CreatorRecord memory cr = odpRegistry.getCreator(principalCreatorId);
        if (!(msg.sender != cr.wallet)) revert EC(75);
        if (_mintAgentForCreator[principalCreatorId] == msg.sender) {
            return;
        }
        bytes32 k = keccak256(abi.encodePacked(principalCreatorId, msg.sender));
        if (!(!_mintAgentDelegationPending[k])) revert EC(74);
        _mintAgentDelegationPending[k] = true;
        emit MintAgentUpdate(principalCreatorId, msg.sender, 0, block.timestamp);
    }

    function confirmMintAgentRole(address agent) external {
        if (!(agent != address(0))) revert EC(21);
        string memory creatorId = _requireRegistered();
        bytes32 k = keccak256(abi.encodePacked(creatorId, agent));
        if (!(_mintAgentDelegationPending[k])) revert EC(73);
        delete _mintAgentDelegationPending[k];
        address prev = _mintAgentForCreator[creatorId];
        _mintAgentForCreator[creatorId] = agent;
        if (prev != address(0) && prev != agent) {
            emit MintAgentUpdate(creatorId, prev, 3, block.timestamp);
        }
        emit MintAgentUpdate(creatorId, agent, 2, block.timestamp);
    }

    function revokeMintAgentRole() external {
        string memory creatorId = _requireRegistered();
        address prev = _mintAgentForCreator[creatorId];
        if (!(prev != address(0))) revert EC(79);
        delete _mintAgentForCreator[creatorId];
        emit MintAgentUpdate(creatorId, prev, 3, block.timestamp);
    }

    function renounceMintAgentRole(string calldata principalCreatorId) external {
        if (!(bytes(principalCreatorId).length > 0)) revert EC(76);
        odpRegistry.getCreator(principalCreatorId);
        if (!(_mintAgentForCreator[principalCreatorId] == msg.sender)) revert EC(72);
        delete _mintAgentForCreator[principalCreatorId];
        emit MintAgentUpdate(principalCreatorId, msg.sender, 3, block.timestamp);
    }

    function cancelMintAgentRequest(string calldata principalCreatorId) external {
        if (!(bytes(principalCreatorId).length > 0)) revert EC(76);
        bytes32 k = keccak256(abi.encodePacked(principalCreatorId, msg.sender));
        if (!(_mintAgentDelegationPending[k])) revert EC(73);
        delete _mintAgentDelegationPending[k];
        emit MintAgentUpdate(principalCreatorId, msg.sender, 1, block.timestamp);
    }

    function mintAgentForCreator(string calldata creatorId) external view returns (address) {
        return _mintAgentForCreator[creatorId];
    }

    function mintAgentDelegationPending(bytes32 key) external view returns (bool) {
        return _mintAgentDelegationPending[key];
    }

    function delegateCreatorPublishing(address agent, uint256 expiresAt) external {
        if (!(agent != address(0))) revert EC(21);
        _requireRegistered();
        if (!(expiresAt > block.timestamp)) revert EC(20);
        _creatorPublishDelegation[msg.sender] = DelegationInfo({agent: agent, expiresAt: expiresAt});
        emit CreatorPublishingDelegated(msg.sender, agent, expiresAt);
    }

    function revokeCreatorPublishing() external {
        _requireRegistered();
        delete _creatorPublishDelegation[msg.sender];
        emit CreatorPublishingDelegationRevoked(msg.sender, block.timestamp);
    }

    function getCreatorPublishingDelegation(address creatorWallet)
        external
        view
        returns (address agent, uint256 expiresAt)
    {
        DelegationInfo storage d = _creatorPublishDelegation[creatorWallet];
        return (d.agent, d.expiresAt);
    }

    function _requireRegistered() internal view returns (string memory creatorId) {
        creatorId = odpRegistry.getCreatorByWallet(msg.sender);
        if (!(bytes(creatorId).length > 0)) revert EC(3);
    }

    function _requireAffiliationType(string memory creatorId) internal view {
        IODPRegistryForRelations.CreatorRecord memory c = odpRegistry.getCreator(creatorId);
        bytes1 t = c.typePrefix;
        if (!(t == TYPE_B || t == TYPE_M || t == TYPE_P)) revert EC(71);
    }

    /**
     * Rejects a link that would close a loop: `A` under `B` under `A` leaves every client
     * that walks the chain spinning forever. Walks upward from the proposed parent and
     * reverts if the child is already an ancestor. The walk is capped so gas stays bounded;
     * a chain that does not reach a root within the cap is rejected rather than traversed.
     */
    function _requireNoCycle(string memory parentId, string memory childId) internal view {
        bytes32 childKey = keccak256(bytes(childId));
        string memory cursor = parentId;
        for (uint256 hops = 0; hops < MAX_AFFILIATION_WALK; hops++) {
            if (bytes(cursor).length == 0) {
                return; // reached a root — the child is not an ancestor
            }
            if (keccak256(bytes(cursor)) == childKey) revert EC(67);
            cursor = _parentOf[cursor];
        }
        revert EC(69);
    }

    function _removeChildFromParentList(string memory parentId, string memory childId) internal {
        string[] storage ch = _childrenOf[parentId];
        for (uint256 i = 0; i < ch.length; i++) {
            if (keccak256(bytes(ch[i])) == keccak256(bytes(childId))) {
                ch[i] = ch[ch.length - 1];
                ch.pop();
                return;
            }
        }
        revert EC(63);
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
}
