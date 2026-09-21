// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Read-only ABI for the redesigned 0.7 generation; incompatible with legacy 0.7.
interface IODPRegistry {
    struct CreatorRecord {
        string  creatorId;    // "C-482-930-174-005"
        address wallet;
        bytes1  typePrefix;   // "C", "B", "P", or "M" — stored as bytes1 for gas efficiency
        uint256 timestamp;
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
    struct PassportReleaseView { uint256 revocationDeadline; uint256 printFinalizedAt; }
    function getPassportReleaseState(string calldata id) external view returns (PassportReleaseView memory);
    function getCreator(string calldata id) external view returns (CreatorRecord memory);
    function getCreatorByWallet(address wallet) external view returns (string memory);
    function getPassportHeader(string calldata id) external view returns (PassportHeaderView memory);
    function getPassportMedia(string calldata id) external view returns (PassportMediaView memory);
    function getPassportClassification(string calldata id) external view returns (PassportClassificationView memory);
    function passportExists(string calldata id) external view returns (bool);
}
