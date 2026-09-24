# Object Digital Passport — примечания к релизу · v0.4.1

*Снимок **реализации в репозитории** (статический UI, инструменты); **линия протокола** по-прежнему **v0.4** (**поколение 4** на чейне, упакованный `CONTRACT_VERSION` = **4**). Этот тег описывает **код и страницы**, а не смену ABI задеплоенного реестра.*

## Кратко

Релиз **v0.4.1** — патч к **веб-безопасности**, **процессу на GitHub**, **зависимостям Hardhat 3**, **закоммиченным TypeScript-типам** контрактов и мелким **качественным** правкам. Новых нормативных фич протокола сверх уже описанного в **[`SPEC.md`](../../SPEC.md)** для v0.4 нет.

---

## Безопасность и веб

- **SRI (Subresource Integrity)** для сторонних скриптов с CDN (`ethers`, библиотеки QR, `html2canvas`, `jszip`, `jsQR`) на страницах **creator**, **passport**, **verify**.
- **`web/odp-passport-v03-ops.js`:** текст ошибок из исключений выводится через **`textContent`**, а не через **`innerHTML`**, чтобы строки не разбирались как HTML.
- **Code scanning:** отдельный **advanced** workflow CodeQL **убран** из‑за конфликта с **встроенным** Code scanning на GitHub. Находки в **сгенерированном** бандле WalletConnect (`web/odp-wallet-wc.bundle.js`) помечены как *won’t fix* (артефакт сборки npm, не ручной исходник).

---

## Сообщество и GitHub

- Шаблон issue **Standard gap** — предложения по пробелам в **`SPEC.md`**.
- **[`CONTRIBUTING.md`](../../docs/CONTRIBUTING.md):** общение в issues/PR на **английском**; нормативный текст — **[`SPEC.md`](../../SPEC.md)** (EN). Русские копии в **[`web/frontend/localization/`](https://github.com/object-digital-passport/object-digital-passport.github.io/tree/main/frontend/localization)** справочные.
- Напоминание в шаблоне PR: заголовок и описание на **английском**.
- Ветки / **rulesets:** см. **[`.github/BRANCH_PROTECTION.md`](../../.github/BRANCH_PROTECTION.md)** (локальная папка `rulesets/` в `.gitignore` — только шаблоны для импорта).

---

## Инструменты и зависимости

- Корневой **`package.json`:** **Hardhat 3.x**, **toolbox-mocha-ethers**, **dotenv** 17.x, **overrides** для транзитивных зависимостей при необходимости.
- **`types/ethers-chain/contracts/`:** сгенерированные **TypeScript**-типы и фабрики контрактов.

---

## Качество и локализация

- **`web/SPEC.md`:** правки оформления ссылок в Markdown (без изменения смысла SPEC).
- **`web/verify.html`:** форматирование скобки в **`init()`**.

---

## См. также

- **v0.4 (RU):** [`RELEASE_v0.4.md`](RELEASE_v0.4.md)
- **Указатель v0.4 (EN):** [`../../../docs/V0.4.md`](../../docs/V0.4.md)
- **Версии и теги:** [`../../../docs/VERSIONING_AND_RELEASES.md`](../../docs/VERSIONING_AND_RELEASES.md)

---

*При публикации git-тега **`v0.4.1`** приложите эти примечания или ссылку на этот файл в GitHub Release.*
