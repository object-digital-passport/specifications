// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Spec 0.7 immutable on-chain card + classification captured at mint.
struct PassportCoreMintInputs {
    uint32 year;
    uint8 month;
    string title;            // 1..128 bytes; must match passport.json byte-for-byte
    string authorName;       // 1..128 bytes; must match passport.json byte-for-byte
    string shortDescription; // 1..256 bytes; must match passport.json byte-for-byte
    string domain;           // <=128 bytes; must match passport.json byte-for-byte
    uint8 contentClass;
    uint8 lifecycleStatus;
    uint8 aiStatus;
    uint8 verificationMethod;
    uint8 editionModel;
}

/// @dev Spec 0.7 unified mint tuple for physical / digital / mixed entrypoints.
///      `fileHash` must be bytes32(0) for physical and non-zero for digital/mixed.
struct PassportMintInputs {
    PassportCoreMintInputs core;
    bytes32 dataHash;        // SHA-256 of canonical minified passport.json
    bytes32 imageHash;       // SHA-256 of the primary photo; required for physical/mixed
    bytes32 fileHash;        // SHA-256 of the digital original
    bytes32 anchorsHash;     // SHA-256 of the canonical minified `anchors` array
    uint32 anchorTypesMask;  // OR of anchor type bits (see ODPAnchorBits)
    bytes32 editionCommitment; // Typed edition commitment; zero iff UNIT_KEY_SET is absent.
}

/// @dev Anchor type bits for `anchorTypesMask`. Bits 14..30 reserved for future SPEC
///      revisions; bit 31 marks a custom anchor outside the registry.
library ODPAnchorBits {
    uint32 internal constant PHOTO = 1;
    uint32 internal constant DIMENSIONS = 2;
    uint32 internal constant MATERIALS = 4;
    uint32 internal constant DISTINGUISHING_FEATURES = 8;
    uint32 internal constant MARKS = 16;
    uint32 internal constant FILE_HASH = 32;
    uint32 internal constant PERCEPTUAL_HASH = 64;
    uint32 internal constant C2PA = 128;
    uint32 internal constant NFC = 256;
    uint32 internal constant NUMBERED_SEAL = 512;
    uint32 internal constant FINGERPRINT = 1024;
    uint32 internal constant DNA = 2048;
    uint32 internal constant UNIT_KEY_SET = 4096;        // SPEC 0.7 §20.3 (B profiles only)
    uint32 internal constant UNIT_VARIANT_COMMIT = 8192; // SPEC 0.7 §20.4 (B profiles only)
    uint32 internal constant CUSTOM = 1 << 31;

    /// Hard identification minimum: photo + dimensions + materials + distinguishing features.
    uint32 internal constant PHYSICAL_REQUIRED = PHOTO | DIMENSIONS | MATERIALS | DISTINGUISHING_FEATURES;
    uint32 internal constant DIGITAL_REQUIRED = FILE_HASH;
}
