> **Устарело частично (2026-09-24).** Встроенного кошелька, passkey и Safe, который создаёт приложение, не будет: приложение подключает кошелёк только через WalletConnect (SPEC CA-20.1), спонсор в 0.7 только пополняет POL (CA-20.2–20.6). Годится как справка о смарт-аккаунтах на будущее.

# План: «спонсор платит газ, студент единолично контролирует аккаунт» для ODP 0.7

Дата: 2026-09-24. Статус: инженерный план, ничего не реализовано и не развёрнуто.
Контракты ODP ABI7 не меняются. Всё ниже работает поверх них, потому что реестр видит только `msg.sender`
(SPEC §3: «Contract wallets may issue as themselves»), а `tx.origin` и делегирования в нём нет.

---

## 0. Вывод

**Рекомендуемый стек**

1. **Аккаунт:** Safe v1.4.1 (вариант SafeL2) через канонический `SafeProxyFactory`, порог 1.
2. **Подписант:** passkey студента через Safe Passkey Module v0.2.1 (`SafeWebAuthnSharedSigner` или
   `SafeWebAuthnSignerProxy` из `SafeWebAuthnSignerFactory`). Проверка P-256 идёт **только** через precompile
   `0x100` на Polygon PoS, без контрактного fallback-верификатора.
3. **Газ:** ERC-4337, EntryPoint **v0.7** (`0x0000000071727De22E5E9d8BAf0edAc6f37da032`) и `Safe4337Module` v0.3.0
   (`0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226`, развёрнут на 137 и 80002). Спонсор платит через verifying
   paymaster с белым списком «только вызовы ODP».
4. **Восстановление (выбор студента):** второй владелец под контролем студента. Варианты: второй passkey,
   Tangem через уже встроенный WalletConnect, опционально модуль social recovery с задержкой.
5. **Инфраструктура:** любой bundler с EntryPoint v0.7 (Pimlico, Alchemy, Candide, Etherspot или свой Alto/Rundler).
   Запасной путь без bundler'а: приложение само вызывает `EntryPoint.handleOps` или `Safe.execTransaction`
   с любого EOA, на котором есть POL.

**Почему Safe.** Это единственный вариант, где одновременно выполнено следующее:
- код открыт и много раз проаудирован;
- ODP уже проверил Safe 1.4.1 как издателя в `ODP07Safe.test.js`;
- у фабрики, Safe Foundation и разработчика приложения нет прав над аккаунтом;
- сменить singleton (обновить код) может только транзакция, подписанная владельцами;
- passkey-модуль и 4337-модуль уже лежат по каноническим адресам на Polygon;
- при исчезновении всех сервисов владелец может выполнить `execTransaction` напрямую.

**Чего избегать**

- **EIP-7702 как основного аккаунта.** На Polygon он включён с Bhilai (июль 2025), но корневым ключом остаётся
  secp256k1-ключ EOA, то есть та же сид-фраза. Secure Enclave умеет только P-256 и такой ключ не хранит.
  Если ключ сгенерировал университет, контроль у университета навсегда.
- **Аккаунтов, созданных или настроенных спонсором.** Университет не должен выбирать владельцев, модули,
  guard, fallback handler и `setup`-delegatecall. Адрес вычисляется из initializer'а, который собрало
  приложение студента.
- **Кастодиальных и MPC-кошельков «от провайдера»** (Coinbase-хостинг `keys.coinbase.com`, email/SMS-кошельки,
  встроенные кошельки SaaS). Ключ или RP-домен у третьей стороны.
- **Паролей, OTP и «recovery-сервиса» спонсора как единственного пути восстановления.**
- **Контрактного fallback-верификатора P-256** в конфигурации passkey-подписанта. Это лишний код, от которого
  зависит подпись. Safe уже удалил `FCLP256Verifier` из текущей ветки из-за известных багов.
- **Прав спонсора внутри аккаунта:** его ключ как owner, модули, session keys, «аварийный» guardian без задержки.
  Спонсор может только перестать платить.

---

## 1. Что есть в коде сейчас (опора для плана)

| Где | Что есть | Что это значит для плана |
|---|---|---|
| `swift-core/Sources/ODPCore/Chain/TransactionSender.swift` | Протокол `TransactionSender.send(calldata:from:) -> txHash` | Сюда встаёт новый `SmartAccountSender`. Протокол менять не нужно: он может вернуть хэш транзакции из `eth_getUserOperationReceipt`. |
| `swift-core/.../PolygonRPC.swift`, `ABI.swift`, `Keccak256.swift`, `RLP.swift` | JSON-RPC, ABI-кодирование, Keccak | Этого хватает для UserOperation v0.7, EIP-712-хэша SafeOp и CREATE2-предсказания адреса. Новых криптозависимостей не нужно: P-256 даёт `CryptoKit`/`AuthenticationServices`. |
| `apple-app/Backend/Shared/Chain/TransactionSender.swift` | `WalletConnectSender`: оценка газа, `eth_sendTransaction` через WalletConnect, ожидание квитанции | Остаётся для внешних кошельков (B/P/M, Tangem). |
| `apple-app/Backend/Shared/Wallet/WalletConnect/WalletConnectService.swift` | Reown Sign/Pair, методы `personal_sign`, `eth_sendTransaction`, eip155:137, Tangem в пикере | Через него же добавляется «резервный владелец Tangem» (`personal_sign` для доказательства владения адресом). |
| `apple-app/Backend/Shared/Wallet/WalletVault.swift` | Локальный сид-кошелёк только в `#if DEBUG`, в Release только внешние кошельки | Своих ключей в Release приложение сейчас не держит. Passkey станет первым «своим» подписантом, и это нужно отразить в CA-1.x. |
| `apple-app/Backend/Shared/Chain/CreatorRegistryPolicy.swift` | `approvedDeployment = nil`: запись в 0.7 закрыта до утверждённого деплоя | Все этапы с mainnet ждут деплоя ODP 0.7. |
| `apple-app/Backend/Shared/AppState/AppModel+Registration.swift` | `registerProfileOnChain` использует жёстко `WalletConnectSender()`, на iOS разрешён только тип C | Отправителя нужно выбирать по типу аккаунта. |
| `apple-app/Config/iOS/ODP.entitlements` | Associated Domains (`webcredentials:`) нет | Для passkey обязательно, см. риск R1. |
| `chain/deploy/test/ODP07Safe.test.js`, `fixtures/safe-1.4.1.json` | Safe 1.4.1 2-of-3 как издатель B/P/M, фикстура с npm integrity и sha256 | Шаблон для нового теста. |
| `chain/contracts/ODPAuthorAttestation.sol`, `ODPEditionUnits.sol` | `ecrecover` (подпись автора и активация юнита) | Здесь смарт-аккаунт подписать не может: нужен EOA. Для этой задачи не нужно, но в UI это ограничение надо назвать. |

Побочное наблюдение: в коде приложения нет проверки `eth_getCode` для кошелька, так что правило CA-5.7
«не регистрировать C на Safe» сейчас, похоже, не реализовано. Это стоит проверить отдельно.

---

## 2. Архитектура и потоки

### Участники

```
Студент (iPhone/Mac, passkey в iCloud Keychain)
   │  подписывает только сам (Face ID / Touch ID)
   ▼
Приложение ODP ──UserOp──► Bundler (любой, заменяемый) ──handleOps──► EntryPoint v0.7
   │   ▲                                                                 │ validateUserOp
   │   │ pm_getPaymasterData (ERC-7677)                                  ▼
   │   └──────── Paymaster-сервис спонсора ◄── политика: ODP-вызовы,   Safe студента (порог 1)
   │              (подписывает спонсорство,    лимиты, срок              │ Safe4337Module → call
   │               НЕ подписывает операции)                              ▼
   │                                                            ObjectDigitalPassport (msg.sender = Safe)
   └── чтение состояния аккаунта напрямую из RPC (минимум 2 независимых RPC)
```

Права: владельцы Safe = passkey студента и (по выбору студента) его резервные подписанты. Спонсор владеет
только своим контрактом paymaster и депозитом в EntryPoint. Паспорт и профиль привязаны к адресу Safe,
поэтому смена ключей внутри Safe не меняет профиль. CA-1.4 не нарушается: адрес остаётся прежним.

### Поток А. Приглашение и создание аккаунта

1. Спонсор создаёт в консоли приглашения: `inviteId`, срок, лимит газа, подпись спонсора. Выдаёт QR или код.
   Ключей и адресов на этом шаге нет.
2. Студент сканирует QR в приложении. Приложение показывает, кто спонсор, что он оплачивает, что он увидит
   (адрес и операции) и что прав на аккаунт у него нет.
3. Приложение создаёт passkey (`ASAuthorizationPlatformPublicKeyCredentialProvider`, RP ID = домен ODP) и
   извлекает из attestation COSE-ключ P-256 (x, y).
4. Приложение **само** собирает initializer Safe: owners = [подписант passkey], threshold = 1,
   модуль и fallback handler = `Safe4337Module` через `SafeModuleSetup`. Адрес предсказывается по CREATE2.
5. Приложение отправляет спонсору `(inviteId, safeAddress)`. Паспортных данных и passkey в этом сообщении нет.
   Paymaster-сервис вносит адрес в свою политику.
6. Сам деплой происходит в первой UserOp (`initCode`) из потока Б, поэтому отдельной транзакции от спонсора нет.

Вариант «университет заранее создаёт аккаунты» в буквальном смысле (ключи до студента) **отвергнут**.
Без passkey студента нельзя вычислить владельца, а всё, что создано до студента, создано чужой волей.
«Заранее» здесь означает заранее выпущенные приглашения и бюджет.

### Поток Б. Первая регистрация профиля (C)

1. Приложение готовит UserOp: `sender` = предсказанный Safe; `initCode` = фабрика + `createProxyWithNonce`;
   `callData` = `Safe4337Module.executeUserOp(ODP, 0, registerCreator("C"), CALL)`.
2. `pm_getPaymasterStubData`, затем `eth_estimateUserOperationGas`, затем `pm_getPaymasterData`.
   Paymaster проверяет политику и подписывает `paymasterAndData`.
3. Приложение декодирует всю UserOp (CA-5.3): chainId, EntryPoint, sender, цель, селектор, аргументы,
   `operation = CALL`, paymaster. Затем показывает экран подтверждения.
4. Face ID. Passkey подписывает challenge = EIP-712-хэш SafeOp. Приложение переводит DER-подпись в (r, s)
   и собирает WebAuthn-подпись в формате Safe (authenticatorData, clientDataFields, r, s).
5. `eth_sendUserOperation` к основному bundler'у. Если отказ, к следующему в списке.
6. Ожидание `eth_getUserOperationReceipt`, затем чтение `getCreatorByWallet(safe)`. Это источник истины,
   так же как сейчас в `registerProfileOnChain`.

`registerCreator` вызывает сам аккаунт (`msg.sender` = Safe), спонсор его не вызывает и не может вызвать.

### Поток В. Выпуск паспорта

Как поток Б без `initCode`:
- `callData` = `executeUserOp(ODP, 0, mintPhysical(m, operationId), CALL)`;
- `operationId` сохраняется до подписи (CA-6.1);
- состояния CA-6.2 дополняются этапом «UserOp в мемпуле bundler'а» (`userOpHash`);
- повтор использует тот же `operationId`. Если у UserOp истёк срок, собирается новая UserOp **с тем же**
  `operationId` (CA-6.3);
- `finalizePassportForPrint` и `revokePassport` отправляются отдельными UserOp по тем же правилам.

### Поток Г. Спонсорство прекратилось (или исчез сервис)

1. Paymaster отказал (политика, баланс, сервис недоступен). Приложение говорит прямо: «Спонсор больше не
   оплачивает газ. Аккаунт, профиль и паспорта ваши и работают».
2. Вариант 1: студент пополняет Safe на POL (адрес или QR). Следующая UserOp идёт без paymaster, газ
   списывается с Safe через EntryPoint prefund.
3. Вариант 2 (bundler'ы недоступны): приложение само становится bundler'ом. Одноразовый secp256k1-ключ
   «плательщика» в Keychain (он **не владелец**, только отправитель транзакции) вызывает
   `EntryPoint.handleOps([op], beneficiary = плательщик)`. Safe возмещает газ плательщику из своего баланса.
   Нужен маленький запас POL на плательщике.
4. Вариант 3 (EntryPoint или 4337-модуль нежелательны): `Safe.execTransaction` с подписью passkey-владельца
   (контрактная подпись по ERC-1271) с того же плательщика. Этот путь не зависит от ERC-4337 вообще.
5. RPC — список из нескольких публичных и пользовательский URL (в `ODPChain` уже есть список endpoint'ов).

### Поток Д. Восстановление

| Сценарий | Что работает | Что должен выбрать студент заранее |
|---|---|---|
| Потерян телефон, есть Apple ID | Passkey синхронизирован в iCloud Keychain: вход на новом устройстве, адрес тот же | Ничего, но нужна двухфакторная защита Apple ID |
| Потерян доступ к Apple ID | Второй владелец Safe (порог остаётся 1): passkey в другой экосистеме (Android/Google, аппаратный FIDO-ключ) **или** Tangem через WalletConnect | Добавить резервного владельца (экран «Резервный доступ») |
| Потеряно всё | Модуль social recovery: guardians (друзья, свои устройства, опционально университет), порог N-of-M, задержка ≥ 7 дней, отмена владельцем | Включить модуль, выбрать guardians и задержку |
| Домен RP недоступен (R1) | Passkey в приложении перестаёт работать. Нужен резервный владелец, не завязанный на домен (Tangem/EOA) | Хотя бы один резервный владелец вне WebAuthn |

Университет как guardian допустим только по выбору студента, только вместе с другими guardians или
с задержкой, в которую студент может отменить. Порог, достижимый одним университетом без задержки, —
красный флаг (§6).

---

## 3. Сравнение вариантов (вопрос 1)

Легенда: ✔ подтверждено по источнику; ~ по памяти или частично, проверить; ✖ не подходит.

| Вариант | Единственный владелец / passkey | Кто обновляет код | Скрытые права фабрики/разработчика | Аудит, открытость | EntryPoint | Polygon | Вывод |
|---|---|---|---|---|---|---|---|
| **Safe 1.4.1 + Safe4337Module 0.3.0 + Passkey 0.2.1** | Порог 1 возможен ✔; passkey через ERC-1271-подписанта ✔ | Только владельцы (транзакция к самому Safe) ~ | Фабрика только создаёт прокси; прав нет ~ | Модули 4337: Ackee (0.1, 0.3), несколько аудиторов (0.2) ✔; passkey: отчёты 0.2.0/0.2.1 ✔; LGPL-3.0 ✔ | v0.7 ✔ (v0.8 для модуля не найден) | 4337-модуль и фабрика passkey на 137 ✔, 4337 на 80002 ✔ | **Рекомендуется** |
| **EIP-7702** (EOA + делегат, например Simple7702Account, Kernel7702) | Корень — secp256k1-ключ EOA; passkey только как дополнительный валидатор | Владелец EOA переделегирует в любой момент | Корневой ключ всегда главнее | Зависит от делегата | v0.8 поддерживает 7702 ✔ | Включён в Bhilai ✔ | ✖ для «без сид-фразы»: ключ EOA и есть сид-фраза |
| **Coinbase Smart Wallet** (v1/v1.1) | Несколько владельцев, адреса и P-256-ключи ✔; каждый действует один ✔ | UUPS, владельцы ✔; `upgradeToAndCall` повторяем между сетями ✔ | Прав у Coinbase в контракте нет ~; у хостингового passkey RP = `keys.coinbase.com` ✔ | MIT ✔; аудиты есть в репо (фирмы по памяти: Cantina, Code4rena) ~ | v0.6 ✔ (устаревший) | Сеть поддерживается кошельком ✔ | Контракт годится как альтернатива со **своим** RP, но v0.6 и кросс-чейн-реплей owner-операций — минусы |
| **Kernel (ZeroDev)** v3.x / v4 | ERC-7579, WebAuthn-валидатор ~ | UUPS, корневой валидатор ✔ (v4: UUPS, Immutable, 7702) | Прав ZeroDev не найдено; зависимость от SDK и модулей | v4 — новая кодовая база, аудиты на странице не указаны ✔ | 4337 + 7702 ✔ | ~ | Сложнее проверить «нет чужих модулей»; для студентов избыточно |
| **Biconomy Nexus** | ERC-7579, K1 и passkey-валидаторы ~ | UUPS ~ | Бутстрап и реестр модулей стоит проверить ~ | CodeHawks, Spearbit, Zenith, Pashov ✔; MIT ✔; уязвимость до коммита `272c408` ✔ | ~ | ~ | Допустимо, но история уязвимостей и модульность усложняют проверку |
| **Alchemy Light Account** | Один ECDSA-владелец ✔ (MultiOwner — несколько) | UUPS владельцем ✔ | Прав Alchemy не найдено ✔ | Аудиты в репо ✔; GPL-3.0/MIT ✔ | ~ | ~ | ✖: без passkey. Modular Account v2 с WebAuthn не проверялся |
| **Модульный ERC-7579 «сам по себе»** | Зависит от валидатора | Зависит | Каждый установленный модуль может исполнять код | — | — | — | Только со строгим белым списком модулей; для ODP 1.0 не нужен |

---

## 4. Passkey на цепочке (вопрос 2)

- **Precompile на Polygon PoS.** P-256 (`0x100`) появился в хардфорке Napoli (март 2024) как RIP-7212 ✔.
  В хардфорке Lisovo (4 марта 2026, блок 83 756 500) стоимость поднята с 3450 до 6900 газа по PIP-80,
  как в EIP-7951 на Ethereum Fusaka ✔.
  Не подтверждено: перешёл ли Polygon полностью на семантику EIP-7951 (проверка входных данных).
  Для корректных подписей это не важно, отрицательные случаи нужно проверить в тесте на Amoy.
- **Стоимость проверки.** Сам precompile стоит 6900 газа. Полная проверка WebAuthn (SHA-256, сборка
  clientDataJSON, ERC-1271-вызов к подписанту) дороже. Точную цифру для Safe я не нашёл: **измерить в
  hardhat-тесте**, строка отчёта «газ на UserOp: деплой+регистрация, выпуск, финализация».
- **Формат iOS.** Используется `AuthenticationServices`: `ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier:)`.
  - Регистрация: `rawAttestationObject` (CBOR), из него COSE-ключ ES256 (x, y).
  - Подпись: `rawAuthenticatorData`, `rawClientDataJSON`, `signature` в DER (ASN.1 SEQUENCE r, s).
  - Приложение разбирает DER в 32-байтные r и s. Требуется ли low-s для Safe-подписанта, проверить в тесте;
    precompile принимает оба.
  - Challenge = хэш SafeOp.
  - Нужны Associated Domains `webcredentials:<RP ID>` и файл `/.well-known/apple-app-site-association` на домене.
- **iCloud Keychain как восстановление.** Passkey синхронизируется между устройствами одного Apple ID со
  сквозным шифрованием. Это закрывает «потерял телефон», но не «потерял Apple ID» и не «Apple ID захвачен».
  Функции passkey-sharing (группы) и экспорт через Credential Exchange позволяют студенту самому раздать
  ключ. С цепочки это не видно. Приложение должно предупреждать, но проверить не может.
- **Зависимость от RP-домена.** Passkey навсегда привязан к RP ID. Если домен ODP перестанет отдавать AASA,
  приложение не сможет подписывать (см. R1). Контракт при этом не зависит от домена: подпись проверяется
  по (x, y), а RP ID входит только в `authenticatorData` (rpIdHash). Проверяет ли Safe-подписант rpIdHash,
  проверить по коду.

---

## 5. Спонсирование газа (вопрос 3)

### Схема paymaster'а

- **Контракт.** Verifying paymaster (v0.7). База — `VerifyingPaymaster` из `eth-infinitism/account-abstraction`
  samples: подпись off-chain-сервиса спонсора, `validUntil`/`validAfter`. Статус аудита сэмпла не подтверждён,
  поэтому или отдельный аудит, или готовый paymaster провайдера (Pimlico/Alchemy/Candide) с хостинговыми политиками.
- **Где проверяется политика.** Off-chain в сервисе подписи (дёшево, гибко) и минимально on-chain (защита
  от ошибки сервиса):
  - `sender` в списке спонсора (адреса из приглашений);
  - `callData` = `Safe4337Module.executeUserOp` или `executeUserOpWithErrorString`;
  - `to` ∈ {ODP-реестр, нужные спутники: `ODPPassportProofRegistry`, `ODPEditionUnits`, …};
  - `value == 0`, `operation == 0` (только CALL; **DELEGATECALL запрещён**);
  - селектор ∈ белый список (`registerCreator`, `mintPhysical`, `mintDigital`, `mintMixed`,
    `finalizePassportForPrint`, `revokePassport`, `openEdition` и т. п.);
  - `initCode` разрешён только с канонической фабрикой и шаблоном initializer'а приложения;
  - лимиты газа на операцию (`callGasLimit`, `verificationGasLimit`, `maxFeePerGas` — потолок);
  - лимиты на студента: N операций и X POL в месяц, общий бюджет приглашения, срок действия.
- **Операции над самим Safe** (добавить резервного владельца, включить recovery) спонсор может оплачивать
  по отдельному флагу политики. Прав ему это не даёт, но это решение спонсора.
- **Пополнение.** Спонсор кладёт POL на депозит paymaster'а в EntryPoint (`depositTo`). Вывести его может
  только владелец paymaster'а (спонсор). У провайдера (Pimlico) модель «провайдер платит, потом счёт»:
  +10% к газу на mainnet, `$1 / 100 000` кредитов сверх 10 млн, лимит счёта по умолчанию $1000/мес.
- **API.** ERC-7677 (`pm_getPaymasterStubData`, `pm_getPaymasterData`, поле `context` для `inviteId`).
  Приложение говорит с любым совместимым paymaster'ом, и спонсор может сменить провайдера без обновления
  приложения (URL в приглашении).

### Что видит спонсор

Адрес Safe, связку «студент ↔ адрес» из своей базы приглашений и все спонсируемые операции, включая
calldata: какие паспорта выпущены, хэши, ID. Для C-профиля это персональные данные. Отказаться от
спонсора — единственный способ скрыть последующие операции. Прошлые операции и так публичны в цепочке
(SPEC §22.15).

### Без paymaster'а: просто пополнять POL

Можно. Спонсор переводит POL на адрес Safe, UserOp платит сама (или `execTransaction` с плательщика).
- Плюсы: нет paymaster'а, нет сервиса, нет зависимости.
- Минусы: деньги становятся деньгами студента и тратятся на что угодно; нельзя ограничить по операциям;
  отозвать нельзя; бухгалтерия «подарка» для университета. Разумно как дополнение (малый «стартовый» баланс
  на случай отказа paymaster'а), а не как основной механизм.

---

## 6. Инфраструктура: bundler и RPC (вопрос 4)

| Bundler | Открытость | EntryPoint | Polygon | Роль в плане |
|---|---|---|---|---|
| Pimlico (хостинг) / **Alto** (self-host) | Alto GPL-3.0 ✔ | Настраивается; версии в README не перечислены ✔ | Pimlico: Polygon mainnet ✔ | Основной провайдер на старте |
| Alchemy (хостинг) / **Rundler** | LGPL-3.0 / GPL-3.0 ✔ | v0.6, v0.7 ✔ | Протестирован на Polygon PoS ✔ | Второй провайдер |
| Etherspot **Skandha** | MIT ✔ | v0.6, v0.7, v0.8 ✔ | ~ | Кандидат для self-host |
| Candide **Voltaire** | Открытый ✔ (лицензию уточнить) | ~ | ~ | Кандидат для self-host |
| Stackup | — | — | — | Статус bundler-сервиса не подтверждён; не закладывать |

- **Заменяемость.** В приложении хранится список bundler URL (по умолчанию 2 провайдера + пользовательский).
  EntryPoint один (v0.7), поэтому UserOp переносима между bundler'ами.
- **Self-host.** Alto или Rundler плюс RPC Polygon с `debug_traceCall`, нужный для полной проверки правил
  ERC-7562. Без него bundler работает только в «unsafe»-режиме, для приватного bundler'а спонсора это приемлемо.
- **Стоимость.** Хостинг: кредиты плюс наценка на газ (Pimlico +10%). Self-host: сервер и платный RPC-узел.
  Газ ODP-операций на Polygon измерить в тесте и умножить на цену газа. Цифры POL/USD в план не закладываю.
- **Bundler'ы исчезли.** Поток Г, варианты 3 и 4: `handleOps` напрямую или `execTransaction`.
  Safe это позволяет, и это главное преимущество Safe перед аккаунтами, которые принимают вызовы только от EntryPoint.

---

## 7. Поэтапный план работ

Оценки в рабочих днях одного инженера, знакомого с кодом.

### Этап 0. Решения (1–2 дня)
1. Утвердить стек (§0) и RP-домен для passkey (R1).
2. Утвердить формулировку правила C (§9, CA-18.4).
3. Выбрать: hosted paymaster или свой контракт.

### Этап 1. Локальный hardhat-тест по образцу `ODP07Safe.test.js` (5–7 дней)

Файл `chain/deploy/test/ODP07SmartAccount.test.js`. Фикстуры в `fixtures/` в формате `safe-1.4.1.json`
(источник, npm integrity, sha256 тарбола), без npm-зависимостей:
- `entrypoint-0.7.json`: EntryPoint v0.7 и, если нужен, `VerifyingPaymaster` из того же релиза;
- `safe-4337-0.3.0.json`: `Safe4337Module`, `SafeModuleSetup`;
- `safe-passkey-0.2.1.json`: `SafeWebAuthnSharedSigner`, `SafeWebAuthnSignerFactory`, singleton;
- Safe 1.4.1 уже есть (добавить `SafeL2`, если его нет в фикстуре).

P-256 в hardhat: Hardhat 3 с хардфорком `osaka` должен поддерживать precompile `0x100` (по документации
Hardhat, проверить на установленной версии). Если нет, для теста подойдёт байткод Daimo p256-verifier,
положенный по адресу `0x100` через `hardhat_setCode`, но только в тесте.

Эмуляция passkey: `node:crypto` генерирует P-256, тест собирает `authenticatorData` + `clientDataJSON`
(`type=webauthn.get`, challenge = base64url(хэш SafeOp)) и DER-подпись, как это делает iOS.

Сценарии:
1. Деплой Safe + `registerCreator("C")` одной UserOp через paymaster. Профиль на адресе Safe, у passkey-ключа
   профиля нет.
2. Выпуск, финализация и отзыв через UserOp. Повтор с тем же `operationId` даёт `AlreadyCommitted`.
3. Paymaster отклоняет: `DELEGATECALL`, чужой `to`, чужой селектор, `addOwnerWithThreshold` (без флага),
   превышение лимита, истёкший `validUntil`.
4. Спонсор (ключ paymaster'а + деплойер фабрики) не может: подписать UserOp, вызвать `execTransaction`,
   добавить владельца, включить модуль, сменить singleton, forwarding'ом зарегистрировать профиль за Safe.
5. После обнуления депозита paymaster'а: UserOp без paymaster'а с балансом Safe; `handleOps` с произвольного
   EOA; `execTransaction` с passkey-подписью. Все три проходят.
6. Резервный владелец (EOA) добавлен passkey'ем. EOA один может выпускать (порог 1). Passkey удалён,
   профиль тот же.
7. Модуль social recovery (Candide, из Safe Recovery v0.1.0): восстановление с задержкой, отмена
   владельцем, попытка «guardian-университет в одиночку» не проходит без задержки.
8. Негатив: неправильная подпись, чужой rpIdHash, high-s, `verifiers` с подменённым fallback-верификатором
   (показывает, почему это красный флаг).
9. Газ-отчёт по каждой операции (вход для бюджета спонсора).
10. Проверка «инспектора аккаунта» (§8) на чистом и на «заражённом» Safe (лишний модуль, guard, `ApproveHash`).

### Этап 2. Тестнет Amoy (4–6 дней, после появления исполнимого деплоя ODP)
1. Подтвердить `eth_getCode` на 80002 для EntryPoint v0.7, `Safe4337Module` (подтверждён), passkey-фабрики и
   shared signer (не подтверждены), Safe 1.4.1, фабрики.
2. Развернуть тестовый ODP 0.7 на Amoy. Зависимость: по заметкам проекта deployment-скрипты сейчас неисполнимы.
3. Прогнать сценарии 1–7 против Pimlico и Alchemy, затем против своего Alto.
4. Проверить precompile `0x100` на отрицательных входах (семантика 7212 или 7951).
5. Измерить задержку и стоимость; убедиться, что UserOp с `initCode` укладывается в лимит газа
   транзакции 16 777 216 (EIP-7825, Madhugiri).

### Этап 3. Интеграция в apple-app и swift-core (12–18 дней)

swift-core (`Sources/ODPCore/`):
- `SmartAccount/UserOperation.swift`: PackedUserOperation v0.7, `userOpHash`, JSON для RPC.
- `SmartAccount/SafeAccount.swift`: initializer, CREATE2-адрес, `executeUserOp` calldata, EIP-712 SafeOp
  (домен = Safe4337Module), ABI `execTransaction` для запасного пути.
- `SmartAccount/WebAuthnSignature.swift`: DER → (r, s), кодирование подписи для Safe-подписанта,
  разбор COSE-ключа.
- `SmartAccount/BundlerRPC.swift`: `eth_sendUserOperation`, `eth_estimateUserOperationGas`,
  `eth_getUserOperationReceipt`, `eth_supportedEntryPoints`; список endpoint'ов с перебором, как в `PolygonRPC`.
- `SmartAccount/PaymasterClient.swift`: ERC-7677.
- `SmartAccount/AccountInspector.swift`: чтения и вердикт из §8, чистые функции плюс тесты на векторах из этапа 1.
- `Chain/ODPChain.swift`: адреса EntryPoint, модулей, фабрик как проверяемые константы (сверка с `eth_getCode`).

apple-app:
- `Backend/Shared/Wallet/Passkey/PasskeyService.swift`: создание и подпись (`ASAuthorizationController`),
  iOS и macOS.
- `Backend/Shared/Chain/SmartAccountSender.swift`: `TransactionSender`, внутри UserOp, paymaster → bundler →
  запасные пути. Возвращает tx hash.
- `AppModel+Registration.swift`, `AppModel.swift`, `Workspace*View`: выбирать отправителя по типу аккаунта
  вместо жёсткого `WalletConnectSender()`.
- `Config/iOS/ODP.entitlements`, `ODPMac.entitlements`: `com.apple.developer.associated-domains` =
  `webcredentials:<RP ID>`; AASA на домене.
- `CreatorRegistryPolicy`: добавить проверку «сделка идёт в утверждённый EntryPoint/модуль» по аналогии
  с `validateDestination`.

Экраны:
1. «Приглашение» (сканер QR уже есть): спонсор, что он платит, что видит, чего не может.
2. «Создание аккаунта»: Face ID, адрес, «ключ хранится в iCloud Keychain, ODP и спонсор его не получают».
3. «Контроль аккаунта» (инспектор §8): зелёный или красный вердикт, список владельцев, модулей и т. д.
4. «Резервный доступ»: второй passkey, Tangem (WalletConnect), social recovery с задержкой, выбор guardians.
5. «Газ»: кто платит сейчас, остаток лимита, баланс Safe, «пополнить», «отказаться от спонсора».
6. Подтверждение операции (CA-5.3/5.4): плюс paymaster, bundler, `userOpHash`.
7. Состояния CA-6.2: «в мемпуле bundler'а», «UserOp истекла», «спонсор отказал».

Тесты: unit по векторам hardhat (одинаковые хэши и подписи Swift ↔ JS), UI-тест потока Б на Amoy.

### Этап 4. Консоль спонсора (8–12 дней)

Отдельный веб-инструмент (или CLI плюс простая страница) с минимальным бэкендом:
1. Приглашения: создание пачками, QR и коды, срок, лимиты; экспорт CSV без паспортных данных.
2. Paymaster-сервис: ERC-7677 endpoint, политика из §5, подпись ключом спонсора (HSM/KMS или Safe-мультиподпись
   спонсора для управления депозитом).
3. Бюджет: депозит в EntryPoint, пополнение, отчёт расхода на студента и месяц.
4. Отзыв: снять адрес с политики. Без доступа к аккаунту, так что «заблокировать студента» нельзя по построению.
5. Журнал и приватность: хранить минимум, срок хранения, выгрузка по запросу студента.

Опционально вместо своего сервиса — политики Pimlico или Alchemy. Консоль тогда только генерирует
приглашения и передаёт `policyId` в `context`.

### Этап 5. Правки SPEC (2–3 дня)
Черновик в §9. Плюс ссылка на новый тест в CA-5.6 и обновление CA-5.7 (правило C).

**Итого:** 32–48 рабочих дней без внешнего аудита paymaster'а и консоли (закладывать отдельно) и без ожидания
деплоя ODP 0.7.

---

## 8. Что приложение обязано проверить до надписи «аккаунт под вашим единоличным контролем»

Читать минимум из двух независимых RPC и сравнивать; при расхождении — «не удалось проверить».

1. **Сеть и код.** `chainId == 137`; `eth_getCode(account)` совпадает с runtime-кодом канонического
   `SafeProxy` 1.4.1 (keccak); singleton (слот 0) — канонический Safe/SafeL2 1.4.1 (адреса сверить с
   safe-deployments); `VERSION() == "1.4.1"`.
2. **Владельцы и порог.** `getOwners()`: каждый владелец — известный студенту подписант. Passkey: shared
   signer с конфигурацией (x, y) = ключ этого устройства или iCloud, либо signer proxy из канонической
   фабрики с тем же (x, y). EOA: адрес, владение которым студент доказал подписью в этой сессии (Tangem).
   `getThreshold()` = 1 для C, неизвестных владельцев 0.
3. **Верификатор passkey.** Поле `verifiers` у каждого WebAuthn-подписанта указывает **только** на
   precompile `0x100` (fallback-верификатор равен нулю). Иной верификатор — красный флаг: он может
   принимать любую подпись.
4. **Модули.** `getModulesPaginated(SENTINEL, 10)` = ровно {`Safe4337Module` 0x75cf…c226} плюс, если студент
   сам включил, модуль recovery с показанными параметрами. Любой другой модуль — красный флаг.
5. **Guard и fallback.** Слот `guard_manager.guard.address` = 0 (или guard, который студент поставил сам);
   слот `fallback_manager.handler.address` = `Safe4337Module`.
6. **История.** События с блока деплоя: `SafeSetup` (initializer совпадает с шаблоном приложения; адрес
   пересчитывается по CREATE2 из этого шаблона), `AddedOwner`/`RemovedOwner`/`ChangedThreshold`/
   `EnabledModule`/`DisabledModule`/`ChangedGuard`/`ChangedFallbackHandler`/`ChangedMasterCopy`,
   `ApproveHash` (заранее одобренные хэши — красный флаг), `ExecutionFromModuleSuccess` только от
   разрешённых модулей. `nonce()` Safe и `EntryPoint.getNonce` согласуются с известной историей.
7. **Recovery.** Если модуль есть: guardians, порог, задержка ≥ минимума (например, 7 дней), активных
   запросов нет. Красный флаг: порог достижим одним спонсором или одной организацией без задержки,
   или есть незавершённый запрос восстановления.
8. **Спонсор.** Отдельно и честно: «Спонсор X оплачивает газ до даты Y и видит ваши операции. Прав на
   аккаунт у него нет». Это информация, не условие зелёного статуса.
9. **Профиль.** `getCreatorByWallet(account)` возвращает C с этим адресом; CA-1.1 показан.
10. **Устройство.** Предупреждение (не проверка): passkey можно поделить или экспортировать средствами Apple.
    Если студент это сделал, контроль разделён, и цепочка этого не покажет.

Любой красный флаг блокирует зелёный статус и выпуск (для C), показывает конкретную причину и
предлагает исправление транзакцией студента (удалить модуль или владельца), а не «игнорировать».

---

## 9. Черновик текста для SPEC (§22.18, английский как в SPEC)

> ### 22.18 Smart accounts and gas sponsors (A13)
>
> The registry sees only `msg.sender`. A smart account registered as a profile is the issuer; its owners,
> modules, bundlers and paymasters are not. These rules bind clients that create, operate or show such accounts.
>
> - CA-18.1. A client MUST NOT describe a sponsor, bundler, paymaster or the ODP project as able to act for
>   the profile. A sponsor MUST be described as "pays network fees; can stop paying; cannot sign, change
>   owners, upgrade the account or move the profile".
> - CA-18.2. A client that creates a smart account MUST build the owner set, threshold, modules, guard,
>   fallback handler and initializer itself from the user's own credentials, and MUST NOT accept any of
>   them from a sponsor or an invitation.
> - CA-18.3. Before showing an account as under the user's sole control, a client MUST read and verify at
>   least: proxy code and implementation, owners, threshold, enabled modules, guard, fallback handler,
>   signature verifiers of passkey owners, pre-approved hashes and pending recovery requests. Any unknown
>   element MUST be shown as a blocking warning.
> - CA-18.4. A C profile MUST be controlled by one natural person. A C profile MAY be registered to a
>   smart account whose threshold is 1 and whose every owner is a credential of that person (for example,
>   a passkey and a backup key). A C profile MUST NOT be registered to an account with threshold above 1,
>   with an owner, module or guard controlled by anyone else, or with a recovery method a third party can
>   complete alone without a delay the user can cancel. (Replaces the last three sentences of CA-5.7.)
> - CA-18.5. Recovery methods MUST be chosen by the user. A client MUST show that recovery changes the
>   account's owners, not the profile, and that ODP still cannot recover the profile (CA-1.1).
> - CA-18.6. When sponsorship stops, a client MUST let the user continue with self-paid fees without
>   re-registration, and MUST offer at least one submission path that does not depend on the sponsor's
>   bundler or paymaster.
> - CA-18.7. A client MUST decode the whole user operation (account call, target, selector, arguments,
>   call type, paymaster, entry point, chain) under CA-5.3. A delegate call MUST block submission.
> - CA-18.8. A pending user operation MUST be shown as pending under CA-5.6 and CA-6.2. A replacement
>   MUST reuse the same `operationId`.
> - CA-18.9. A client MUST state before sponsorship begins what the sponsor can see (account address and
>   every sponsored call) and that on-chain records are permanent (§22.15).

---

## 10. Риски и открытые вопросы

| # | Риск | Мера |
|---|---|---|
| R1 | **Зависимость passkey от RP-домена.** Если домен ODP пропал или AASA сломан, подписать в приложении нельзя | Домен под долгосрочным контролем проекта (не личный); резервный владелец вне WebAuthn (Tangem/EOA) настоятельно рекомендуется; путь «добавить резервного владельца» — сразу после регистрации |
| R2 | Apple ID потерян или захвачен | Резервный владелец и recovery с задержкой; напоминание о двухфакторной защите |
| R3 | Студент сам делится passkey или экспортирует его | Предупреждение; цепочкой не проверяется |
| R4 | Safe4337Module поддерживает только EntryPoint v0.7; переход на v0.8/0.9 потребует нового модуля | Модуль меняется транзакцией владельца; проверить в Safe roadmap |
| R5 | Семантика precompile на Polygon (7212 или 7951) для граничных входов | Тест на Amoy (этап 2) |
| R6 | Паймастер-сэмпл не аудирован, политика с ошибкой = слив депозита | Аудит или hosted paymaster; on-chain минимум проверок; потолки |
| R7 | Приватность: спонсор связывает студента с адресом и видит все операции | Минимизация хранения, договор, возможность выйти |
| R8 | Цензура bundler'ом или спонсором | Несколько bundler'ов, `handleOps`/`execTransaction` напрямую |
| R9 | SPEC CA-5.7 сейчас запрещает C на Safe | Правка CA-18.4 до релиза |
| R10 | Деплоя ODP 0.7 нет, deployment-скрипты по заметкам неисполнимы | Блокер этапов 2+ на mainnet |
| R11 | `ecrecover` в `ODPAuthorAttestation` и `ODPEditionUnits`: смарт-аккаунт не может быть подписантом автора или юнита | Назвать в UI; для этой задачи не нужно |
| R12 | Квоты C на кошелёк и «фермы» аккаунтов у спонсора | Квота не Sybil-защита (SPEC §3); лимиты paymaster'а |
| R13 | Контрактный кошелёк в WalletConnect-потоке: старый код считает любой адрес EOA | Разделение отправителей; инспектор перед C |

**Открытые вопросы**

1. Какой домен станет RP ID и кто гарантирует его жизнь (организация, срок)?
2. Резервный владелец обязателен для C или только настоятельно рекомендован?
3. Нужен ли свой paymaster-контракт с on-chain белым списком, или достаточно hosted-политик?
4. Минимальная задержка social recovery и можно ли университету быть одним из guardians по умолчанию (предложение: нет, только если студент добавил сам)?
5. Кто юридически оператор данных приглашений (университет) и каков срок хранения?
6. Поддерживать ли Coinbase Smart Wallet или Kernel как «внешние» смарт-аккаунты через WalletConnect (инспектор под них отдельный)?

### Юридически и организационно (вопрос 7)

- Раздача: QR или код приглашения (подписанный спонсором JSON: `inviteId`, спонсор, срок, лимит,
  URL paymaster'а). Никаких ключей, паролей и заранее созданных адресов.
- Студент сам: создаёт passkey, подтверждает экран «спонсор не имеет прав», подписывает первую UserOp с
  `registerCreator("C")`, выбирает восстановление.
- Соглашение спонсора со студентом: спонсор оплачивает газ и может прекратить; не хранит ключей; не
  вправе требовать доступ; обработка данных (адрес ↔ личность) по закону о персональных данных;
  студент может отказаться от спонсора в любой момент без потери профиля.
- Для университета: оплата газа — расход на сервис, а не передача средств студенту (в отличие от
  пополнения POL). Бухгалтерию проверить юристу.

---

## 11. Источники (дата обращения для всех: 2026-09-24)

Локальные файлы (прочитаны):
- `specifications/SPEC.md` §3, §22.1, §22.5, §22.15
- `specifications/chain/contracts/ObjectDigitalPassport.sol`, `ODPAuthorAttestation.sol`, `ODPEditionUnits.sol`
- `specifications/chain/deploy/test/ODP07Safe.test.js`, `fixtures/safe-1.4.1.json`, `chain/hardhat.config.ts`, `chain/package.json`
- `apple-app/Project.json`, `Backend/Shared/Chain/TransactionSender.swift`, `CreatorRegistryPolicy.swift`,
  `Wallet/WalletConnect/WalletConnectService.swift`, `Wallet/WalletVault.swift`, `AppState/AppModel+Registration.swift`
- `swift-core/Package.swift`, `Sources/ODPCore/Chain/TransactionSender.swift`, `ODPChain.swift`, `PolygonRPC.swift`

Веб:
- Polygon, Bhilai (EIP-7702 на PoS): https://polygon.technology/blog/first-milestone-to-gigagas-1000-tps-with-bhilai-hardfork
- Stakin, Bhilai/Heimdall: https://stakin.com/blog/understanding-polygons-bhilai-and-heimdall-upgrades-finality-1000-tps-and-gasless-ux
- Polygon, Napoli и RIP-7212: https://polygon.technology/blog/polygon-pos-is-cooking-the-napoli-upgrade-means-better-ux-the-mumbai-testnet-takes-a-bow ; https://x.com/0xPolygon/status/1770512885657080137
- PIP-80 (газ P256 3450→6900): https://forum.polygon.technology/t/pip-80-p256-precompile-gas-cost-adjustment/21712
- PIP-81 Lisovo (PIP-80 включён, блок 83 756 500): https://forum.polygon.technology/t/pip-81-lisovo-hardfork/21713
- Lisovo активирован 4.03.2026: https://www.cryptowisser.com/news/polygons-lisovo-upgrade-goes-live ; https://forum.polygon.technology/t/bor-v2-6-0-and-erigon-v3-4-0-for-mainnet-and-amoy/21757
- PIP-76 Madhugiri (EIP-7825 и др., без P256): https://forum.polygon.technology/t/pip-76-madhugiri-hardfork/21377
- Релизы Bor (Austin, v2.10.x; содержимое Austin не выяснено): https://github.com/0xPolygon/bor/releases
- EIP-7951: https://eips.ethereum.org/EIPS/eip-7951
- EntryPoint релизы и адреса: https://github.com/eth-infinitism/account-abstraction/releases
- Safe 4337 module: https://github.com/safe-global/safe-modules/tree/main/modules/4337 ; CHANGELOG: https://raw.githubusercontent.com/safe-global/safe-modules/main/modules/4337/CHANGELOG.md
- Safe passkey module: https://github.com/safe-global/safe-modules/tree/main/modules/passkey ; CHANGELOG: https://raw.githubusercontent.com/safe-global/safe-modules/main/modules/passkey/CHANGELOG.md
- Релизы safe-modules (Safe Recovery v0.1.0 с модулем Candide): https://github.com/safe-global/safe-modules/releases
- Адреса на Polygon: https://raw.githubusercontent.com/safe-global/safe-modules-deployments/main/src/assets/safe-4337-module/v0.3.0/safe-4337-module.json ; https://raw.githubusercontent.com/safe-global/safe-modules-deployments/main/src/assets/safe-passkey-module/v0.2.1/safe-webauthn-signer-factory.json
- Safe smart account релизы: https://github.com/safe-fndn/safe-smart-account/releases
- Safe + permissionless quickstart: https://docs.safe.global/advanced/erc-4337/guides/permissionless-quickstart
- Candide social recovery: https://docs.candide.dev/wallet/plugins/recovery-with-guardians/
- Coinbase Smart Wallet: https://github.com/coinbase/smart-wallet ; RP keys.coinbase.com: https://hackmd.io/@thisisjoules/H1qQnRC_R ; Polygon: https://github.com/jarrodwatts/polygon-coinbase-smart-wallet
- Kernel: https://github.com/zerodevapp/kernel
- Biconomy Nexus: https://github.com/bcnmy/nexus
- Alchemy Light Account: https://github.com/alchemyplatform/light-account
- Alto: https://github.com/pimlicolabs/alto ; Rundler: https://github.com/alchemyplatform/rundler ; Skandha: https://github.com/etherspot/skandha ; Voltaire: https://docs.candide.dev/blog/erc4337-bundler/
- Stackup (статус bundler'а не подтверждён): https://www.stackup.fi/resources/stackup-community-update-january-2025
- Pimlico политики и цены: https://docs.pimlico.io/guides/how-to/sponsorship-policies ; https://www.pimlico.io/pricing
- ERC-7677: https://eips.ethereum.org/EIPS/eip-7677
- RP ID и нативные приложения: https://www.corbado.com/blog/webauthn-relying-party-id-rpid-passkeys ; риск passkey-only: https://blog.getpara.com/passkey-wallets/
- Hardhat 3 конфигурация (osaka, P256): https://hardhat.org/docs/reference/configuration ; issue: https://github.com/NomicFoundation/hardhat/issues/7872
- Apple, Supporting passkeys (страница рендерится JS, текст не получен; факты об API — из общих знаний, сверить): https://developer.apple.com/documentation/authenticationservices/supporting-passkeys

**Не удалось подтвердить:**
- содержимое хардфорка Austin (август 2026);
- полная семантика EIP-7951 на Polygon;
- развёрнуты ли `SafeWebAuthnSharedSigner` на 137 и фабрика passkey на 80002;
- адреса singleton Safe 1.4.1 (взяты по памяти, сверить);
- поддержка EntryPoint v0.8 у Safe4337Module;
- аудиторы Coinbase Smart Wallet и Kernel v4;
- WebAuthn-валидатор у Nexus и Alchemy Modular Account v2;
- статус Stackup;
- газ полной WebAuthn-проверки в Safe;
- аудит `VerifyingPaymaster`-сэмпла;
- проверяет ли Safe-подписант rpIdHash и low-s.
