// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ODPErrors.sol";

/**
 * Satellite: institutional authenticity concern (informally “counterfeit flag”) for a passport.
 * Deploy after `ObjectDigitalPassport`; constructor takes the registry address.
 * P/M profiles only; same institution that raised may clear. Keeps EIP-170 headroom on the main registry.
 */
interface IODPRegistryForCounterfeit {
    /// @dev ABI must match `CreatorRecord` field order on `ObjectDigitalPassport.getCreator`.
    struct CreatorRecord {
        string creatorId;
        address wallet;
        bytes1 typePrefix;
        uint256 timestamp;
    }

    struct PassportClassificationView {
        uint8 contentClass;
        uint8 lifecycleStatus;
        uint8 aiStatus;
        uint8 verificationMethod;
        uint8 editionModel;
        uint256 timestamp;
        bool revoked;
        uint256 revokedAt;
        bytes32 revocationReasonHash;
        address mintAgent;
    }

    function getCreatorByWallet(address wallet) external view returns (string memory);
    function getCreator(string calldata creatorId) external view returns (CreatorRecord memory);
    function getPassportClassification(string calldata passportId) external view returns (PassportClassificationView memory);
}

contract ODPCounterfeitConcern {
    IODPRegistryForCounterfeit public immutable odpRegistry;

    bytes1 private constant TYPE_P = "P";
    bytes1 private constant TYPE_M = "M";

    struct CounterfeitConcern {
        bool active;
        string proverCreatorId;
        bytes32 reasonHash;
        uint256 timestamp;
    }

    mapping(string => CounterfeitConcern) private _concern;

    event CounterfeitConcernRaised(
        string indexed passportId,
        string indexed proverCreatorId,
        bytes32 reasonHash,
        uint256 timestamp
    );

    event CounterfeitConcernCleared(string indexed passportId, string indexed proverCreatorId, uint256 timestamp);

    constructor(address registry_) {
        odpRegistry = IODPRegistryForCounterfeit(registry_);
    }

    function raiseCounterfeitConcern(string calldata passportId, bytes32 reasonHash) external {
        if (!(reasonHash != bytes32(0))) revert EC(16);
        odpRegistry.getPassportClassification(passportId);

        string memory callerId = odpRegistry.getCreatorByWallet(msg.sender);
        if (!(bytes(callerId).length > 0)) revert EC(7);
        IODPRegistryForCounterfeit.CreatorRecord memory cr = odpRegistry.getCreator(callerId);
        if (!(cr.typePrefix == TYPE_P || cr.typePrefix == TYPE_M)) revert EC(6);

        CounterfeitConcern storage c = _concern[passportId];
        if (c.active) revert EC(80);

        c.active = true;
        c.proverCreatorId = callerId;
        c.reasonHash = reasonHash;
        c.timestamp = block.timestamp;

        emit CounterfeitConcernRaised(passportId, callerId, reasonHash, block.timestamp);
    }

    function clearCounterfeitConcern(string calldata passportId) external {
        CounterfeitConcern storage c = _concern[passportId];
        if (!c.active) revert EC(81);

        string memory callerClr = odpRegistry.getCreatorByWallet(msg.sender);
        if (!(bytes(callerClr).length > 0)) revert EC(7);
        if (!(keccak256(bytes(callerClr)) == keccak256(bytes(c.proverCreatorId)))) revert EC(82);

        string memory prover = c.proverCreatorId;
        delete _concern[passportId];

        emit CounterfeitConcernCleared(passportId, prover, block.timestamp);
    }

    function getCounterfeitConcern(string calldata passportId)
        external
        view
        returns (bool active, string memory proverCreatorId, bytes32 reasonHash, uint256 timestamp)
    {
        CounterfeitConcern storage c = _concern[passportId];
        return (c.active, c.proverCreatorId, c.reasonHash, c.timestamp);
    }
}
