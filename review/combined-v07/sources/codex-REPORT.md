# Независимый критический аудит ODP 0.7

**Вердикт публичного выпуска: НЕ ГОТОВ.** Подтверждённого Critical/High обхода чужих прав в проверенном core/спутниках не найдено. Наиболее значимые подтверждённые проблемы: deployment не обеспечивает соответствие одобренной сборке; официальная подготовка допускает необратимо неоткрываемый edition; retry journal способен оставить скрытый Active дубликат. Отдельно подтверждён уже согласованный риск stop между mint/open.

Вердикт относится к1028 файлам read-only snapshot, manifest SHA256 `bd1c79b59946944f51c91f20aebc0815f5089b61f4c7c69265abeb724ad06c92`, а не только HEAD `5d1db8f...`. Generation `0.7-redesign-4`. Методика, среда и точные ограничения: [SCOPE](SCOPE.md). Это самостоятельный аудит в новой сессии Codex, не внешний профессиональный аудит.

- **Архитектура: готова при условиях** для неизменяемой регистрации деклараций/commitments. Не обеспечивает физическую подлинность, recovery потерянного issuer или гарантированную доступность файлов; условия должны быть приняты как свойства продукта.
- **Проверенный clean bytecode: готов при условиях** фиксации именно данного полного input/build, решения compiler policy и прохождения release gates. Подтверждённого обязательного исправления core из-за чужого access exploit нет; гарантий отсутствия неизвестных ошибок также нет.
- **Публичный выпуск: не готов** — воспроизводимые дефекты tools, процедурный build gate, незавершённые client recovery/bundle/evidence и открытые носитель/доставка.

## Findings table

| ID | Severity / статус | Класс | Последствие / необходимое решение |
|---|---|---|---|
| IA-01 | Medium, mock PoC + code | Deployment | Complete возможен без artifact/factory/runtime equality и approved build; закрепить и проверять build identity |
| IA-02 | Medium, tools + EVM PoC | Tooling | Zero root проходит prepare/mint, open невозможен; отклонять до mint и проверять дерево |
| IA-03 | Medium, EVM PoC | Architecture/client | Повтор initial publish создаёт два Active claims; определить journal/proof retry semantics до ABI freeze |
| IA-04 | Medium residual risk, EVM PoC | Принятый компромисс | Stop после mint блокирует open и revoke; выдача только после confirmed open либо отдельный пересмотр прав |
| IA-05 | Low, CLI PoC | Tooling/spec | Invalid UTF-8 превращается в изменённый текст до hash; fatal decode |
| IA-06 | Low, tools PoC | Неполная client реализация | Нет per-capability unsupported result; integrity-only helper не считать полным reader |

Карточки с предусловиями, строками, сценарием, влиянием до/после deployment и regression criteria: [FINDINGS](FINDINGS.md). Ни один Medium здесь не означает, что произвольный внешний wallet способен менять чужой immutable passport.

## Перепроверка существенных решений

| Решение/прежнее утверждение | Статус текущей реализации | Независимая оценка |
|---|---|---|
| Минимальный core без admin/upgrade/callback | Реализовано | Прочитаны все entrypoints и call graph; internal library, нет внешних вызовов core |
| AR-01 фиксированная generation identity | Частично | Schemas и пустой approved directory есть; authenticated deployment/trust bootstrap не реализован, IA-01 |
| AR-02 полный namespace носителя | Частично | В bundle schema полные chain/address; итоговый компактный QR/unit wire format не определён |
| AR-03 автономные Merkle данные | Частично | Bundle требует addressList bytes/hash, но не восстанавливает tree/root/count; индивидуальный пакет не определён |
| AR-04 core-to-edition commitment | Реализовано | Domain/types/inputs совпали с независимым encoding; невозможно изменить раскрытие без mismatch. Finalization availability не гарантирована |
| AR-05 общий journal lifecycle | Контракт реализован; продукт частично | Author/kind/subject/previous/terminal transitions корректны в проверенном объёме; payload validator/recovery/UI отсутствуют |
| AR-06 сохранность после issuer | Только формат и требования | On-chain card остаётся; хеши не восстановят архив/фото; operational storage не выбран |
| AR-07 историческая идентичность | Только описано | APP_HANDOFF требует evidence с временем/scope; отдельной исполняемой модели нет |
| AR-08 mint-agent удалён | Реализовано | Issuer всегда msg.sender, старый calldata отклонён; publishing grant не даёт mint |
| AR-09 раздельный verification report | Частично | Bundle report честно сохраняет chain/identity unverified; trusted evidence pipeline отсутствует |
| AR-10 unsupported и новый reprint | Частично | Immutable finite edition и new passport semantics есть; unsupported детализация IA-06; новый nonce не доказывает свежесть физического набора |
| AR-11 hash document vs transport | Реализовано на формате/helpers | passportId=null, canonical bytes, external receipt; ZIP implementation отсутствует; CLI UTF-8 IA-05 |
| AR-12 operation identity mint | Реализовано | Полный digest, issuer namespace, atomic rollback, replay до stop/calendar/quota проверок |
| AR-13 immutable satellite | Реализовано как ограничение | Namespace закреплён; ремонт/миграция существующего edition не предусмотрены |
| «Контрактная часть завершена» | Верно только для описанного набора entrypoints | Не означает готовность deployment, клиента, доставки или восстановимость бизнес-операций |
| «Incremental отличается только creation» | Опровергнуто уточнением | Исторические hashes отличаются также runtime. Свежий эксперимент установил изменение IR spill allocation |
| «Все 32 Slither detектора корректно описаны» | В основном подтверждено, одна неточность | Cyclomatic warning относится к openEdition, а не core validator; все32 переоценены |

Исторические owner/freeze/router/delegatecall-library проблемы не перенесены механически: соответствующие production пути отсутствуют. Предыдущие findings про circular passportId-based derivation и несвязанные commitments не воспроизводятся в текущем v2/context+core commitment. Старые quotas/Sybil/physical truth риски остаются сознательными границами; зелёные исторические PoC этого не отменяют.

## Результаты собственной проверки

Полная матрица: [RIGHTS_AND_STATES](RIGHTS_AND_STATES.md). Дополнительно к88 существующим EVM tests добавлено9 собственных; полный прогон88+8=96 и отдельный окончательный набор9 прошли. В них180 mint-model и180 journal-model transitions — воспроизводимые ограниченные сценарии, не исчерпывающий fuzzing.

Две clean builds воспроизводят43 ABI/TypeChain файла и все artifacts; оригинальные generated snapshot bytes совпали. Все десять runtime templates укладываются в EIP-170, core12129bytes. Текущие factories соответствуют artifacts; local constructor pins корректны. Slither32 findings сохранены без фильтров, high/medium просмотрены по выражениям: [STATIC_ANALYSIS](STATIC_ANALYSIS.md).

Root commitment вычислен независимо через точные ABI types; Python HMAC/HKDF/truncation/checksum/leaf совпал для8 synthetic units. Листы индексированы SHA256(index4||address20), sibling order по index bits, odd-node duplicate. High-s/v/truncation/domain/proof негативные baseline tests прошли. Activation signatures — personal_sign; author signatures — EIP712. Domains разделяют цепи/спутники; nonce+registry контекст derivation не содержит passportId, круговой зависимости нет. Satellite не входит в key derivation context, но входит в core commitment и signatures: повтор master/context сознательно повторит key set, fresh nonce/master — обязанность issuer.

Максимальное дерево2^20 листьев реально построено,4 proof samples сверены другим SHA256 fold. Проверен20-level EVM путь (104628gas activation,204739gas open); миллион разных private keys не генерировался. C quota1000 проверена реальной последовательностью baseline, B граница100000 — искусственно seeded counter, затем успешный mint и atomic reject; max-card mint1039291gas. Стоимость полного производства/100000 транзакций не измерялась.

Строки в core/URL/DNS ограничены, storage рост permissionless неограничен по общему числу wallets/claims. При заполняемости q пространства ID вероятность25 неудачных кандидатов примерно q^25 при случайной модели; grinding/block producer делает эту оценку не adversarial guarantee. P/M и Sybil обходят любые обещания глобальной квоты. Эти ограничения не дают перезаписать taken IDs, но влияют на доступность и стоимость индексирования.

[COMPILER_AND_BUILD](COMPILER_AND_BUILD.md) объясняет контролируемое расхождение bytecode: полный/subset IR alpha-equivalent до optimizer, изменены имена и spill slots после optimizer. Проверены официальные текущие advisories и их необходимые условия. Точный исторический incremental input отсутствует, его прежний hash не восстановлен; compiler correctness формально не доказана.

## Долгосрочные сценарии

| Сценарий | Что сохраняется | Что нельзя подтвердить / необратимая потеря |
|---|---|---|
| Сайт исчез, полный .odpass есть, сеть доступна | Локальные originals и hashes, chain card/history через другой проверенный RPC | Старый URL не нужен; issuer identity требует retained evidence, а не нового DNS |
| Issuer исчез/ключ потерян, edition уже open | Immutable card, commitments, независимые claims, activation nonrevoked edition | Новые issuer corrections/hosting updates/revokes/open недоступны; нет восстановления ключа |
| Issuer stop между mint/open | Паспорт и его commitment | Именно этот edition может никогда не открыться; IA-04 |
| Архив потерян, есть только полный locator/QR | При корректном namespace доступна on-chain card | Hash не восстанавливает originals, statement payload, address list или concealed key; mirror не гарантирован |
| Есть лишь legacy odp://ID без generation | Строка ID | Нельзя однозначно выбрать chain/registry; угадывать current default запрещено |
| Полный архив без сети и ранее trusted evidence | Локальная целостность и подтверждённые facts на сохранённом block | Нельзя утверждать свежесть revocation/withdrawal/activation |
| Полный архив без сети, evidence self-presented | Внутренняя согласованность bytes | Chain authenticity/issuer identity не доказаны самим manifest/receipt |
| Клиент не поддерживает спутник | Card/поддерживаемые проверки | Остальная история unknown/unsupported, не пустая и не passed |
| Дефект immutable activation satellite | Старые bytes/namespace/history при доступной сети | Silent replacement не перенесёт one-shot state; может потребоваться новый паспорт/носитель |
| Новое поколение/новая trust policy | Старые addresses и interpretation при их сохранении reader | Нельзя объявлять старую activation отсутствующей по default нового спутника; policy change не переписывает past facts |
| Копия внешней label/скретч-кода | Криптографически валидная копия | Подпись не определяет оригинальный предмет/владельца; first activation может принадлежать атакующему |
| Потеря reason/payload bytes | Author,kind,subject,hash,lifecycle на chain | Смысл correction/assessment нельзя восстановить из hash; строки body не хранятся в journal |

Приложение может честно объяснить результаты без неизвестного сервера только если располагает bytes и независимо аутентифицированным chain/deployment evidence. Наличие read-only контрактов само по себе не решает доверие к RPC и сохранность файлов.

## Что делать дальше

[RELEASE_GATES](RELEASE_GATES.md) отделяет контрактные решения до фиксации адресов от client/tooling исправлений и операционных условий. Приоритет: IA-01/02, решение по retry journal, запрет выдачи unopened editions; затем fatal UTF-8 и полный typed reader/bundle flow. Архитектурные изменения не внесены, production код не исправлялся. Ничего не развёрнуто в публичных сетях и не опубликовано.
