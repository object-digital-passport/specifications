// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "./ODPSatellite.sol";

/**
 * Optional satellite: wallet-level SHA-256 anchors for arbitrary files (not tied to a passport id).
 * Registration is enforced by reading the main ODP registry’s `getCreatorByWallet`.
 * Deploy after `ObjectDigitalPassport`; pass the registry address to the constructor.
 */

contract ODPWalletDocumentAnchor is ODPSatellite {

    struct ExternalDocAttestation {
        address creator;
        string creatorId;
        bytes32 documentHash;
        uint256 timestamp;
        string documentUri;
    }

    mapping(bytes32 => ExternalDocAttestation) private _externalDocAttest;

    /// @dev `documentHash` is indexed so verifiers can filter logs without scanning full history.
    event ExternalDocumentAttested(
        string indexed creatorId,
        string creatorIdText,
        address indexed attestor,
        bytes32 indexed documentHash,
        string documentUri,
        uint256 timestamp
    );

    constructor(address odpRegistry_) ODPSatellite(odpRegistry_) {
    }

    function attestExternalDocument(bytes32 documentHash, string calldata documentUri) external {
        if (!(documentHash != bytes32(0))) revert EC(50);
        if (!(bytes(documentUri).length <= 512)) revert EC(51);
        string memory creatorId = _registered();
        if (!(bytes(creatorId).length > 0)) revert EC(3);
        bytes32 key = keccak256(abi.encodePacked(msg.sender, documentHash));
        if (!(_externalDocAttest[key].creator == address(0))) revert EC(52);

        _externalDocAttest[key] = ExternalDocAttestation({
            creator: msg.sender,
            creatorId: creatorId,
            documentHash: documentHash,
            timestamp: block.timestamp,
            documentUri: documentUri
        });

        emit ExternalDocumentAttested(creatorId, creatorId, msg.sender, documentHash, documentUri, block.timestamp);
    }

    function getExternalDocumentAttestation(address wallet, bytes32 documentHash)
        external
        view
        returns (
            bool attested,
            string memory creatorId,
            uint256 timestamp,
            string memory documentUri
        )
    {
        bytes32 key = keccak256(abi.encodePacked(wallet, documentHash));
        ExternalDocAttestation storage a = _externalDocAttest[key];
        if (a.creator == address(0)) {
            return (false, "", 0, "");
        }
        return (true, a.creatorId, a.timestamp, a.documentUri);
    }
}
