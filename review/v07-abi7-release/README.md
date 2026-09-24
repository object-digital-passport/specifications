# Release-бандл ABI `0.7-redesign-7` — хеш утверждён владельцем 2026-09-21

**Утверждение 2026-09-21:** владелец утвердил canonical hash `sha256:91c9ee4a9eb27f6b8ada9bf2bbcd394fafbe5d9dbfae539efa4e53ce0d5b76f7`
с оговоркой, что код ещё может измениться. Любое изменение исходников даёт другой хеш и требует нового
бандла и нового утверждения. Утверждение хеша не разрешает deployment: кошелёк, сеть и публикация по-прежнему запрещены.
Ниже — исходная запись о сборке; слова «не утверждён» в ней относятся к моменту сборки.

Дата сборки: 2026-09-21. Собран офлайн, без кошелька, без сети, без deployment и публикации.

**Это кандидат, а не утверждённый release.** Хеш ниже не является `approvedHash`. Его должен независимо
проверить и явно утвердить владелец; до этого deployment по-прежнему запрещён.

| Что | Значение |
|---|---|
| Файл | `release.json` |
| Canonical release hash (то, что сравнивают скрипты) | `sha256:91c9ee4a9eb27f6b8ada9bf2bbcd394fafbe5d9dbfae539efa4e53ce0d5b76f7` |
| SHA256 байтов файла | `8793fbf2858d669071beeefc504d6fb771269f9c9d76fcd8b6f8325d43b1f26a` |
| `abiGeneration` | `0.7-redesign-7` |
| Компилятор | solc-js `0.8.20+commit.a1b79de6`, `compilerHash sha256:5c509f76…c657` — тот же файл, что закреплён в ABI6-релизе (`review/audit-handoff-abi6/release/soljson.cjs`) |
| `sourceCommit` | `5d1db8f…` — только происхождение; реальные исходники вложены в бандл, HEAD их не описывает |
| Контракты | 10 (core + 9 спутников), все runtime ≤ 24 576 байт; core — 12 481 байт |

## Как собран

1. Копия `chain/contracts`, `hardhat.config.ts`, `package*.json` в изолированный каталог вне репозитория;
   `npx hardhat compile --force` с `ODP_SOLC_JS`, указывающим на закреплённый soljson.
2. `node deploy/scripts/release.mjs BUILD_INFO SOLJSON NEW_RELEASE_FILE`, запущенный из репозитория.
   Упаковщик сверил полный список и содержимое исходников репозитория с build-info, дважды
   перекомпилировал standard-json и потребовал побайтного совпадения с записанным output.

Репозиторий при сборке не менялся: хеши `chain/contracts`, `chain/abi`, `chain/types`, `schema`
до и после совпадают.

## Что проверено

- ABI всех 10 контрактов в бандле побайтно совпадает с `chain/abi/*.json`.
- Core ABI содержит `finalizePassportForPrint`, `getPassportReleaseState`, `PERSONAL_REVOCATION_WINDOW`,
  `ISSUER_REVOCATION_WINDOW`; `REVOCATION_WINDOW` отсутствует.
- `ODP07MainnetPath.test.js` в изолированной копии с путём, заменённым на этот бандл: **13 / 13 pass**
  (полный deployment десяти контрактов через два локальных HTTP RPC, resume на всех стадиях, finality,
  расхождение runtime, nonce, бюджет, подделка плана, read-only preflight). Это локальная симуляция
  chain 137, не Polygon.

## Чего этот кандидат не закрывает

- Утверждения хеша и независимого аудита ABI7. Аудит `0.7-redesign-6` его не покрывает.
- В репозитории `ODP07MainnetPath.test.js` по-прежнему читает `review/v07-no-stop/release.json` (ABI6)
  и падает; переключение теста — правка кода, здесь не выполнялась.
- Двух падений `EC(121)` в `ODP07Bundle.test.js` из-за устаревших фикстур (дельта, раздел 5.4).
  Они не влияют на байты контрактов, но зелёного полного прогона пока нет.
- Реальных адресов, receipts, gas caps и production generation.

Подробности: [дельта после аудиторского пакета](../../ODP_07_ABI6_DOCUMENTATION_DELTA.md), раздел 5.3.
