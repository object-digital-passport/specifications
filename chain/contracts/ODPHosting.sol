// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "./ODPSatellite.sol";

/// @notice Replaceable transport locations. Integrity always comes from the core's hashes.
/// @dev Publishing delegation is separate from mint delegation. Profile registration is permanent; there is no stop switch.
contract ODPHosting is ODPSatellite {
    struct Locations { string dataUrl; string imageUrl; uint256 updatedAt; }
    struct Delegation { address agent; uint256 expiresAt; }
    mapping(string => Locations) private _locations;
    mapping(address => Delegation) private _delegations;
    event LocationsUpdated(string indexed passportId, string passportIdText,
        string dataUrl, string imageUrl, address indexed updatedBy, uint256 timestamp);
    event PublishingDelegated(address indexed creator, address indexed agent, uint256 expiresAt);
    constructor(address registry) ODPSatellite(registry) {}
    function delegatePublishing(address agent, uint256 expiresAt) external {
        _registered();
        if (agent == address(0)) revert EC(21);
        if (expiresAt <= block.timestamp) revert EC(20);
        _delegations[msg.sender] = Delegation(agent, expiresAt);
        emit PublishingDelegated(msg.sender, agent, expiresAt);
    }
    function revokePublishing() external {
        _registered();
        delete _delegations[msg.sender];
        emit PublishingDelegated(msg.sender, address(0), 0);
    }
    function getPublishingDelegation(address creator) external view returns (Delegation memory) {
        return _delegations[creator];
    }
    function updateLocations(string calldata id, string calldata dataUrl, string calldata imageUrl) external {
        IODPRegistry.PassportHeaderView memory h = odpRegistry.getPassportHeader(id);
        Delegation storage d = _delegations[h.creator];
        if (msg.sender != h.creator && (msg.sender != d.agent || block.timestamp >= d.expiresAt)) revert EC(137);
        if (bytes(dataUrl).length > 512 || bytes(imageUrl).length > 512) revert EC(138);
        _locations[id] = Locations(dataUrl, imageUrl, block.timestamp);
        emit LocationsUpdated(id, id, dataUrl, imageUrl, msg.sender, block.timestamp);
    }
    function getLocations(string calldata id) external view returns (Locations memory) { return _locations[id]; }
}
