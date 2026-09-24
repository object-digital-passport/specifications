#!/usr/bin/env python3
"""
Object Digital Passport — Mint CLI
Author: Andrei Chernikov
Specification 0.6 draft (CLI targets the spec 0.6 contract line)

Usage:
    python mint.py                  # interactive mint → saves passports/<Passport ID>.odpass (SPEC §15)
    python mint.py --register       # register profile (on-chain creatorId) first
    python mint.py --check          # check your profile ID

Requirements:
    pip install web3 qrcode[pil] pillow python-dotenv
"""

import os
import sys
import json
import hashlib
import unicodedata
import argparse
import zipfile
from datetime import datetime, timezone
from pathlib import Path

# ─── Dependency check ────────────────────────────────────────────────────────

def check_deps():
    missing = []
    for pkg in [("web3", "web3"), ("qrcode", "qrcode"), ("dotenv", "dotenv")]:
        try:
            __import__(pkg[1])
        except ImportError:
            missing.append(pkg[0])
    if missing:
        print(f"\n  Missing: pip install {' '.join(missing)} pillow\n")
        sys.exit(1)

check_deps()

from web3 import Web3
from dotenv import load_dotenv
import qrcode

# ─── Config ───────────────────────────────────────────────────────────────────

load_dotenv()

NETWORKS = {
    "amoy": {
        "name":     "Polygon Amoy (testnet)",
        "rpc":      "https://rpc-amoy.polygon.technology",
        "chain_id": 80002,
        "explorer": "https://amoy.polygonscan.com",
    },
    "polygon": {
        "name":     "Polygon PoS (mainnet)",
        "rpc":      "https://polygon-bor.publicnode.com",
        "chain_id": 137,
        "explorer": "https://polygonscan.com",
    },
}

ARTIFACT_ABI_PATH = (
    Path(__file__).resolve().parents[1]
    / "artifacts"
    / "contracts"
    / "ObjectDigitalPassport.sol"
    / "ObjectDigitalPassport.json"
)

CONTENT_CLASS_CODES = {
    "static": 1,
    "time_based": 2,
    "spatial": 3,
    "textual": 4,
    "composite": 5,
    "executable": 6,
}
STATUS_CODES = {
    "concept": 1,
    "prototype": 2,
    "produced_object": 3,
    "archived": 4,
}
AI_STATUS_CODES = {
    "none": 1,
    "assisted": 2,
    "generated": 3,
}
VERIFICATION_METHOD_CODES = {
    "self_asserted": 1,
    "institutional": 2,
    "nfc": 3,
    "c2pa": 4,
    "hybrid": 5,
}
EDITION_MODEL_CODES = {
    "unique": 1,
    "limited": 2,
    "open": 3,
    "dynamic": 4,
}

# Anchor type bits (must match ODPAnchorBits in ODPPassportTypes.sol)
ANCHOR_BITS = {
    "photo": 1,
    "dimensions": 2,
    "materials": 4,
    "distinguishing_features": 8,
    "marks": 16,
    "file_hash": 32,
    "perceptual_hash": 64,
    "c2pa": 128,
    "nfc": 256,
    "numbered_seal": 512,
    "fingerprint": 1024,
    "dna": 2048,
}

CONTRACT_ABI = [
    # Creator Registry
    {
        "name": "registerCreator",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs":  [{"name": "typePrefix", "type": "bytes1"}],
        "outputs": [{"name": "creatorId",  "type": "string"}],
    },
    {
        "name": "getCreatorByWallet",
        "type": "function",
        "stateMutability": "view",
        "inputs":  [{"name": "wallet", "type": "address"}],
        "outputs": [{"name": "",       "type": "string"}],
    },
    {
        "name": "getCreator",
        "type": "function",
        "stateMutability": "view",
        "inputs":  [{"name": "creatorId", "type": "string"}],
        "outputs": [{
            "name": "", "type": "tuple",
            "components": [
                {"name": "creatorId",  "type": "string"},
                {"name": "wallet",     "type": "address"},
                {"name": "typePrefix", "type": "bytes1"},
                {"name": "timestamp",  "type": "uint256"},
            ]
        }],
    },
    # Passport — unified 0.6 mint tuple (PassportMintInputs)
    {
        "name": "CONTRACT_VERSION",
        "type": "function",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "", "type": "uint8"}],
    },
    {
        "name": "mintPhysical",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {
                "name": "m", "type": "tuple",
                "components": [
                    {
                        "name": "core", "type": "tuple",
                        "components": [
                            {"name": "year",  "type": "uint32"},
                            {"name": "month", "type": "uint8"},
                            {"name": "title", "type": "string"},
                            {"name": "authorName", "type": "string"},
                            {"name": "shortDescription", "type": "string"},
                            {"name": "domain", "type": "string"},
                            {"name": "contentClass", "type": "uint8"},
                            {"name": "lifecycleStatus", "type": "uint8"},
                            {"name": "aiStatus", "type": "uint8"},
                            {"name": "verificationMethod", "type": "uint8"},
                            {"name": "editionModel", "type": "uint8"},
                        ],
                    },
                    {"name": "dataHash",  "type": "bytes32"},
                    {"name": "dataUrl",   "type": "string"},
                    {"name": "imageHash", "type": "bytes32"},
                    {"name": "imageUrl",  "type": "string"},
                    {"name": "fileHash",  "type": "bytes32"},
                    {"name": "anchorsHash", "type": "bytes32"},
                    {"name": "anchorTypesMask", "type": "uint32"},
                    # SPEC 0.7 §20.10 — initial owner; zero address = the minting principal.
                    {"name": "initialOwner", "type": "address"},
                ],
            },
            {"name": "dataUrlIsFolderBase", "type": "bool"},
            {"name": "mintOnBehalfOfCreatorId", "type": "string"},
        ],
        "outputs": [{"name": "passportId", "type": "string"}],
    },
    {
        "name": "mintDigital",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {
                "name": "m", "type": "tuple",
                "components": [
                    {
                        "name": "core", "type": "tuple",
                        "components": [
                            {"name": "year",  "type": "uint32"},
                            {"name": "month", "type": "uint8"},
                            {"name": "title", "type": "string"},
                            {"name": "authorName", "type": "string"},
                            {"name": "shortDescription", "type": "string"},
                            {"name": "domain", "type": "string"},
                            {"name": "contentClass", "type": "uint8"},
                            {"name": "lifecycleStatus", "type": "uint8"},
                            {"name": "aiStatus", "type": "uint8"},
                            {"name": "verificationMethod", "type": "uint8"},
                            {"name": "editionModel", "type": "uint8"},
                        ],
                    },
                    {"name": "dataHash",  "type": "bytes32"},
                    {"name": "dataUrl",   "type": "string"},
                    {"name": "imageHash", "type": "bytes32"},
                    {"name": "imageUrl",  "type": "string"},
                    {"name": "fileHash",  "type": "bytes32"},
                    {"name": "anchorsHash", "type": "bytes32"},
                    {"name": "anchorTypesMask", "type": "uint32"},
                    # SPEC 0.7 §20.10 — initial owner; zero address = the minting principal.
                    {"name": "initialOwner", "type": "address"},
                ],
            },
            {"name": "dataUrlIsFolderBase", "type": "bool"},
            {"name": "mintOnBehalfOfCreatorId", "type": "string"},
        ],
        "outputs": [{"name": "passportId", "type": "string"}],
    },
    {
        "anonymous": False,
        "name": "PassportMinted",
        "type": "event",
        "inputs": [
            {"indexed": True, "name": "passportId", "type": "string"},
            {"indexed": True, "name": "creator", "type": "address"},
            {"indexed": False, "name": "creatorId", "type": "string"},
            {"indexed": False, "name": "title", "type": "string"},
            {"indexed": False, "name": "authorName", "type": "string"},
            {"indexed": False, "name": "domain", "type": "string"},
            {"indexed": False, "name": "objectType", "type": "string"},
            {"indexed": False, "name": "contentClass", "type": "uint8"},
            {"indexed": False, "name": "year", "type": "uint32"},
            {"indexed": False, "name": "month", "type": "uint8"},
            {"indexed": False, "name": "dataHash", "type": "bytes32"},
            {"indexed": False, "name": "anchorsHash", "type": "bytes32"},
            {"indexed": False, "name": "anchorTypesMask", "type": "uint32"},
            {"indexed": False, "name": "timestamp", "type": "uint256"},
            {"indexed": False, "name": "mintAgent", "type": "address"},
        ],
    },
]

ZERO_BYTES32 = b"\x00" * 32
ZERO_HEX32 = "0x" + "0" * 64


# ─── Helpers ──────────────────────────────────────────────────────────────────

def sha256_file(path: str) -> bytes:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.digest()

def normalize_nfc(obj):
    """Recursively normalize all strings in a dict/list to Unicode NFC."""
    if isinstance(obj, str):
        return unicodedata.normalize("NFC", obj)
    if isinstance(obj, dict):
        return {k: normalize_nfc(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [normalize_nfc(v) for v in obj]
    return obj

def sha256_json(data: dict) -> bytes:
    """
    Canonical JSON per ODP spec:
      1. Unicode NFC normalization on all strings
      2. Keys sorted alphabetically at every level
      3. No whitespace, ensure_ascii=False
    Must match browser JS: normalize("NFC") + sortKeysDeep + JSON.stringify
    """
    normalized = normalize_nfc(data)
    minified = json.dumps(normalized, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(minified.encode("utf-8")).digest()

def sha256_obj(data: dict) -> bytes:
    """Same canonical serialization for sub-objects (e.g. seal)."""
    normalized = normalize_nfc(data)
    minified = json.dumps(normalized, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(minified.encode("utf-8")).digest()

def to_bytes32(b: bytes) -> bytes:
    return b[:32].ljust(32, b"\x00")

def prompt(label: str, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    val = input(f"  {label}{suffix}: ").strip()
    return val if val else default

def prompt_optional(label: str) -> str:
    return input(f"  {label} (skip — Enter): ").strip()

def divider():
    print("─" * 56)

def generate_qr(human_id: str, output_path: str):
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_Q,
        box_size=10,
        border=4,
    )
    qr.add_data(f"odp://{human_id}")
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    img.save(output_path)

def load_contract_abi():
    if ARTIFACT_ABI_PATH.exists():
        try:
            return json.loads(ARTIFACT_ABI_PATH.read_text(encoding="utf-8"))["abi"]
        except Exception:
            pass
    return CONTRACT_ABI

def connect(network_key: str, private_key: str, contract_address: str):
    net = NETWORKS[network_key]
    w3  = Web3(Web3.HTTPProvider(net["rpc"]))
    if not w3.is_connected():
        print(f"\n  ERROR: Cannot connect to {net['rpc']}")
        sys.exit(1)
    account  = w3.eth.account.from_key(private_key)
    contract = w3.eth.contract(
        address=Web3.to_checksum_address(contract_address),
        abi=load_contract_abi()
    )
    return w3, account, contract, net

def send_tx(w3, account, fn_call, net, value=0):
    nonce    = w3.eth.get_transaction_count(account.address)
    gas_px   = w3.eth.gas_price
    tx       = fn_call.build_transaction({
        "chainId":  net["chain_id"],
        "from":     account.address,
        "nonce":    nonce,
        "gasPrice": gas_px,
        "value":    value,
    })
    tx["gas"] = w3.eth.estimate_gas(tx)
    cost      = w3.from_wei(tx["gas"] * gas_px, "ether")
    print(f"  Estimated gas: {cost:.6f} POL")
    signed  = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    print(f"  Sending tx: {tx_hash.hex()}")
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
    if receipt.status != 1:
        print(f"\n  ERROR: Transaction failed")
        print(f"  {net['explorer']}/tx/{tx_hash.hex()}")
        sys.exit(1)
    print(f"  ✅ Confirmed in block {receipt.blockNumber}")
    return tx_hash, receipt


def bytes32_to_hex0x(b: bytes) -> str:
    return "0x" + b.hex()


def human_id_from_mint_receipt(contract, receipt):
    """Decode Passport ID from PassportMinted in the mint receipt."""
    try:
        ev = contract.events.PassportMinted()
    except Exception:
        return None
    proc = getattr(ev, "process_receipt", None) or getattr(ev, "processReceipt", None)
    if callable(proc):
        try:
            entries = proc(receipt)
            if entries:
                a = entries[0]["args"] if isinstance(entries[0], dict) else entries[0].args
                hid = (
                    a.get("passportId") or a.get("humanId")
                    if isinstance(a, dict)
                    else getattr(a, "passportId", None) or getattr(a, "humanId", None)
                )
                if hid:
                    return str(hid)
        except Exception:
            pass
    plog = getattr(ev, "process_log", None) or getattr(ev, "processLog", None)
    if callable(plog):
        for log in receipt.logs:
            try:
                parsed = plog(log)
                a = parsed["args"] if isinstance(parsed, dict) else parsed.args
                hid = (
                    a.get("passportId") or a.get("humanId")
                    if isinstance(a, dict)
                    else getattr(a, "passportId", None) or getattr(a, "humanId", None)
                )
                if hid:
                    return str(hid)
            except Exception:
                continue
    return None


def odp_created_at_utc_iso() -> str:
    """Match web `passport.html` (no milliseconds): 2026-03-22T12:00:00Z"""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def safe_odp_basename(human_id: str) -> str:
    s = "".join(c if (c.isalnum() or c in ".-_") else "_" for c in (human_id or "").strip())
    return (s or "passport")[:96]


def safe_bundle_filename(name: str) -> str:
    s = "".join(c if (c.isalnum() or c in ".-_") else "_" for c in (name or "").strip())
    return (s or "file")[:96]


def originals_arcname(role: str, path: Path) -> str:
    """Same as web `odpOriginalsBundleRelPath`: originals/<role>__<safeBasename>."""
    return f"originals/{role}__{safe_bundle_filename(path.name)}"


def write_odp_bundle(
    out_path,
    passport_json_str,
    manifest,
    original_path=None,
    image_path=None,
    image_path2=None,
    image_path3=None,
):
    """
    ODP bundle per SPEC.md §15 — aligned with `createPassportOdpBlob` in web/passport.html:
    passport.json, manifest.json, optional byte files under originals/ with paths in manifest.originals.
    """
    m = dict(manifest)
    files = [{"path": "passport.json", "role": "passport", "mime": "application/json"}]
    originals = {}

    with zipfile.ZipFile(out_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        zf.writestr("passport.json", passport_json_str.encode("utf-8"))
        if original_path and Path(original_path).is_file():
            p = Path(original_path)
            arc = originals_arcname("digital", p)
            zf.write(p, arcname=arc)
            originals["fileHash"] = arc
            files.append(
                {
                    "path": arc,
                    "role": "original",
                    "mime": "application/octet-stream",
                    "sizeBytes": int(p.stat().st_size),
                    "sha256": bytes32_to_hex0x(sha256_file(str(p))),
                }
            )
        if image_path and Path(image_path).is_file():
            p = Path(image_path)
            arc = originals_arcname("image", p)
            zf.write(p, arcname=arc)
            originals["imageHash"] = arc
            files.append(
                {
                    "path": arc,
                    "role": "imageOriginal",
                    "mime": "application/octet-stream",
                    "sizeBytes": int(p.stat().st_size),
                    "sha256": bytes32_to_hex0x(sha256_file(str(p))),
                }
            )
        if image_path2 and Path(image_path2).is_file():
            p = Path(image_path2)
            arc = originals_arcname("image2", p)
            zf.write(p, arcname=arc)
            originals["imageHash2"] = arc
            files.append(
                {
                    "path": arc,
                    "role": "imageOriginal2",
                    "mime": "application/octet-stream",
                    "sizeBytes": int(p.stat().st_size),
                    "sha256": bytes32_to_hex0x(sha256_file(str(p))),
                }
            )
        if image_path3 and Path(image_path3).is_file():
            p = Path(image_path3)
            arc = originals_arcname("image3", p)
            zf.write(p, arcname=arc)
            originals["imageHash3"] = arc
            files.append(
                {
                    "path": arc,
                    "role": "imageOriginal3",
                    "mime": "application/octet-stream",
                    "sizeBytes": int(p.stat().st_size),
                    "sha256": bytes32_to_hex0x(sha256_file(str(p))),
                }
            )

        m["bundleVersion"] = "0.3"
        m["files"] = files
        m["originals"] = originals
        zf.writestr("manifest.json", json.dumps(m, indent=2, ensure_ascii=False).encode("utf-8"))

# ─── Register profile ─────────────────────────────────────────────────────────

def cmd_register(args):
    print()
    print("  ODP — Register profile")
    divider()

    network_key, private_key, contract_address = _load_config()
    w3, account, contract, net = connect(network_key, private_key, contract_address)

    # Check if already registered
    existing = contract.functions.getCreatorByWallet(account.address).call()
    if existing:
        print(f"\n  Wallet {account.address}")
        print(f"  Already registered: {existing}")
        divider()
        return

    print(f"\n  Wallet:  {account.address}")
    balance = w3.from_wei(w3.eth.get_balance(account.address), "ether")
    print(f"  Balance: {balance:.4f} POL")
    print()
    print("  Type:")
    print("    C — Creator  (individual artist, photographer, maker)")
    print("    B — Brand    (company, studio, label)")
    print("    P — Proof Institution (expert body, certification, auction attestations)")
    print("    M — Museum / Collection (for institutional holdings; museums should use M, not B)")
    print()

    t = prompt("Type (C / B / P / M)", "C").strip().upper()
    if t not in ("C", "B", "P", "M"):
        print("  Invalid type.")
        sys.exit(1)

    print()
    print(f"  Registering as type {t}...")
    # bytes1 encoding: "C"→b"C", "B"→b"B", "P"→b"P"
    type_bytes = t.encode('ascii')
    print("  Network fees only (no separate ODP protocol fee)")
    tx_hash, _ = send_tx(
        w3, account,
        contract.functions.registerCreator(type_bytes),
        net,
    )

    creator_id = contract.functions.getCreatorByWallet(account.address).call()
    print()
    print(f"  ✅ Registered successfully")
    print()
    print(f"  Profile ID (short):  {creator_id}")
    print(f"  Wallet:              {account.address}")
    print()
    print(f"  Full identity:")
    print(f"  {creator_id} / [your name] / {account.address}")
    print()
    print(f"  Publish this on your website, social media, and physical objects.")
    print(f"  {net['explorer']}/tx/{tx_hash.hex()}")
    divider()

# ─── Check profile ───────────────────────────────────────────────────────────

def cmd_check(args):
    print()
    network_key, private_key, contract_address = _load_config()
    w3, account, contract, net = connect(network_key, private_key, contract_address)

    creator_id = contract.functions.getCreatorByWallet(account.address).call()
    if not creator_id:
        print(f"\n  Wallet {account.address} is not registered.")
        print(f"  Run: python mint.py --register")
    else:
        rec = contract.functions.getCreator(creator_id).call()
        print(f"\n  Profile ID:  {rec[0]}")
        raw_type = rec[2]
        # typePrefix comes back as bytes1 — decode for display
        if isinstance(raw_type, (bytes, bytearray)):
            type_str = raw_type.decode('ascii', errors='replace')
        elif isinstance(raw_type, str) and raw_type.startswith('0x'):
            type_str = bytes.fromhex(raw_type[2:]).decode('ascii', errors='replace')
        else:
            type_str = str(raw_type)
        print(f"  Type:        {type_str}")
        print(f"  Wallet:      {rec[1]}")
        registered = datetime.fromtimestamp(rec[3], tz=timezone.utc)
        print(f"  Registered:  {registered.strftime('%Y-%m-%d %H:%M UTC')}")
    print()

# ─── Passport JSON helpers ───────────────────────────────────────────────────

def issuer_role_from_creator_id(cid: str) -> str:
    """Maps profile ID prefix (C/B/P/M) to canonical issuerRole in passport.json."""
    p = (cid or "").strip()[:1].upper()
    return {"C": "individual", "B": "brand", "P": "proof_institution", "M": "museum"}.get(p, "individual")


def registration_clock_block(utc_now: datetime):
    """Privacy-safe registration clock block: UTC-only representations.

    Never records device-local IANA zone or non-+00:00 offsets; localIso8601 is
    the same instant as utcIso8601 with legacy +00:00 suffix (SPEC reference mode).
    """
    unix = int(utc_now.timestamp())
    utc_iso = utc_now.strftime("%Y-%m-%dT%H:%M:%SZ")
    # Use UTC-only timezone metadata to avoid leaking device locale.
    local_iso = utc_now.strftime("%Y-%m-%dT%H:%M:%S+00:00")
    return unix, {"ianaTimeZone": "UTC", "localIso8601": local_iso, "utcIso8601": utc_iso}


# ─── Mint ─────────────────────────────────────────────────────────────────────

def cmd_mint(args):
    print()
    print("  Object Digital Passport — Mint")
    divider()

    network_key, private_key, contract_address = _load_config()
    w3, account, contract, net = connect(network_key, private_key, contract_address)

    # Check profile ID (on-chain creatorId)
    creator_id = contract.functions.getCreatorByWallet(account.address).call()
    if not creator_id:
        print(f"\n  ERROR: Wallet {account.address} is not registered.")
        print(f"  Run: python mint.py --register")
        sys.exit(1)

    print(f"\n  Wallet:     {account.address}")
    print(f"  Profile ID: {creator_id}")
    balance = w3.from_wei(w3.eth.get_balance(account.address), "ether")
    print(f"  Balance:    {balance:.4f} POL")

    # Object type
    print()
    print("  [1/6] Object type")
    print("    1 — Physical (SPEC: artwork, photography, digital, collectible, document, object)")
    print("    2 — Digital  (image, video, 3D, audio)")
    choice      = prompt("Type", "1")
    is_physical = (choice == "1")

    # Object info — the on-chain card (immutable; typo = revoke + re-mint)
    print()
    print("  [2/6] Object info (on-chain card — immutable after mint)")
    title       = prompt("Title (max 128)")
    author_name = prompt("Author / brand name (max 128, goes on-chain)")
    short_description = prompt("Short description (max 256; object kind, technique, creation year)")
    now       = datetime.now(timezone.utc)
    reg_year  = int(prompt("Year", str(now.year)))
    reg_month = now.month
    domain    = prompt("Domain (e.g. contemporary_art / digital_art / software)", "contemporary_art" if is_physical else "digital_art")
    description = prompt_optional("Full description")
    subject = prompt_optional("Subject (what is depicted / what the object is about)")
    creation_date = prompt_optional("Creation date / period (e.g. 2026-02-18 or 2025-11)")
    status = prompt("Status (concept / prototype / produced_object / archived)", "produced_object")
    content_class = prompt("Content class (static / time_based / spatial / textual / composite / executable)", "static")
    ai_status = prompt("AI status (none / assisted / generated)", "none")
    edition_model = prompt("Edition model (unique / limited / open / dynamic)", "limited" if is_physical else "unique")

    if is_physical:
        obj_type = prompt(
            "Category (artwork / photography / digital / collectible / document / object)",
            "artwork",
        )
        medium   = prompt_optional("Medium")
        edition_n = prompt_optional("Edition number (e.g. 1)")
        edition_t = prompt_optional("Edition total (e.g. 3)")
    else:
        obj_type = "digital"
        subtype  = prompt("Subtype (image / video / 3d / audio / document / other)", "image")
        fmt      = prompt_optional("Format (e.g. TIFF, ProRes, GLB)")

    data_url = (prompt_optional("HTTPS URL where the .odpass ZIP will be hosted (or empty for no public URL)") or "").strip()
    if not data_url:
        print("  ⚠  Empty dataUrl: Verify cannot fetch the bundle; only .odpass / passport.json holders can verify.")

    # Primary photo (identification anchor — required for physical)
    print()
    if is_physical:
        print("  [3/6] Primary photo (required identification anchor)")
        image_path = prompt("Path to photo file")
    else:
        print("  [3/6] Preview image (optional)")
        image_path = prompt_optional("Path to image file")
    image_hash_bytes = ZERO_BYTES32
    image_url        = ""

    if image_path and Path(image_path).exists():
        image_hash_bytes = sha256_file(image_path)
        image_url        = prompt_optional("URL where image will be hosted")
        print(f"  Image SHA-256: {image_hash_bytes.hex()}")
    elif is_physical:
        print(f"  ERROR: Photo not found: {image_path} — a physical passport is not valid without it.")
        sys.exit(1)
    elif image_path:
        print(f"  WARNING: File not found — skipping image")
        image_path = ""

    # Digital file hash
    file_path = ""
    file_size = 0
    file_hash_bytes = ZERO_BYTES32
    if not is_physical:
        print()
        print("  [4/6] Original digital file")
        print("  IMPORTANT: Register BEFORE publishing the original file.")
        print("  After registration publish only compressed/watermarked versions.")
        file_path = prompt("Path to original file")
        if not Path(file_path).exists():
            print(f"  ERROR: File not found: {file_path}")
            sys.exit(1)
        print(f"  Computing SHA-256 (may take a moment for large files)...")
        file_hash_bytes = sha256_file(file_path)
        print(f"  File SHA-256: {file_hash_bytes.hex()}")
        file_size = Path(file_path).stat().st_size

    # Identification anchors (docs/ru/REQUIREMENTS_FIELDS_V0.6.md §5.2).
    # Hard minimum enforced by the contract: physical = photo + dimensions +
    # materials + distinguishing features; digital = exact file hash.
    anchors = []
    anchor_mask = 0

    def add_anchor(a_type, data=None, hash_hex=None, verification=None):
        nonlocal anchor_mask
        a = {"type": a_type}
        if data:
            a["data"] = data
        if hash_hex:
            a["hash"] = f"sha256:{hash_hex}"
        if verification:
            a["verification"] = verification
        anchors.append(a)
        anchor_mask |= ANCHOR_BITS[a_type]

    if is_physical:
        add_anchor("photo", {"role": "primary"}, image_hash_bytes.hex())
        print()
        print("  [4/6] Identification anchors (required for physical objects)")
        dims = prompt("Dimensions with units (e.g. 60 x 80 cm, canvas depth 2 cm)")
        add_anchor("dimensions", {"text": dims})
        materials_raw = prompt("Materials & technique (e.g. canvas, oil paint)")
        add_anchor("materials", {"list": [m.strip() for m in materials_raw.split(",") if m.strip()]})
        features = prompt("Distinguishing features (defects, craquelure, repairs — what a copy would not have)")
        add_anchor("distinguishing_features", {"text": features})
        marks = prompt_optional("Inscriptions & markings (signatures, stamps, serials + where)")
        if marks:
            add_anchor("marks", {"text": marks})

        print()
        print("  Optional physical seal anchor:")
        print("    0 — none")
        print("    1 — NFC crypto chip (NTAG 424 DNA)")
        print("    2 — Numbered seal")
        print("    3 — Both")
        seal_choice = int(prompt("Seal", "0") or "0")

        if seal_choice in (1, 3):
            print()
            print("  NFC chip data (NTAG 424 DNA / TagTamper):")
            nfc_uid    = prompt("Chip UID (hex, e.g. 04a3f912cc8b4e)")
            nfc_key    = prompt("Chip public key (hex)")
            nfc_model  = prompt("Model (NTAG424DNA / NTAG424DNA_TAGTAMPER)", "NTAG424DNA_TAGTAMPER")
            nfc_date   = prompt("Installation date (YYYY-MM-DD)", now.strftime("%Y-%m-%d"))
            nfc_notes  = prompt_optional("Notes (location, installation method)")
            nfc_data = {
                "uid":         nfc_uid,
                "publicKey":   nfc_key.replace("0x", ""),
                "model":       nfc_model,
                "installedAt": nfc_date,
            }
            if nfc_notes:
                nfc_data["notes"] = nfc_notes
            add_anchor("nfc", nfc_data)

        if seal_choice in (2, 3):
            print()
            print("  Numbered seal data:")
            seal_number = prompt("Seal number (as printed on seal)")
            seal_type_s = prompt("Seal type (e.g. holographic sticker, wax seal)")
            seal_color  = prompt_optional("Color")
            seal_size   = prompt_optional("Size (e.g. 30x30mm)")
            seal_notes  = prompt_optional("Notes")
            seal_data = {"number": seal_number, "type": seal_type_s}
            if seal_color: seal_data["color"] = seal_color
            if seal_size:  seal_data["size"]  = seal_size
            if seal_notes: seal_data["notes"] = seal_notes
            add_anchor("numbered_seal", seal_data)
    else:
        add_anchor("file_hash", None, file_hash_bytes.hex())
        if image_path:
            add_anchor("photo", {"role": "preview"}, image_hash_bytes.hex())

    # Build passport JSON
    print()
    print("  [5/6] Building passport...")

    reg_unix, reg_clock = registration_clock_block(now)
    has_nfc_anchor = any(a["type"] == "nfc" for a in anchors)
    verification_method = prompt(
        "Verification method (self_asserted / institutional / nfc / c2pa / hybrid)",
        "nfc" if (is_physical and has_nfc_anchor) else ("c2pa" if not is_physical else "self_asserted"),
    )
    passport = {
        "version":    "0.6",
        "passportId": None,  # filled after mint
        # On-chain card — these four fields MUST equal the on-chain values byte-for-byte
        "title":      title,
        "authorName": author_name,
        "shortDescription": short_description,
        "domain":     domain,
        "objectType": "physical" if is_physical else "digital",
        "status":     status,
        "contentClass": content_class,
        "aiStatus":   ai_status,
        "verificationMethod": verification_method,
        "editionModel": edition_model,
        "authorship": {
            "author": {
                "name": author_name,
                "wallet": account.address,
                "creatorId": creator_id,
            }
        },
        "anchors":      anchors,
        "year":         reg_year,
        "month":        reg_month,
        "registeredAt": reg_unix,
        "registration": reg_clock,
    }
    if description:
        passport["description"] = description
    if subject:
        passport["subject"] = subject
    if creation_date:
        passport["creationDate"] = creation_date

    passport["edition"] = {"model": edition_model}
    if is_physical and edition_n and edition_t:
        passport["edition"]["number"] = int(edition_n)
        passport["edition"]["total"] = int(edition_t)

    if is_physical:
        physical = {}
        if obj_type:
            physical["category"] = obj_type
        if medium:
            physical["medium"] = medium
        if physical:
            passport["physical"] = physical
    else:
        digital = {"subtype": subtype}
        if fmt:
            digital["format"] = fmt
        digital["fileHash"] = f"sha256:{file_hash_bytes.hex()}"
        digital["fileSize"] = file_size
        passport["digital"] = digital

    print()
    print("  Optional additional metadata (key=value per line, empty line to finish)")
    extra_meta = {}
    while True:
        line = (prompt_optional("  key=value") or "").strip()
        if not line:
            break
        if "=" in line:
            k, _, rest = line.partition("=")
            k, v = k.strip(), rest.strip()
            if k:
                extra_meta[k] = v
    if extra_meta:
        passport["additionalMetadata"] = extra_meta

    # Compute hashes
    data_hash_bytes = sha256_json(passport)
    # anchorsHash: canonical minified serialization of the anchors array alone
    anchors_hash_bytes = sha256_obj(anchors)

    # Preview
    print()
    print("  [6/6] Preview")
    divider()
    print(f"  Title:        {title}")
    print(f"  Author:       {author_name}")
    print(f"  Short desc:   {short_description}")
    print(f"  Type:         {'physical' if is_physical else 'digital'} / {obj_type}")
    print(f"  Profile ID:   {creator_id}")
    print(f"  Year/Month:   {reg_year}-{reg_month:02d}")
    print(f"  Data URL:     {data_url}")
    print(f"  Data hash:    {data_hash_bytes.hex()}")
    print(f"  Anchors:      {', '.join(a['type'] for a in anchors)} (mask {anchor_mask})")
    print(f"  Anchors hash: {anchors_hash_bytes.hex()}")
    if not is_physical:
        print(f"  File hash:    {file_hash_bytes.hex()}")
    if image_path:
        print(f"  Image hash:   {image_hash_bytes.hex()}")
    divider()

    confirm = input("  Mint? (yes/no): ").strip().lower()
    if confirm not in ("yes", "y"):
        print("  Cancelled.")
        sys.exit(0)

    # This ABI is the 0.7 mint tuple; a 0.6 registry would silently mis-encode it.
    try:
        onchain_generation = contract.functions.CONTRACT_VERSION().call()
    except Exception:
        onchain_generation = None
    if onchain_generation is not None and onchain_generation < 7:
        print()
        print(f"  ERROR: this tool speaks the v0.7 mint tuple, but the registry at")
        print(f"  {net.get('contract')} reports CONTRACT_VERSION {onchain_generation}.")
        print("  Point NET.contract at a v0.7 registry, or use a v0.6 build of this tool.")
        sys.exit(1)

    # Send transaction
    print()
    print("  Minting (gas only, no protocol fee)...")

    mint_inputs = {
        "core": {
            "year": reg_year,
            "month": reg_month,
            "title": title,
            "authorName": author_name,
            "shortDescription": short_description,
            "domain": domain,
            "contentClass": CONTENT_CLASS_CODES.get(content_class, 1),
            "lifecycleStatus": STATUS_CODES.get(status, 3),
            "aiStatus": AI_STATUS_CODES.get(ai_status, 1),
            "verificationMethod": VERIFICATION_METHOD_CODES.get(verification_method, 1),
            "editionModel": EDITION_MODEL_CODES.get(edition_model, 1),
        },
        "dataHash": to_bytes32(data_hash_bytes),
        "dataUrl": data_url,
        "imageHash": to_bytes32(image_hash_bytes),
        "imageUrl": image_url,
        "fileHash": to_bytes32(file_hash_bytes),
        "anchorsHash": to_bytes32(anchors_hash_bytes),
        "anchorTypesMask": anchor_mask,
        # SPEC 0.7 §20.10 — zero keeps the 0.6 meaning: the minter owns what it mints.
        # A mint naming someone else goes through ODPEditionUnits, not this tool.
        "initialOwner": "0x0000000000000000000000000000000000000000",
    }

    mint_fn = contract.functions.mintPhysical if is_physical else contract.functions.mintDigital
    fn = mint_fn(
        mint_inputs,
        False,           # dataUrlIsFolderBase — CLI uses full dataUrl; use web UI for folder-base mint
        "",              # mintOnBehalfOfCreatorId — empty = mint as connected wallet
    )

    tx_hash, receipt = send_tx(w3, account, fn, net)

    human_id = human_id_from_mint_receipt(contract, receipt)
    if not human_id:
        print("\n  ERROR: Could not read Passport ID from PassportMinted event.")
        print(f"  Transaction: {net['explorer']}/tx/{Web3.to_hex(tx_hash)}")
        sys.exit(1)

    passport["passportId"] = human_id
    passport_json_str = json.dumps(
        normalize_nfc(passport), sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )

    tx_hex = Web3.to_hex(tx_hash)
    contract_cs = Web3.to_checksum_address(contract_address)

    def b32h(b):
        return ZERO_HEX32 if b == ZERO_BYTES32 else bytes32_to_hex0x(b)

    orig_for_zip = file_path if (not is_physical and file_path and Path(file_path).is_file()) else None
    img_for_zip = image_path if (image_path and Path(image_path).is_file()) else None

    manifest = {
        "format": "odpass-bundle",
        "passportId": human_id,
        "createdAtUtc": odp_created_at_utc_iso(),
        "mode": "full",
        "onChain": {
            "dataHash": bytes32_to_hex0x(to_bytes32(data_hash_bytes)),
            "anchorsHash": bytes32_to_hex0x(to_bytes32(anchors_hash_bytes)),
            "anchorTypesMask": anchor_mask,
            "imageHash": b32h(image_hash_bytes),
            "fileHash": b32h(file_hash_bytes),
            "txHash": tx_hex,
            "chainId": int(net["chain_id"]),
            "contract": contract_cs,
        },
    }

    output_dir = Path("passports")
    output_dir.mkdir(exist_ok=True)
    odp_path = output_dir / (safe_odp_basename(human_id) + ".odpass")
    write_odp_bundle(odp_path, passport_json_str, manifest, orig_for_zip, img_for_zip)

    print()
    divider()
    print(f"  ✅ Minted successfully")
    print()
    print(f"  Passport ID:  {human_id}")
    print(f"  Transaction:  {net['explorer']}/tx/{tx_hex}")
    print()
    print(f"  Saved bundle: {odp_path}")
    print(f"  (Same .odpass zip layout as web Passport: SPEC.md §15, manifest bundleVersion 0.3, originals/ + manifest.originals.)")
    print()
    print(f"  Next steps:")
    if data_url:
        print(f"  1. Upload the .odpass ZIP to your dataUrl (same bytes as saved bundle — not bare passport.json).")
    else:
        print(f"  1. Keep the .odpass safe; without a public dataUrl only holders can verify against the chain.")
    print(f"  2. Drop the .odpass on Verify or enter Passport ID {human_id}")
    print(f"  3. QR: python mint.py --qr {human_id}")
    divider()

# ─── Generate QR ──────────────────────────────────────────────────────────────

def cmd_qr(args):
    human_id = args.qr
    output_dir = Path("passports")
    output_dir.mkdir(exist_ok=True)
    qr_path = output_dir / f"{human_id}.qr.png"
    generate_qr(human_id, str(qr_path))
    print(f"\n  QR saved: {qr_path}")
    print(f"  Content:  odp://{human_id}\n")

# ─── Config loader ────────────────────────────────────────────────────────────

def _load_config():
    private_key = os.getenv("PRIVATE_KEY", "").strip()
    if not private_key:
        private_key = input("  Private key (from MetaMask): ").strip()
    if private_key.startswith("0x"):
        private_key = private_key[2:]

    print()
    print("  Network:")
    print("    1 — Polygon Amoy (testnet, free)")
    print("    2 — Polygon PoS  (mainnet, ~$0.01)")
    choice      = input("  Choose [1]: ").strip() or "1"
    network_key = "amoy" if choice == "1" else "polygon"

    dep_file = Path(f"deployments/{network_key}.json")
    if dep_file.exists():
        with open(dep_file) as f:
            dep = json.load(f)
        contract_address = dep["contractAddress"]
        print(f"  Contract: {contract_address} (from deployments/{network_key}.json)")
    else:
        contract_address = input("  Contract address (0x...): ").strip()

    return network_key, private_key, contract_address

# ─── Entry point ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Object Digital Passport — CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Commands:
  python mint.py                  Mint a new passport (interactive)
  python mint.py --register       Register your profile (on-chain creatorId)
  python mint.py --check          Check your profile ID
  python mint.py --qr ODP-2026-03-004829301  Generate QR for a Passport ID
        """
    )
    parser.add_argument("--register", action="store_true", help="Register profile (on-chain creatorId)")
    parser.add_argument("--check",    action="store_true", help="Check profile ID")
    parser.add_argument("--qr",       metavar="PASSPORT_ID", help="Generate QR code (odp://…)")
    args = parser.parse_args()

    if args.register:
        cmd_register(args)
    elif args.check:
        cmd_check(args)
    elif args.qr:
        cmd_qr(args)
    else:
        cmd_mint(args)

if __name__ == "__main__":
    main()
