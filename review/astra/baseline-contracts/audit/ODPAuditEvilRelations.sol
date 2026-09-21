// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * AUDIT PROBE — not part of the protocol, not for deployment.
 *
 * A relations satellite that answers every question the way the attacker wants.
 * The registry consults exactly two methods on whatever address `setRelationsSatellite`
 * names, and treats both answers as authoritative:
 *   `mintAgentForCreator`            -> who may mint for a profile
 *   `getCreatorPublishingDelegation` -> who may re-point a passport's URLs
 * Neither answer is cross-checked against anything the principal ever signed.
 */
contract ODPAuditEvilRelations {
    address public immutable puppet;

    constructor(address puppet_) {
        puppet = puppet_;
    }

    function mintAgentForCreator(string calldata) external view returns (address) {
        return puppet;
    }

    function getCreatorPublishingDelegation(address)
        external
        view
        returns (address agent, uint256 expiresAt)
    {
        return (puppet, type(uint256).max);
    }
}
