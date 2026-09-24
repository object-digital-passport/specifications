// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "./ODPSatellite.sol";

import "./ODPErrors.sol";

contract ODPRegistryRelations is ODPSatellite {

    bytes1 private constant TYPE_B = "B";
    bytes1 private constant TYPE_M = "M";
    bytes1 private constant TYPE_P = "P";

    uint16 private constant MAX_ACTIVE_CHILDREN_PER_PARENT = 100;
    uint16 private constant MAX_PENDING_PARENTS_PER_CHILD = 100;

    uint256 private constant MAX_AFFILIATION_WALK = 8;

    mapping(bytes32 => bool) private _pendingAffiliation;
    mapping(string => string) private _parentOf;
    mapping(string => string[]) private _childrenOf;
    mapping(string => uint16) private _activeChildrenCountByParent;
    mapping(string => uint16) private _pendingParentsCountByChild;
    mapping(string => uint256) private _affiliationJoinedAt;
    mapping(string => uint256) private _affiliationDetachedAt;
    mapping(string => string) private _lastDetachedParent;

    event AffiliationProposed(string parentId, string childId, uint256 timestamp);
    event AffiliationConfirmed(string parentId, string childId, uint256 timestamp);
    event AffiliationDetached(string parentId, string childId, uint256 timestamp);

    constructor(address registry_) ODPSatellite(registry_) {
    }

    function proposeAffiliation(string calldata parentId) external {
        string memory childId = _registered();
        _requireAffiliationType(childId);
        if (!(bytes(parentId).length > 0)) revert EC(49);
        if (!(keccak256(bytes(parentId)) != keccak256(bytes(childId)))) revert EC(46);
        _requireAffiliationType(parentId);
        if (!(bytes(_parentOf[childId]).length == 0)) revert EC(45);
        if (!(_pendingParentsCountByChild[childId] < MAX_PENDING_PARENTS_PER_CHILD)) revert EC(48);
        // Early feedback only. State can move between propose and confirm, so the
        // authoritative cycle check is the one in confirmAffiliation.
        _requireNoCycle(parentId, childId);

        bytes32 k = keccak256(abi.encode(parentId, childId));
        if (!(!_pendingAffiliation[k])) revert EC(47);
        _pendingAffiliation[k] = true;
        _pendingParentsCountByChild[childId] = _pendingParentsCountByChild[childId] + 1;

        emit AffiliationProposed(parentId, childId, block.timestamp);
    }

    function confirmAffiliation(string calldata childId) external {
        string memory parentId = _registered();
        _requireAffiliationType(parentId);
        _requireAffiliationType(childId);
        if (!(keccak256(bytes(parentId)) != keccak256(bytes(childId)))) revert EC(46);
        if (!(bytes(_parentOf[childId]).length == 0)) revert EC(45);

        bytes32 k = keccak256(abi.encode(parentId, childId));
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
        bytes32 k = keccak256(abi.encode(parentId, childId));
        if (!(_pendingAffiliation[k])) revert EC(42);
        delete _pendingAffiliation[k];
        _pendingParentsCountByChild[childId] = _pendingParentsCountByChild[childId] - 1;
    }

    function isAffiliationPending(string calldata parentId, string calldata childId)
        external
        view
        returns (bool)
    {
        return _pendingAffiliation[keccak256(abi.encode(parentId, childId))];
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
        return _page(_childrenOf[parentId], offset, limit);
    }

    function _requireRegistered() internal view returns (string memory creatorId) {
        creatorId = odpRegistry.getCreatorByWallet(msg.sender);
        if (!(bytes(creatorId).length > 0)) revert EC(3);
    }

    function _requireAffiliationType(string memory creatorId) internal view {
        IODPRegistry.CreatorRecord memory c = odpRegistry.getCreator(creatorId);
        bytes1 t = c.typePrefix;
        if (!(t == TYPE_B || t == TYPE_M || t == TYPE_P)) revert EC(71);
    }

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

    function leaveAffiliation() external {
        string memory childId = _registered();
        string memory parentId = _parentOf[childId];
        if (bytes(parentId).length == 0) revert EC(43);
        _removeChildFromParentList(parentId, childId);
        delete _parentOf[childId];
        _activeChildrenCountByParent[parentId]--;
        _affiliationDetachedAt[childId] = block.timestamp;
        _lastDetachedParent[childId] = parentId;
        emit AffiliationDetached(parentId, childId, block.timestamp);
    }
}
