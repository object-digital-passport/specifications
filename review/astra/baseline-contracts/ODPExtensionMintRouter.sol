// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ODPErrors.sol";
import "./IODPExtension.sol";
import "./ODPPassportLib.sol";
import { PassportMintInputs } from "./ODPPassportTypes.sol";

/**
 * Satellite: extension mint routing.
 * Governance registers `mintClass -> IODPExtension` here; the router validates/normalizes
 * payloads and then calls the main registry's regular `mintDigital` / `mintPhysical`.
 */
interface IODPRegistryForExtensionMint {
    function governance() external view returns (address);
    function mintDigital(
        PassportMintInputs calldata m,
        bool dataUrlIsFolderBase,
        string calldata mintOnBehalfOfCreatorId
    ) external returns (string memory passportId);
    function mintPhysical(
        PassportMintInputs calldata m,
        bool dataUrlIsFolderBase,
        string calldata mintOnBehalfOfCreatorId
    ) external returns (string memory passportId);
}

contract ODPExtensionMintRouter {
    bytes1 private constant TYPE_C = "C";
    bytes1 private constant TYPE_B = "B";
    bytes1 private constant TYPE_P = "P";
    bytes1 private constant TYPE_M = "M";

    uint8 private constant EXT_MINT_KIND_DIGITAL = 0;
    uint8 private constant EXT_MINT_KIND_PHYSICAL = 1;

    IODPRegistryForExtensionMint public immutable odpRegistry;
    mapping(bytes1 => address) public typeToExtension;

    event ExtensionMintUsed(bytes1 indexed mintClass, uint8 indexed kind, string passportId);

    constructor(address registry_) {
        odpRegistry = IODPRegistryForExtensionMint(registry_);
    }

    modifier onlyGovernance() {
        if (!(msg.sender == odpRegistry.governance())) revert EC(56);
        _;
    }

    /// @notice Register or remove an `IODPExtension` for `mintClass`. Only registry governance.
    function setMintExtension(bytes1 mintClass, address extension) external onlyGovernance {
        if (mintClass == TYPE_C || mintClass == TYPE_B || mintClass == TYPE_P || mintClass == TYPE_M) {
            revert EC(65);
        }
        if (extension != address(0) && extension.code.length == 0) revert EC(66);
        typeToExtension[mintClass] = extension;
    }

    function mintDigitalViaExtension(
        bytes1 mintClass,
        bytes calldata payload,
        bool dataUrlIsFolderBase,
        string calldata mintOnBehalfOfCreatorId
    ) external returns (string memory passportId) {
        address ext = typeToExtension[mintClass];
        if (!(ext != address(0))) revert EC(64);

        IODPExtension(ext).validate(payload);
        bytes memory norm = IODPExtension(ext).normalize(payload);
        PassportMintInputs memory m = ODPPassportLib.decodeAndValidateDigitalExtensionNorm(norm);

        passportId = odpRegistry.mintDigital(m, dataUrlIsFolderBase, mintOnBehalfOfCreatorId);
        emit ExtensionMintUsed(mintClass, EXT_MINT_KIND_DIGITAL, passportId);
    }

    function mintPhysicalViaExtension(
        bytes1 mintClass,
        bytes calldata payload,
        bool dataUrlIsFolderBase,
        string calldata mintOnBehalfOfCreatorId
    ) external returns (string memory passportId) {
        address ext = typeToExtension[mintClass];
        if (!(ext != address(0))) revert EC(64);

        IODPExtension(ext).validate(payload);
        bytes memory norm = IODPExtension(ext).normalize(payload);
        PassportMintInputs memory m = ODPPassportLib.decodeAndValidatePhysicalExtensionNorm(norm);

        passportId = odpRegistry.mintPhysical(m, dataUrlIsFolderBase, mintOnBehalfOfCreatorId);
        emit ExtensionMintUsed(mintClass, EXT_MINT_KIND_PHYSICAL, passportId);
    }
}
