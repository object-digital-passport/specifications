# Versioning and releases

*How a release **note** is written — sections, jargon rules, publishing commands — is [`.github/RELEASE_TEMPLATE.md`](../.github/RELEASE_TEMPLATE.md). This page is about tags and branches.*

*Author: Andrei Chernikov*

See also **[`docs/README.md`](README.md)** for an index of all docs in this folder and pointers to **`SPEC.md`**.

Current ODP 0.7 uses ABI `0.7-redesign-7` and packed byte 7. Earlier ABI0.7 generations are incompatible. Select a decoder by independently trusted chain/address/runtime/ABI, never the version byte. No production generation is approved. Normative rules: [SPEC §7/§14](../SPEC.md).

This document explains how **product versions** (e.g. **v0.1**), **`main`**, and **git tags** work together — and what “I don’t want to change v0.1 anymore” means in practice.

## What is immutable by design

| Mechanism | What it fixes |
|-----------|----------------|
| **Git tag** (e.g. `v0.1`) | Points to **one commit forever** unless someone **deletes or force-moves** the tag (avoid that after publish). |
| **Deployed smart contract** | Bytecode at a given address does not change (unless you use an upgradeable proxy pattern — this project does not). |
| **GitHub Release** attached to a tag | Human-facing notes and assets for that tag; editable text, but the **tag → commit** link is what pins the code. |

So: **“v0.1” as a released snapshot** = the **commit** referenced by tag **`v0.1`** (and any GitHub Release you attach). You do not need a second repository; one repo + tags is enough.

## What `main` is for

- **`main`** is the **moving development line**. It may contain fixes and new work toward **v0.2** (or **v0.1.1** — see below).
- Pushing new commits to **`main`** does **not** change the commit that **`v0.1`** already points to — unless you **retag** or **delete the tag** (don’t, after release).

Typical flow:

1. You finish v0.1 work, tag **`v0.1`**, publish a GitHub Release, deploy Sites from that commit if needed.
2. Further development for the **next** protocol/tooling line happens on **`main`** (e.g. v0.2). The **v0.1** tag still marks the old snapshot.

## “I only want bugfixes for v0.1, then I want it frozen”

Interpretation in git terms:

1. **Freeze the line** = stop treating **`main`** as “v0.1” and treat **tag `v0.1`** as the last v0.1 snapshot. New work on **`main`** is **v0.2-dev** (or a dedicated branch — see below).
2. **Critical bugs** that must ship **without** a full v0.2:
   - Option **A** — **Patch tag** from a branch cut from **`v0.1`**: e.g. branch `release/v0.1`, cherry-pick or commit fixes, tag **`v0.1.1`**, release notes “hotfix”.
   - Option **B** — Fix on **`main`** and tag **v0.2.0** when ready (users on v0.1 stay on old contract/UI until they migrate — depends on your product story).

For **contract** bugs, often only **A** or a **new deployment** with a new address applies; document which address matches which tag.

## Solo maintainer: can you “remove your own ability” to edit v0.1?

- **Tags:** You can **choose not to move** `v0.1`. That is a **policy** choice. Git does not block the repo owner from deleting a tag unless you use **GitHub organization rules** or similar.
- **Branch protection** on **`main`**: You can require **pull requests** and disallow **direct pushes**, including for **administrators** (see [`.github/BRANCH_PROTECTION.md`](../.github/BRANCH_PROTECTION.md)). That does not delete **`v0.1`**, but it slows accidental changes to **`main`**.
- **True “I cannot override”** as the only owner is **hard** on GitHub: the account with **owner** rights can usually change settings again. Some teams use a **second account**, **org-level rules**, or **signed tags + policy** for stricter control.

**Practical approach:** Treat **`v0.1`** as **immutable after release**: no retagging, document “supported until …”, and do new work under **v0.2** on **`main`** or **`develop`**.

## Summary

| Goal | Action |
|------|--------|
| Ship v0.1 | Tag **`v0.1`**, optional GitHub Release, note contract + Pages commit. |
| Keep v0.1 stable | Do **not** move or delete tag **`v0.1`**; hotfixes → **`v0.1.1`** from a **release/v0.1** branch if needed. |
| New features | **`main`** (or **`v0.2`** branch) → later tag **`v0.2.0`**. |
| Stricter process | Branch protection + PRs (see `.github/BRANCH_PROTECTION.md`). |

---

*Aligned with README “Current release” and [`SPEC.md`](../SPEC.md) versioning section.*
