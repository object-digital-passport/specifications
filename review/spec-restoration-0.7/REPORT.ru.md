# Возврат потерянных разделов SPEC 0.7

Дата: 2026-09-24. Ветка `release/v0.7`.

Коммит `7d11eab` (20.09.2026) сжал `SPEC.md` с 2730 до ~780 строк при переходе на ABI `0.7-redesign-7`. Здесь
каждый раздел старой SPEC (`origin/main`, 158 разделов и подразделов) отнесён к одной из групп:

- **есть** — содержание уже было в текущей SPEC (56);
- **потеряно** — всё ещё верно для кода `0.7-redesign-8` и решений; возвращено в SPEC, переписано под текущий код (74);
- **устарело** — противоречит коду или решениям; не возвращено (28).

После возврата `SPEC.md` вырос с 1063 до 1596 строк. Номера §22 и CA-x не менялись.

## Требует решения владельца

1. §3: публикация ID профиля записана как SHOULD, а раньше была MUST.
2. Поля `odp` и `wallet` в `.well-known/odp.json` не возвращены: их не сверили с форматом справочника `odp-profile-directory`.
3. Доказательство кошелька издателя (EIP-191) возвращено, но для издателя на Safe оно не работает (нужен ERC-1271).
4. Требования SLIP-39 2-из-3 и ISO 14298 не возвращены: они расходятся с хранением секретов в `.odpsecret` (CA-7.1).
5. Формат скрытого кода (DataMatrix или QR под скретч-слоем) не зафиксирован: он ждёт печатных тестов `review/qr-07`.
6. Номера статей ESPR в §18.0 перенесены из старого текста без сверки с регламентом.
7. Не проверено, действует ли в mainnet v0.6 подстановка `tx.origin` через роутер `0x3fa8f213…`.
8. Форма `odp://<Profile ID>` в §12 требует подтверждения.

## Таблица соответствия

| Раздел старой SPEC | Группа | Где сейчас или почему удалено |
|---|---|---|
| Заголовок, автор, девиз «authentication via blockchain» | устарело | ODP не устанавливает подлинность (§1, §22.16); название — в заголовке SPEC |
| Languages and translations | потеряно | Шапка SPEC: нормативен только английский текст |
| Table of Contents | устарело | Перечисляет старую структуру |
| IMPORTANT: 0.x deployments… | потеряно | §7: профили и паспорта принадлежат одному поколению; «канонический реестр — v0.6» устарело |
| Multi-contract architecture | устарело | Связанная библиотека и `ODPCounterfeitConcern` удалены; состав — §1, §21.2 |
| Forward alignment → v1 | есть | §14; фраза про 1.0 добавлена |
| On-chain capabilities of the reference | устарело | owner, transfer, mint agent, events, governance, router удалены; `EC` — §21.1 |
| §1 Overview | есть | §1; возвращены offline-capable и позиционирование |
| §1.1 Terminology | потеряно | §1.1, переписан |
| §2 Passport ID | есть | §2 |
| §2 Format | потеряно | Таблица в §2 |
| §2 Examples | потеряно | §2 |
| §2 Generation algorithm | потеряно | §2, `EC(61)` |
| §2 Rules, UTC mint month | есть | §2; ссылка на `creationDate`/`objectYear` возвращена |
| §3 Profile ID | есть | §3 |
| §3 Format | есть | §3 |
| §3 Type prefixes | потеряно | §3 «Type prefixes and format», `EC(53)`, `EC(54)` |
| §3 Monthly mint caps | есть | §3 |
| §3 Examples | потеряно | §3 |
| §3 Generation algorithm | потеряно | §3, `EC(62)` |
| §3 Full public identity | потеряно | §3 «Public identity» |
| §3 Public identity requirement | потеряно | §3, MUST→SHOULD (сомн. 1) |
| §3 `.well-known/odp.json` | есть | §22.10; правила HTTPS/advisory добавлены; поля `odp`, `wallet` — сомн. 2 |
| §3.1 Stopping a profile, `compromised` | устарело | `revokeCreator` удалён |
| §3 On packaging | есть | §5, CA-14.8 |
| §3 Mint agent delegation | устарело | Делегирования выпуска нет |
| §4 Proof Institution | есть | §4 |
| §4 What a Proof Institution does | есть | §4; «мы изучили и подтверждаем» устарело |
| §4 Counterfeit flag | устарело | Заменён `ODPPassportConcerns` (§13) |
| §4 Public directory of profile IDs | есть | §22.10, CA-10.1–10.5 |
| §4 Optional affiliation | потеряно | §4: `EC(67/69/71)`, правила показа |
| §4 Proof ID format | потеряно | §4, алгоритм, `EC(60)` |
| §4 Proof record fields | потеряно | §4 |
| §4 Cost | есть | §1, §4 |
| §4 Public identity for institutions | есть | §22.10 |
| §5 Verification Label | есть | §5 |
| §5 Required elements | потеряно | §5 (коррекция Q) |
| §5 Optional elements | потеряно | §5 |
| §5 Seal retention | потеряно | §5, §6 |
| §5 What is NOT defined | потеряно | §5 |
| §6 Physical Seal | есть | §6 |
| §6 Method A — NFC | потеряно | §6 «`nfc` anchor», информативно |
| §6 TagTamper, high-assurance, публикация ключа | потеряно | §6 |
| §6 Method B — Numbered seal | потеряно | §6 |
| §6 Seal rule | есть | §8/§9 маска; NTAG 213 — §6 |
| §6 On-chain binding of seal anchors | есть | §9, §6 |
| §6 Seals at production scale | есть | §20 |
| §6 Other NFC technologies | потеряно | §6 |
| §7 Network | есть | §7, §22.12; Amoy и цены устарели |
| §7 Canonical registry addresses | устарело | Другой состав, адресов 0.7 нет |
| §7 Superseded lines | потеряно | §7 |
| §8 On-Chain Record (поля) | потеряно | §8, хранимые поля; owner/mintAgent/events/URL устарели |
| §8 Removed relative to v0.5 | устарело | История |
| §8 Immutability after mint | есть | §8 |
| §8 Folder-base dataUrl | устарело | URL в ядре нет |
| §8 mint (`initialOwner`, `ViaExtension`) | устарело | Удалены |
| §8 events, ownership, URLs, revocation | устарело | Удалены; хостинг — §13 |
| §8 deploy, freeze, governance | устарело | Удалены |
| §8 Reverts | есть | §21.1 |
| §8 Protocol extensions | есть | §13 |
| §8 A) Global dataHash uniqueness | есть | §3 |
| §8 B) Author attestation | потеряно | §13 |
| §9 Passport JSON | есть | §9 |
| §9 `.odpass` hierarchy | устарело | `files/<sha256>` |
| §9 Hosting `dataUrl` | устарело | `ODPHosting`, CA-19.6 |
| §9 Creator responsibility | есть | §19, CA-9.3, CA-18.3 |
| §9 Canonical passport schema | потеряно | §9 |
| §9 Required top-level fields | потеряно | §9 |
| §9 Identification anchors | потеряно | §9 |
| §9 Controlled values | есть | §8 |
| §9 Object-specific blocks | потеряно | §9 |
| §9 Mixed object semantics | потеряно | §9 |
| §9 Immutable core vs events | потеряно | §9 (несовпадение карточки); события устарели |
| §9 Content class taxonomy | потеряно | §9 |
| §9 Calendar year/month | есть | §9; `objectYear` в таблице |
| §9 Registration instant | есть | §9 |
| §9 Example — physical | потеряно | ссылка §9 |
| §9 Example — digital | потеряно | ссылка §9 |
| §9 Example — mixed | потеряно | ссылка §9 |
| §9 Legacy subtype/category | потеряно | §9 |
| §9 Digital authorship principle | устарело | противоречит D3/CA-3 |
| §9 C2PA compatibility | потеряно | §9 |
| §9 Serialization rules (NFC) | есть | §10 |
| §9 Rules | есть | §8–§10 |
| §10 Hashing | есть | §10 |
| §10 dataHash | есть | §10 |
| §10 Serialization rules | есть | §10; примеры возвращены |
| §10 anchorsHash | есть | §10 |
| §10 fileHash | потеряно | §10 |
| §10 imageHash | потеряно | §10 |
| §10 NFC/QR carriers | потеряно | §10 |
| §11 Verification | есть | §11 |
| §11 Level 1 | есть | §11; AUTHENTIC/TAMPERED устарели |
| §11 Authorship and legal rights | есть | §1, §16, §11 |
| §11 Level 1B | потеряно | §11 (сомн. 3) |
| §11 Level 1C | потеряно | §11 |
| §11 Level 2A | потеряно | §6 |
| §11 Level 2B | потеряно | §11, §6 |
| §11 Level 2D | потеряно | §11 |
| §11 Level 2C | есть | §11 |
| §11 Level 3 | потеряно | §11 |
| §11 Verification states | устарело | CA-16.4 |
| §11 Assurance tiers | устарело | CA-16.1 (сомн. 6) |
| §12 QR and URI | есть | §12, §22.14 |
| §12.1 odp scheme | потеряно | §12 (сомн. 9) |
| §12.2 QR encoding | потеряно | §5, §12; «хост не печатается» устарело |
| §12.3 Registry context | есть | §12, §22.12 |
| §13 SDK Requirements | есть | §13 |
| §13 Almost-ERC Read Standard | потеряно | §13 таблица; прочее устарело |
| §14 Versioning | потеряно | §14 |
| §15 .odpass bundle | есть | §15 |
| §15.1 Format (originals/) | устарело | заголовок 15.1 над текущим текстом |
| §15.1.1 manifest shape | устарело | `schema/bundle-0.7` |
| §15.2 Verification rules | есть | §15.2 |
| §15.3 Trust model | потеряно | §15.3 |
| §15.3 Without the chain | потеряно | §15.3 |
| §16 Does NOT define | потеряно | §16 |
| §16.1 Durable hosting | потеряно | §16.1 |
| §17 Wallet & Key | есть | §17 |
| §17 Reference web UI | устарело | сайт; CA-20.1 |
| §17 Key generation | потеряно | §17 |
| §17 Storage approaches | потеряно | §17 |
| §17 Losing access | потеряно | §17 |
| §17 Extensions | устарело | CA-5.6, CA-20.1 |
| §18 Interop intro | потеряно | §18 |
| §18.0 ESPR | потеряно | §18.0 (сомн. 7) |
| §18.1 Optional fields | потеряно | §18.1 |
| §18.1.1 GS1 pairing | устарело | GS1 отменён |
| §18.2 did:odp | потеряно | §18.2 |
| §18.2.1 DID flow | потеряно | §18.2 |
| §18.3 VC | потеряно | §18.3 |
| §19 URI and resolvers | есть | §12 |
| §19.1 URI scheme | потеряно | §12 |
| §19.2 Registry context | есть | §12, §22.12 |
| §19.3 did:odp relation | потеряно | §18.2 |
| §19.4 HTTP resolver | есть | §12; odp-resolver с 80002 устарел |
| §19.5 Helpers | есть | CA-14.4, CA-19.7 |
| §19.6 Reverse lookup | потеряно | §12 |
| §19.7 Trust summary | есть | §12, §22.12 |
| §20 Editions | есть | §20 |
| §20.1 Scope | есть | §20.1 |
| §20.2 Edition passport | потеряно | §20.1 |
| §20.3 unit_key_set | потеряно | §20.3, §15 |
| §20.4 unit_variant_commit | потеряно | §20.4 |
| §20.5 Derivation | есть | §20.5 (сомн. 4) |
| §20.6 Code encoding | есть | §20.6 |
| §20.7 Carriers | потеряно | §20.7 (сомн. 5) |
| §20.8 Key ceremony | потеряно | §20.8–20.9 (сомн. 4) |
| §20.9 Activation | есть | §20.8–20.9 |
| §20.9 Sponsorship on-chain | устарело | §22.20 |
| §20.10 Unit passports | устарело | D4 |
| §20.11 Verification | есть | §11, CA-4.1, §20.3 |
| §20.12 Tiers | устарело | CA-16 |
| §20.13 Lifecycle | устарело | окно по времени |
| §20.13 Revocation window | устарело | то же |
| §20.13 Edition notice | потеряно | принцип в §20.10–20.13; механизм устарел |
| §20.14 Stated limits | потеряно | §20.14 |
| Footer | потеряно | конец SPEC |
