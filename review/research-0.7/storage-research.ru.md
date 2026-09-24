# ODP 0.7: где хранить фото и файлы паспорта и как их подтверждать

Исследование, 24 сентября 2026 года. Репозиторий `specifications` (ветка `audit/odp-07-review-and-redesign`) только читался, в нём ничего не менялось. Цены и статусы сервисов проверены по страницам на дату обращения. Что проверить не удалось, помечено словами «не проверено».

---

## 0. Короткий вывод

**Рекомендуемая схема для 0.7: «адрес — это хеш».** Ни один сервер не нужен, чтобы найти и проверить опубликованный паспорт, потому что каждый его файл можно адресовать по SHA-256, который уже записан в цепочке или в `passport.json`.

1. **Главное фото, которое идёт в `imageHash`, приложение делает публичной копией размером не больше 1 МиБ** (JPEG, длинная сторона около 2048 px, EXIF/GPS удалены). Полноразмерный снимок с телефона остаётся в архиве как дополнительный якорь `photo`. Файл до 1 МиБ помещается в один IPFS-блок, поэтому его CID вычисляется из `imageHash` без единой записи где-либо: `CIDv1 = 0x01 · 0x55 (raw) · 0x12 0x20 (sha2-256, 32 байта) · digest` → `bafkrei…`. Такой же CID выдаёт `ipfs add` по профилю IPIP-499 `unixfs-v1-2025` (фрагменты по 1 МиБ, raw leaves).
2. **Канонический `passport.json` тоже адресуется своим `dataHash`**: по CA-13.2 он не больше 1 МиБ, значит, тоже умещается в один raw-блок. Любой читатель, у которого есть только номер паспорта, получает из цепочки `dataHash`, вычисляет CID, скачивает JSON с любого узла или шлюза и проверяет хеш. Затем так же находит фото и остальные файлы по хешам якорей.
3. **Архив `.odpass` публиковать по URL не обязательно.** Его можно собрать заново: `passport.json` и `files/` находятся по хешам, `generation.json` зашит в клиент (§22.12), `receipt.json` восстанавливается из события минта. Сам `.odpass` остаётся форматом для хранения у владельца и для передачи вещи.
4. **Хранение в три слоя, каждый заменяем:**
   - **(а) главный:** архив у владельца (телефон, резервная копия iCloud/Google Drive, AirDrop или файл при передаче);
   - **(б) публичный:** IPFS raw-блоки, которые закрепляет (pin) кто угодно: эмитент, платный пиннинг-сервис или независимый «архивист», собирающий все опубликованные паспорта по событиям цепочки;
   - **(в) необязательный вечный:** Arweave, разово около 0,06 $ за 1 МиБ.
5. **`ODPHosting.imageUrl`/`dataUrl`** остаются подсказками. В них можно записать несколько адресов через пробел (`ipfs://… ar://… https://…`, в 512 байт помещается 3–5 штук). Клиент всегда сверяет скачанные байты с хешем из цепочки (CA-14.4), поэтому подсказки можно менять и выбрасывать без вреда для проверки.
6. **Фото не подтверждает объект.** Обещать можно только одно: эти байты не менялись с момента минта, а сам минт произошёл не позже времени блока. C2PA (Pixel 10) и Apple Reference Image (iPhone 18 Pro) показываются отдельной строкой «снимок подписан камерой X», если клиент умеет это проверить. Пометки «фото этого объекта» за ними нет.
7. **Приватность по умолчанию:** в цепочку попадают только хеши, в архив все оригиналы. Навсегда публикуется только то, что пользователь явно отметил, и только очищенная уменьшенная копия.

**Нужна ли смена контракта: нет.** Всё перечисленное работает на утверждённом бандле ABI7 без изменений: `imageHash`, `dataHash` и хеши якорей уже есть, строка `ODPHosting` вмещает несколько адресов. **Нужны изменения только в SPEC и клиенте:** новый раздел CA-18 (черновик в §4), ограничение размера главного фото, соглашение о списке адресов в `imageUrl`/`dataUrl`, правило «восстановимого бандла». JSON-схемы менять не обязательно. Одну вещь стоит решить до выпуска: разрешать ли `imageHash` указывать на уменьшенную копию, а не на исходный файл камеры. Сейчас §9 говорит об «original bytes», и это можно толковать по-разному (см. риски, п. R-1).

---

## 1. Что уже есть в ODP 0.7 (по репозиторию)

- §8: в цепочке неизменяемо записаны `dataHash`, `imageHash`, `fileHash`, `anchorsHash`. Физическому объекту нужен ненулевой `imageHash`. URL-поля в ядре нет.
- §9: хеши фото и файлов относятся к байтам, а не к URL. Все дополнительные фото хранятся в `anchors[]` с полем `hash: "sha256:<hex>"` (схема `passport-0.7.schema.json`).
- §10: `dataHash = SHA256(canonical(passport.json))`, `passportId: null`. Канонические байты однозначны, их можно хранить и адресовать как есть.
- §13 Hosting и `chain/contracts/ODPHosting.sol`: `dataUrl` и `imageUrl` до 512 байт каждый, меняют их эмитент или его неистёкший делегат, есть событие `LocationsUpdated`. Контракт не разбирает содержимое строки. SPEC требует считать URL недоверенным транспортом.
- §15 и `schema/bundle-0.7/`: `.odpass` — это ZIP, внутри `files/<sha256hex>`. Там же сказано: «Storage providers and distribution policy remain undecided».
- §19 и §11: «Hosting unavailability must not invalidate a locally held bundle».
- §22.13–§22.15: ограничения импорта (JSON ≤ 1 МиБ, запись ≤ 256 МиБ), загрузка без cookies и сверка хеша (CA-14.4), удаление EXIF/GPS до хеширования (CA-15.2), нельзя писать «удалено» без уточнения (CA-15.4).
- §22.17 R2: ODP как компания может исчезнуть. Сторонний разработчик должен суметь построить проверку сам (CA-17.2).
- В старой редакции (`docs/ru/CHANGELOG.md`) был §16.1 «долговечный хостинг для `dataUrl`» с тремя свойствами: адресация по содержимому, независимость от одного оператора, доступность по HTTPS без аккаунта. В SPEC 0.7 этого раздела нет. Предложение ниже по сути восстанавливает его в проверяемой форме.

---

## 2. Ответы на вопросы

### 2.1 Адресация по содержимому

**IPFS, CID из готового SHA-256: да, для одного блока.** CIDv1 с кодеком `raw` (0x55) и мультихешем `sha2-256` (0x12, длина 0x20) содержит SHA-256 байтов блока без изменений. Для файла, который лежит в одном raw-блоке, CID однозначно получается из `imageHash`. Пример: SHA-256 строки `hello world` `b94d27b9…cde9` → `bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e`. Код на 10 строк, внешние сервисы не нужны.

**Пределы размера блока:**
- Спецификация Bitswap: реализации MUST поддерживать блоки ≤ 2 МиБ, сообщения ≤ 4 МиБ, блоки больше 2 МиБ не рекомендуются.
- Kubo v0.40 поднял лимит `block put`/`dag put`/`dag import` с 1 до 2 МиБ без флага `--allow-big-block`. Максимальный размер фрагмента в `ipfs add`: 2 МиБ − 256 байт.
- IPIP-0499 (опубликован 5 марта 2026) ввёл детерминированные профили UnixFS. `unixfs-v1-2025` использует CIDv1, sha2-256, фрагменты по 1 МиБ, raw leaves и 1024 ссылки на узел. Для файла ≤ 1 МиБ результатом будет один raw-лист, то есть тот же `bafkrei…`, что вычисляется из SHA-256. *Эта эквивалентность выведена из текста профиля. Перед фиксацией в SPEC её нужно подтвердить тестом на Kubo и Helia.*
- **Практический вывод:** порог 1 МиБ совпадает во всех инструментах. Диапазон 1–2 МиБ передаётся по bitswap, но `ipfs add` с профилем по умолчанию разобьёт такой файл, и CID уже не совпадёт с «хешевым». Поэтому ограничение главного фото стоит ставить на 1 МиБ, а не на 2.

**Большие файлы (фото с телефона 2–10 МБ, цифровые оригиналы):** их разбивают на фрагменты и собирают в UnixFS DAG. CID корня зависит от размера фрагмента, раскладки DAG и кодека, поэтому из SHA-256 всего файла его не получить, а по CID корня нельзя узнать SHA-256 файла. Связать их можно только внешней записью «SHA-256 файла → CID», например в `imageUrl` или в поле `data` якоря до минта. После загрузки проверку всё равно даёт пересчёт SHA-256 (CA-14.4). IPIP-0499 делает CID воспроизводимым: кто угодно может заново добавить тот же файл с профилем `unixfs-v1-2025` и получить тот же CID. Это полезно для зеркал.

**Что нового в 2025–2026:**
- IPIP-0499 (профили CID, март 2026) и 2 МиБ в Kubo v0.40, см. выше.
- IPIP о raw-блоках больше 2 МиБ не найден. На форуме IPFS обсуждают «блоки больше 1 МиБ» и «large IPLD blocks», но стандарта нет. *Не проверено исчерпывающе.*
- Поиска «IPFS по SHA-256 целого файла» в стандарте нет. Документация IPFS прямо объясняет, что CID не равен контрольной сумме файла.
- BLAKE3 в мультихешах есть, но для ODP бесполезен: в цепочке SHA-256.
- **Важное изменение:** Protocol Labs **выключила публичные шлюзы `ipfs.io` и `dweb.link` 21 сентября 2026 года**. Они отвечают 429 с заголовком `Sunset`, браузерный трафик переводится на service-worker шлюз `inbrowser.link`. Приложениям рекомендуют `@helia/verified-fetch` или собственный узел (Rainbow, Someguy, Kubo). Для ODP это доказывает, что нельзя зашивать в клиент один шлюз. Клиент должен уметь получать данные сам (verified-fetch или встроенный Helia) и перебирать список шлюзов. `trustless-gateway.link` ещё указан в документации, но его статус после 21 сентября *не проверен*.

**BitTorrent v2 (BEP 52):** корень `pieces root` — это Merkle-дерево SHA-256 по блокам 16 КиБ. Он совпадает с SHA-256 файла только для файлов ≤ 16 КиБ. Для фото связи нет, нужна отдельная запись. Для ODP BitTorrent подходит как механизм зеркалирования больших наборов (архивист раздаёт торрент «все паспорта за месяц»), но не как адрес по `imageHash`.

**Iroh (iroh-blobs):** адрес блоба — BLAKE3 от байтов с потоковой проверкой через bao. Это другой хеш, из SHA-256 его не получить. Документация 0.103 (сентябрь 2026) называет эту версию «not yet production quality» и советует 0.35. Годится как транспорт между телефонами (передача архива напрямую), но не как адрес.

**Swarm:** фрагменты по 4 КБ, BMT на keccak256. Адрес из SHA-256 не выводится.

**Итог по адресации:** только IPFS raw CID сохраняет прямую связь «хеш в цепочке → адрес» и только до 1 МиБ. Поэтому в рекомендации главное фото и JSON ограничены 1 МиБ.

### 2.2 Долговечность хранения и цены

Цена паспорта считается как сумма байтов, которые публикуются навсегда: `passport.json` (обычно 2–20 КБ) плюс опубликованные фото.

| Вариант | Модель оплаты | ≈1 МиБ | ≈5 МиБ | Переживёт ли исчезновение ODP |
|---|---|---|---|---|
| **Arweave, напрямую** | разово, в AR | **0,01306 AR ≈ 0,057 $** | **0,06515 AR ≈ 0,28 $** | Да, если выживет сеть Arweave. Платит загрузивший, дальше платить не нужно. |
| Arweave через Turbo (карта) | разово, кредиты +35% за пополнение (кроме ARIO) | ≈ 0,076 $ | ≈ 0,38 $ | Да, данные в Arweave. Turbo нужен только для загрузки. Бесплатно до 105 КиБ, 10 МиБ на кошелёк за всё время. |
| Pinata | подписка | Free: 1 ГБ; Picnic 20 $/мес за 1 ТБ; сверх лимита 0,035–0,07 $/ГБ | то же | Нет. Пока платит эмитент. После отключения данные живут, только если их закрепил кто-то ещё. |
| Filebase | подписка | Free: 5 ГБ и 500 закреплённых файлов; Pro 7,50 $/мес за 500 ГБ; сверх лимита 0,015 $/ГБ·мес (≈0,0002 $/год за МиБ) | ≈0,0009 $/год | Нет, та же логика. |
| Storacha / web3.storage | — | — | — | **Не использовать.** `storacha.network` сейчас отвечает 301 на `fil.one`. `w3s.link` и `storacha.link` перенаправляли на выключенные шлюзы PL. Статус-страница при этом показывает «All Systems Operational», в репозитории `upload-service` уведомления нет. Сведения противоречат друг другу, официального объявления о закрытии не найдено. |
| Filecoin Onchain Cloud / Fil One | подписка, около 5–6 $/ТБ·мес (по сторонним описаниям) | ничтожно | ничтожно | Нет, нужна непрерывная оплата. *Цена по первоисточнику не проверена.* |
| Swarm | марки (postage stamps) на срок, цена плавает | не проверено | не проверено | Только пока оплачены марки. Адрес из SHA-256 не выводится. |
| Сайт эмитента (HTTPS) | хостинг эмитента | ≈0 | ≈0 | Нет. Живёт, пока жив домен. |
| Архив у владельца | 0 $ | 0 $ | 0 $ | Да, не зависит ни от кого. Риск: владелец потеряет файл. |
| IPFS-узел архивиста (волонтёр, музей, отраслевая ассоциация) | их диск | ≈0 | ≈0 | Да, если такие есть. Зеркало собирается по событиям цепочки без участия ODP. |

Как считалось: `https://arweave.net/price/1048576` = 13 062 611 914 winston, `…/5242880` = 65 153 593 734 winston, `…/1073741824` = 13,335 AR за ГиБ. Курс AR 4,33 $ (CoinGecko, 24.09.2026). Цена в AR меняется с курсом и загрузкой сети, пересчитывать её нужно при каждой загрузке.

**Порядок цены:** вечная публикация паспорта с одним фото ≤ 1 МиБ стоит **около 6–8 центов**. Пять полноразмерных фото по 5 МБ стоят 1,5–2 $. Это аргумент за правило «навсегда публикуем только уменьшенную копию».

### 2.3 Local-first: архив путешествует вместе с объектом

- **Телефон владельца:** приложение регистрирует тип `.odpass` (UTI на iOS, MIME и intent-filter на Android), хранит архив в своих документах и открывает его из «Файлов», почты и мессенджеров.
- **Резервная копия:** на iOS это папка приложения в iCloud Drive (видна в «Файлах»), на Android это Storage Access Framework или Google Drive. Облако здесь используется как удобство: при любой потере ключ проверки остаётся в цепочке.
- **Передача вещи:**
  1. Прежний владелец жмёт «Передать».
  2. Приложение формирует копию `.odpass`, у публичного паспорта без изменений, и отправляет её через AirDrop, Nearby Share, файл или мессенджер. Для бессерверной передачи между телефонами подойдут Iroh или другой P2P.
  3. Новый владелец импортирует архив по CA-13 и видит построчную проверку.
  4. По CA-17.3 приложение перечисляет, что было передано, и не пишет «право собственности передано».
- **Бумага:** 1 МиБ фото в QR не помещается (предел около 2,9 КБ на код). На бумагу печатается `odp://`-номер, полный `dataHash` и `imageHash` (по 64 hex) и напечатанное фото. Этого достаточно, чтобы восстановить публичный паспорт из цепочки и IPFS или Arweave и сверить хеши. Для приватного паспорта бумага сохраняет только доказательство («у меня был файл с таким хешем»), но не сам файл.
- **Вариант для 0.8, не для 0.7:** зашифрованная резервная копия. Архив шифруется ключом (AES-256-GCM), шифротекст публикуется в IPFS или Arweave, ключ печатается QR-кодом на бумажной карточке, которая лежит вместе с вещью. Приватный архив так переживает потерю телефона и не требует доверия к серверу. Минусы: шифротекст публичен навсегда, потеря бумаги означает потерю доступа. Требует отдельного формата, в 0.7 не включать.

### 2.4 Несколько адресов и проверка после загрузки

- **Для публичных файлов ≤ 1 МиБ адрес вообще не нужен:** клиент сам вычисляет `ipfs://bafkrei<base32(cid)>` из `imageHash`, `dataHash` и хешей якорей. Это главный путь, который не зависит от чьих-либо URL.
- **`ODPHosting.imageUrl`/`dataUrl`** предлагается толковать как **список до 8 URI, разделённых одним пробелом** (пробел в URI запрещён RFC 3986, поэтому разбор однозначен). Допустимые схемы: `ipfs://<CID>`, `ar://<txid>`, `https://…`. Запись вида `ipfs://bafkrei…(59 символов) ar://<43> https://example.org/odp/<id>.odpass` занимает около 180 байт, в лимит 512 помещается. Менять контракт не нужно. Старый клиент, который ждёт один URL, получит невалидную строку и ничего не покажет, и это безопасно.
- `dataUrl` может указывать на `.odpass` (как в GUIDE 0.6) или на CID `passport.json`. Клиент различает их по содержимому, а не по расширению.
- **Проверка (развитие CA-14.4):** скачал байты по любой ссылке, пересчитал SHA-256, сравнил с хешем из цепочки или из проверенного `passport.json`. Совпало — файл показывается как «файл совпадает с записью», иначе он отбрасывается. Для IPFS лучше брать `application/vnd.ipld.raw` с trustless-шлюза или через verified-fetch. Тогда проверка raw CID и есть проверка SHA-256, а шлюзу не нужно доверять. Для Arweave шлюзы ar.io умеют отдавать дайджест данных, но клиент ODP в любом случае считает SHA-256 сам. *Заголовки ar.io в этой работе не проверялись.*
- **Порядок перебора:** локальный архив → вычисленный IPFS CID (свой Helia или список шлюзов) → адреса из `imageUrl`/`dataUrl` → адреса из известных зеркал. Список шлюзов в клиенте меняется обновлением, а не правкой протокола.

### 2.5 Подтверждение фото (что снято с этого объекта и в это время)

| Способ | Что доказывает | Зрелость на сентябрь 2026 | Ограничения |
|---|---|---|---|
| **Время из блокчейна** | Хеш фото существовал **не позже** времени блока минта | Есть уже сейчас, бесплатно | Не доказывает время съёмки и то, что на снимке этот объект. Нижней границы времени нет. |
| Нижняя граница времени | Снимок сделан **не раньше** блока X: в кадре экран со свежим хешем блока | Идея, стандарта нет | Неудобно для обычного человека, легко подделать монтажом без C2PA. |
| **C2PA Content Credentials** | Файл подписан определённым устройством или приложением и не менялся (hard binding) | **Pixel 10:** подпись каждого снимка в Pixel Camera, уровень доверия C2PA Assurance Level 2, ключи в Titan M2, офлайн-метки времени, одноразовые сертификаты (Google, 10.09.2025). **Samsung S25/S26:** подписываются только правки Galaxy AI, обычные снимки нет. **Камеры** Leica, Sony, Nikon: отдельные модели. | Любое удаление EXIF, пересжатие или уменьшение **ломает подпись**, а CA-15.2 требует удалять GPS. Для проверки нужен trust list C2PA. Подтверждается устройство, а не объект: экран с чужим фото тоже можно переснять. |
| **Apple Reference Image** | Пиксели подписаны сенсором iPhone 18 Pro/Pro Max в режиме «Reference» | Анонс 15.09.2026 (Apple Security Research). Формат JPEG с подписью, RSA-3072 + ML-DSA-87, отзыв по сенсору | **Не C2PA.** Проверка и отзыв опираются на сервисы Apple (Private Cloud Compute, метка времени через APNs). Офлайновая проверка третьей стороной не описана. Для ODP это зависимость от одного сервиса. Показывать можно только как необязательную строку. |
| App Attest / Play Integrity | Запрос пришёл от неизменённого приложения на настоящем устройстве. Можно привязать хеш фото (`clientDataHash`, `requestHash`) | Зрелые API | Проверять нужно на сервере разработчика, а Play Integrity ещё и через Google. Для ODP это сервер, противоречит цели. Доказывает «наше приложение», а не «этот объект» и не «это снято камерой». В протокол не включать. |
| Perceptual hash (pHash, PDQ) | Похожесть двух **цифровых** изображений: пересжатия, уменьшения | Зрелые алгоритмы | Не узнаёт тот же предмет на другом снимке (другой ракурс или свет). Есть известные атаки на коллизии и инверсию. Годится только для поиска копий фото, например найти объявление с украденным снимком. Не доказательство. |

**Что обещать пользователю:**
- Можно: «Фото не менялось с [дата блока]»; «Паспорт записан эмитентом [полный ID] не позже [время блока]»; «Снимок подписан камерой [модель] — проверено этим приложением», если проверка C2PA действительно выполнена.
- Нельзя: «фото подтверждает, что это тот же предмет», «снимок сделан в [время]» без подписи камеры, «подлинное фото». Это следует из CA-16.1 и CA-16.2: пользователь сам сравнивает вещь с фото.

**Как совместить C2PA с удалением GPS:** подписанный камерой оригинал хранится в архиве, в `anchors[]` ему соответствует якорь `c2pa` с хешем. Публикуется очищенная уменьшенная копия, и именно её хеш идёт в `imageHash`. Хеш приватного оригинала ничего не раскрывает, если его байты не опубликованы. Утечка GPS остаётся под контролем владельца. *Сохраняют ли манифесты Pixel C2PA координаты внутри подписанных данных, не проверено. Если сохраняют, публиковать такой оригинал нельзя.*

### 2.6 Приватность и необратимость

- Arweave: удалить нельзя. Шлюзы ar.io могут скрыть данные у себя, но у других они останутся.
- IPFS: снять закрепление можно, но копии у других узлов и архивистов удалить нельзя. Для пользователя это эквивалент вечной публикации (CA-15.4).
- Pinata и Filebase удаляют у себя по запросу, но уже скачанные копии остаются.
- Хеш в цепочке сам по себе фото не раскрывает (SHA-256 фотографии не подобрать перебором). Раскрывает публикация байтов.

**Рекомендация:**

| Что | Цепочка | Архив `.odpass` | Вечная публикация (IPFS/Arweave) |
|---|---|---|---|
| Хеши (`dataHash`, `imageHash`, `fileHash`, `anchorsHash`) | всегда | всегда | — |
| `passport.json` | — | всегда | только по явному выбору «публичный паспорт» |
| Главное фото, уменьшенное и очищенное, ≤ 1 МиБ | хеш | всегда | только при «публичном паспорте» |
| Полноразмерные оригиналы, C2PA-оригинал | хеш в якоре | всегда | не публиковать (по умолчанию) |
| Фото с людьми, интерьером жилья, номерами, отражениями | — | по желанию | никогда (предупреждение по аналогии с CA-15.3) |
| Цифровой оригинал (`fileHash`) | хеш | всегда | на усмотрение эмитента (лицензия, размер) |

По умолчанию паспорт приватный: хеши в цепочке, всё остальное в архиве (так уже описано в `OBJECTID_PROFILE.md`). «Опубликовать навсегда» — отдельный шаг с экраном CA-15.1.

---

## 3. Сравнительная таблица

Оценки: ●●● хорошо, ●● средне, ● плохо.

| Вариант | Независимость | Стоимость | Долговечность | Удобство для обычного человека | Приватность |
|---|---|---|---|---|---|
| Архив у владельца (+iCloud/Drive) | ●●● | ●●● (0 $) | ●● (зависит от владельца) | ●●● (обычный файл) | ●●● |
| IPFS raw CID из хеша (≤1 МиБ), закрепляют разные стороны | ●●● (адрес без URL, любой может зеркалить) | ●●● | ●● (пока хоть кто-то закрепил) | ●● (скрыто в приложении, нужен встроенный Helia или шлюзы) | ● (навсегда публично) |
| IPFS через Pinata/Filebase | ●● (адрес не привязан к сервису, но хранение привязано) | ●●● (центы в год) | ● (пока платят) | ●●● | ● |
| Arweave | ●● (адрес `ar://` не выводится из хеша, данные вечны) | ●● (≈0,06 $/МиБ разово) | ●●● (при жизни сети) | ●● (нужен кошелёк или Turbo на стороне эмитента) | ● (нельзя удалить) |
| Filecoin Onchain Cloud / Fil One | ● | ●●● | ● (подписка) | ● | ● |
| Storacha / web3.storage | ● | — | ● (закрыт или в переходе) | — | ● |
| Swarm | ●● | не проверено | ● (марки на срок) | ● | ● |
| BitTorrent v2 | ●●● | ●●● | ● (пока есть раздающие) | ● | ● |
| Iroh (P2P передача) | ●●● | ●●● | — (транспорт, а не хранение) | ●● (при встраивании в приложение) | ●●● (прямо между людьми) |
| Сайт эмитента HTTPS | ● | ●●● | ● | ●●● | ●● |
| Бумага | ●●● | ●●● | ●●● для номера и хешей, ● для фото | ●●● | ●●● |

---

## 4. Черновик текста для SPEC (новые правила CA)

Предлагается новый подраздел `§22.18 Storage, retrieval and backup (A13)` и две строки в §9 и §13. Текст на английском, как весь SPEC.

```markdown
### 22.18 Storage, retrieval and backup (A13)

The chain holds commitments, never files. A passport stays checkable after any storage
service, gateway or ODP itself disappears, provided some copy of the bytes survives anywhere.
The owner's local bundle is the primary copy; every network location is a replaceable convenience.

- CA-18.1. A client MUST keep a complete `.odpass` for every passport it issues or imports
  and MUST offer an export to the platform's file system and backup (e.g. iCloud Drive,
  Google Drive) without an ODP account. Export MUST NOT alter passport.json or originals.
- CA-18.2. A client MUST be able to verify a passport from bytes obtained by any route
  (local file, peer transfer, IPFS, Arweave, HTTPS) and MUST treat every route as untrusted:
  bytes are accepted only if their SHA-256 equals the committed hash (CA-14.4).
- CA-18.3. Hash-derived address. For any committed SHA-256 digest `d` of a file of at most
  1,048,576 bytes, the canonical content address is the CIDv1 `0x01 0x55 0x12 0x20 || d`
  (codec raw, multihash sha2-256), written base32 lower-case with prefix `b`.
  A client SHOULD try this address for `dataHash`, `imageHash` and anchor hashes before
  any hosting URL. Publishers who publish a file ≤ 1 MiB to IPFS MUST publish it as a single
  raw block so that this address resolves.
- CA-18.4. Primary photo. For physical and mixed passports the client SHOULD derive the primary
  photo committed in `imageHash` as a JPEG of at most 1,048,576 bytes with location/device
  metadata removed (CA-15.2), and SHOULD keep the full-resolution capture as an additional
  `photo` anchor inside the bundle. Both are originals in the sense of §9: the committed hash
  is of the exact bytes stored in `files/`.
- CA-18.5. Private by default. Bytes are published to IPFS, Arweave or any public location only
  after a separate explicit user action preceded by the CA-15.1 disclosure. The client MUST state
  that published copies cannot be recalled ("unpinned by us; other copies may remain";
  "stored on Arweave permanently").
- CA-18.6. Hosting lists. `ODPHosting.dataUrl` and `imageUrl` MAY contain up to 8 URIs separated
  by single U+0020 spaces. Recognized schemes are `ipfs`, `ar` and `https`; others are ignored
  (CA-14.3). Order is a hint, not a priority of trust. An empty or unreachable list MUST be
  reported as "no online copy found", never as revocation or failure of the chain record.
- CA-18.7. Reconstructable bundle. A client MUST be able to rebuild a complete public `.odpass`
  from the chain record and hash-addressed bytes: passport.json by `dataHash`, originals by their
  committed hashes, `generation.json` from the embedded generation (§22.12) and `receipt.json`
  from the mint event. A reconstructed bundle MUST be labelled with its sources and time.
- CA-18.8. Gateways. A client MUST NOT depend on a single gateway or pinning service and MUST
  allow the user to add their own. It SHOULD fetch IPFS content in verifiable form (raw blocks or
  CAR) and verify locally.
- CA-18.9. Hand-over. The hand-over flow (CA-17.3) MUST offer a direct file transfer of the
  bundle (share sheet, AirDrop, Nearby Share, file) that works without an internet connection.
- CA-18.10. Capture provenance. A client MAY verify C2PA manifests or vendor capture signatures on
  bundled originals and show the result as its own line ("signed by camera <model>", "not signed",
  "cannot check"). It MUST NOT present any capture signature, device attestation or perceptual hash
  as proof that the photographed object is the object at hand (CA-16.2). A capture-signed original
  whose metadata cannot be removed without breaking the signature SHOULD stay in the bundle only.
```

Строка в §13 Hosting: *«The value of `dataUrl`/`imageUrl` follows CA-18.6. The contract does not parse it.»*
Строка в §15, вместо «Storage providers and distribution policy remain undecided»: *«Storage and retrieval follow §22.18; no specific provider is required.»*

---

## 5. Риски и открытые вопросы

- **R-1. Смысл «original bytes» (§9).** Если под оригиналом понимать только файл прямо с камеры, CA-18.4 противоречит SPEC. Предложение: определить, что оригинал — это точные байты в `files/`, на которые указывает хеш, какими бы они ни были. Решить нужно до выпуска клиента.
- **R-2. Эквивалентность CID при ≤ 1 МиБ.** Одинаковый CID у `ipfs add` (профиль `unixfs-v1-2025`) и у CID, вычисленного из хеша, выведен из спецификации. Нужен тест-вектор в `schema/vectors/` на Kubo и Helia, включая граничный случай ровно 1 048 576 байт.
- **R-3. Кто закрепляет IPFS-данные.** Без хотя бы одного постоянного узла вычисленный CID никуда не ведёт. Варианты: эмитент (платный пиннинг), волонтёры-архивисты по событиям цепочки, Arweave как вечная копия. Протокол не может гарантировать, что закрепитель найдётся. Честное сообщение «копия в сети не найдена» обязательно (CA-18.6).
- **R-4. Шлюзы уходят.** Закрытие `ipfs.io`/`dweb.link` 21.09.2026 и противоречивые сведения о Storacha показывают, что любой бесплатный сервис может исчезнуть за месяц. Клиенту нужен встроенный verified-fetch или Helia и редактируемый список шлюзов. Статус `trustless-gateway.link` после 21.09 не проверен.
- **R-5. Arweave: риск цены и сети.** Цена в AR и курс плавают. Вечность держится на экономике эндаумента сети, 100% гарантии нет. `ar://txid` не выводится из хеша: поиск по тегу `SHA-256` зависит от индексаторов шлюзов.
- **R-6. C2PA и приватность.** Удаление GPS ломает подпись. Неизвестно, содержат ли подписанные данные Pixel координаты. Apple Reference Image зависит от сервиса Apple. Показывать это можно только как необязательные строки.
- **R-7. Восстановление `receipt.json` из событий.** Нужно проверить, что `operationId`, `transactionHash`, `blockNumber` и `blockHash` однозначно достаются из событий минта ABI7 без стороннего индексатора, с ограниченными RPC-запросами.
- **R-8. HEIC.** Файлы iPhone по умолчанию в HEIC, а веб и сторонние проверяющие его показывают не везде. Решение: публичная копия в JPEG, HEIC-оригинал в архиве.
- **R-9. Старые клиенты и список адресов в `imageUrl`.** Клиенты 0.6 могут показать строку с пробелами как битую ссылку. Это безопасно, но выглядит как ошибка. Если есть внешние потребители `ODPHosting`, их нужно предупредить.
- **R-10. Потеря архива приватного паспорта** означает безвозвратную потерю фото: в цепочке остаются только хеши. Пользователя нужно предупредить при выпуске. Зашифрованная резервная копия с бумажным ключом отложена до 0.8.
- Открытый вопрос: включать ли ODP (или сообщество) в роль «архивиста по умолчанию» и как описать это, не создавая зависимости.
- Не проверено: цены Swarm, Filecoin Onchain Cloud и Fil One по первоисточнику; официальное объявление о закрытии Storacha; работа App Attest без сервера Apple (страница документации Apple не загрузилась); заголовки проверки у шлюзов ar.io.

---

## 6. Источники (дата обращения для всех: 24.09.2026)

**Репозиторий (прочитан локально):** `SPEC.md` §8–§11, §13, §15, §19, §22.13–§22.17; `chain/contracts/ODPHosting.sol`; `schema/bundle-0.7/README.md`, `manifest.schema.json`; `schema/passport-0.7.schema.json`; `docs/ru/CHANGELOG.md`; `docs/ru/OBJECTID_PROFILE.md`; `docs/GUIDE.md`.

**IPFS и адресация**
- Bitswap spec (2 МиБ на блок, 4 МиБ на сообщение): https://specs.ipfs.tech/bitswap-protocol/
- IPIP-0499, UnixFS CID Profiles (опубликован 05.03.2026): https://specs.ipfs.tech/ipips/ipip-0499/
- Kubo v0.40.0 release notes (2 МиБ, профили; дата на странице распознана неуверенно, релиз 2026 года): https://github.com/ipfs/kubo/releases/tag/v0.40.0
- IPFS Forums, Blocks larger than 1MiB: https://discuss.ipfs.tech/t/blocks-larger-than-1mib/20308
- IPFS Docs, Content addressing: https://docs.ipfs.tech/concepts/content-addressing/
- IPFS Blog, «IPFS is moving beyond the sponsored gateways» (25.08.2026): https://blog.ipfs.tech/2026-08-beyond-sponsored-gateways/
- Объявление о закрытии шлюза: https://gatewaychanges.ipfs.io/
- IPFS Docs, Public utilities (на дату обращения ещё перечисляет ipfs.io, то есть устарела): https://docs.ipfs.tech/concepts/public-utilities/
- Независимое подтверждение 429 и `Sunset` у ipfs.io/dweb.link и w3s.link/storacha.link: https://github.com/NiKrause/orbitdb-storage-bridge/issues/111
- BEP 52, BitTorrent v2: https://www.bittorrent.org/beps/bep_0052.html
- iroh-blobs 0.103 docs: https://docs.rs/iroh-blobs/latest/iroh_blobs/
- Swarm, Postage stamps: https://docs.ethswarm.org/docs/concepts/incentives/postage-stamps/

**Хранение и цены**
- Arweave, цена за байты (прямой запрос к узлу): https://arweave.net/price/1048576 , https://arweave.net/price/5242880 , https://arweave.net/price/1073741824
- Курс AR/FIL: https://api.coingecko.com/api/v3/simple/price?ids=arweave,filecoin&vs_currencies=usd
- ar.io, Turbo credits (бесплатно до 105 КиБ, 10 МиБ на всё время, 35% комиссия): https://docs.ar.io/build/upload/turbo-credits
- ar.io Wayfinder и `ar://`: https://docs.ar.io/learn/wayfinder
- Pinata pricing: https://pinata.cloud/pricing
- Filebase pricing: https://filebase.com/pricing/
- Storacha status page: https://storacha.statuspage.io/ ; redirect `storacha.network` → `fil.one` (проверен ответ 301): https://storacha.network/
- Storacha upload-service repo: https://github.com/storacha/upload-service
- Filecoin Onchain Cloud (анонс 18.11.2025): https://filecoin.io/blog/posts/introducing-filecoin-onchain-cloud/

**Подтверждение фото**
- Google Security Blog, Pixel 10 и C2PA (10.09.2025): https://blog.google/security/pixel-android-trusted-images-c2pa-content-credentials/
- Apple Security Research, Apple Reference Image (15.09.2026): https://security.apple.com/blog/apple-reference-image/
- MacRumors, упоминание в бете iOS 27 (10.08.2026): https://www.macrumors.com/2026/08/10/ios-27-apple-reference-image/
- Samsung и C2PA, сводка (вторичный источник): https://www.lumethic.com/en/articles/smartphones-c2pa-content-credentials
- Play Integrity overview: https://developer.android.com/google/play/integrity/overview
- App Attest (страница Apple не загрузилась; сведения по вторичному источнику и корневому CA): https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity , https://www.apple.com/certificateauthority/Apple_App_Attestation_Root_CA.pem
- Perceptual hashing, устойчивость и атаки: https://arxiv.org/abs/2406.00918 , https://www.usenix.org/system/files/sec22summer_jain.pdf
