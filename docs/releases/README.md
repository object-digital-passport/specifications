# Releases

One file per version. Each file **is** the GitHub Release body, copied verbatim — the file is
the source of truth, the release page is a copy, and the two cannot drift apart.

Written to [`.github/RELEASE_TEMPLATE.md`](../../.github/RELEASE_TEMPLATE.md), which also holds
the rules. Checked by `node chain/tools/lint_release_notes.mjs`.

These notes are deliberately short and jargon-free. The complete technical record for every
version is [`CHANGELOG.md`](../../CHANGELOG.md).

| Version | | |
|---|---|---|
| [**v0.7**](v0.7.md) | a registry nobody can override | **prepared** — not deployed yet; new passports still go to v0.6 |
| [v0.7 preview](v0.7-preview.md) | passports for things made in thousands | pre-release of 22 Aug 2026, never deployed, replaced by v0.7 |
| [v0.6](v0.6.md) | what a passport stores, redesigned | current deployed line, live since 24 Jul 2026 |
| [v0.5](v0.5.md) | deployed, never released | superseded — the note explains why |
| [v0.4.1](v0.4.1.md) | website and tooling only | no blockchain change |
| [v0.4](v0.4.md) | honest dates, and a way to flag a fake | |
| [v0.3](v0.3.md) | passports gained an owner | |
| [v0.2](v0.2.md) | no fees, and fewer things forced on you | |
| [v0.1](v0.1.md) | the first working version | |

Release notes are English only. Russian translations of the narrative documents live under
`web/frontend/localization/ru/`.
