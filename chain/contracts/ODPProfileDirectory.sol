// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "./ODPSatellite.sol";

/// @notice Self-declared ASCII DNS name, not proof of domain control or institutional trust.
/// @dev Clients independently verify HTTPS/DNS and pin trusted profile identities.
contract ODPProfileDirectory is ODPSatellite {
    mapping(string => string) private _domains;
    event DomainUpdated(string indexed creatorId, string creatorIdText, string domain, uint256 timestamp);
    constructor(address registry) ODPSatellite(registry) {}
    function setDomain(string calldata domain) external {
        string memory id = _registered();
        bytes1 t = odpRegistry.getCreator(id).typePrefix;
        if (t != "B" && t != "P" && t != "M") revert EC(71);
        bytes memory b = bytes(domain);
        // Empty clears a declaration. IDNs must first be converted to lower-case ASCII A-labels.
        if (b.length > 253) revert EC(139);
        uint256 label = 0;
        for (uint256 i; i < b.length; ++i) {
            uint8 c = uint8(b[i]);
            if (c == 46) {
                if (label == 0 || b[i-1] == "-") revert EC(139);
                label = 0;
            } else {
                if (!((c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c == 45)) revert EC(139);
                if (label == 0 && c == 45) revert EC(139);
                if (++label > 63) revert EC(139);
            }
        }
        if (b.length != 0 && (label == 0 || b[b.length-1] == "-")) revert EC(139);
        _domains[id] = domain;
        emit DomainUpdated(id, id, domain, block.timestamp);
    }
    function getDomain(string calldata id) external view returns (string memory) { return _domains[id]; }
}
