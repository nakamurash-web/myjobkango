# リスティングLP「KW別 出し分け」解析レポート

対象: 看護師転職LP `job.kangoshi-no-mikata.com/lp004t`
（保存ファイル: 「中央区の看護師転職サービスおすすめランキング【2026年最新版】エリア別求人比較」）
目的: リスティング広告の検索KWに応じて **ファーストビュー / 記事内コンテンツを入れ替える手法** を解析し、**Squad beyond で再現する方法**に落とし込む。
作成日: 2026-06-17

---

## 0. 結論サマリー

| 観点 | 参考サイトの実態 |
|---|---|
| 生成方法 | **Readdy（AIサイトビルダー）** で生成 → **React + Vite** の SPA（`storage.readdy-site.link` 参照、`index-*.js` が Vite ビルド） |
| KW出し分けの核心 | 広告URLに **`?st=<検索語>`** を付与 → JSで読取 → **`<html>` にクラス付与 → CSS で表示/非表示** |
| 高度な出し分け | `useAgeSegment` / `nurseTextReplacer` / `rankingDetect` 等の専用モジュールで、テキスト置換・ランキングデータ差し替えまで実施（本体は遅延ロードのため未取得） |
| エリア別（"中央区"） | 出し分けではなく **エリアごとに1ページ静的生成**（プログラマティックSEO） |
| 計測 | GA4 / Google Ads / Yahoo広告 / Microsoft Clarity / GTM。`gclid`等を sessionStorage に保存しアフィリンクへ引き継ぎ |

**beyond での再現方針（特殊スタック不要）**
- **Branch Operation（分岐）** … 広告/URLパラメータ → 記事バージョンを出し分け（エリア・条件・KWグループ単位）
- **HTMLエディタ版の記事に生JS/CSSを埋め込み** … 参考サイトと同じ `?st=` → classList → CSS表示切替で、1記事内のFV/ブロックを差し替え
- **動的差し込み** … KWエコー・エリア名などのトークン置換

---

## 1. サイトの正体

- ホスティング/生成: **Readdy**（AIでLP/サイトを生成するビルダー）。`storage.readdy-site.link` への参照と、Vite ビルドの `index-Cui1VGLg.js`（React Router + i18next を含むSPAシェル）から判断。
- 計測タグ:
  - GA4: `G-372240522`
  - Google Ads: `AW-848374188`（CVは `AW-848374188/TSnsCKqA_uYCEKzTxJQD` ほか複数）
  - Yahoo広告: `yjtag`（`s.yjtag.jp`）
  - Microsoft Clarity: `8u95wuffon`
  - GTMコンテナ2本（`js`, `js(1)`）

---

## 2. 出し分けアーキテクチャ（3層構造）

```
[広告]  検索KWを ?st={keyword} でURLに付与（Google/Yahoo の ValueTrack）
   │
   ├─ レイヤー1: ページ選択（静的）   … エリアごとに別URL/別ページ（中央区, …）= プログラマティックSEO
   │
   ├─ レイヤー2: ランタイム分岐（JS） … ?st= を正規表現判定 → <html> にクラス付与
   │                                   → useAgeSegment / rankingDetect が
   │                                     ランキングデータ・訴求ブロックを切替
   │
   └─ レイヤー3: 表示制御（CSS）       … 対象ブロックを既定 display:none、
                                        マッチ時のみ display:block で出現
```

---

## 3. 確認できた実装の核心（実コード）

### 3-1. KW読取 → セグメント判定 → `<html>` クラス付与
HTMLにベタ書きされた即時関数（これが出し分けのトリガ）:

```js
(function () {
  var params = new URLSearchParams(window.location.search);
  var st = decodeURIComponent(params.get("st") || "");      // ← 広告のKW（検索語）
  if (/(20代|2[0-9]歳|2[0-9]才)/.test(st)) {
    document.documentElement.classList.add("age20s");        // <html class="age20s">
  } else if (/(30代|3[0-9]歳|3[0-9]才)/.test(st)) {
    document.documentElement.classList.add("age30s");
  }
})();
```

### 3-2. CSS による表示/非表示の切替
対象ブロックは **既定で非表示**、`<html>` にクラスが付いた時だけ表示:

```css
.age20s-badge, .age30s-badge { display: none; }
html.age20s .age20s-badge,
html.age30s .age30s-badge { display: block; animation: .5s ease-out ageBadgeSlideIn; }
```

> ポイント: 「**URLパラメータ → classList → CSSの display 切替**」という、ライブラリ依存ゼロの素朴な仕組み。これがそのまま beyond のHTMLエディタにも移植できる（後述）。

### 3-3. クリックID引き継ぎ（成果計測の要）
`gclid / wbraid / yclid / fbclid / msclkid / ttclid / ldtag_cl` を `sessionStorage`（key: `tracking_click_ids`）に保存し、アフィリエイト遷移URLに引き継いでCV計測精度を担保。

### 3-4. CV発火
クリック/スワイプ検知でアフィリンクへの遷移時に `gtag('event','conversion', {send_to: 'AW-848374188/...'})` を発火（500msのクールダウンで重複防止）。

---

## 4. モジュール構成から判明する「高度な出し分け」

Vite の依存マップ（`__vite__mapDeps`）に、出し分け専用のモジュールが並ぶ。**中身は遅延ロードチャンクで保存ファイルに未取得**だが、命名から役割が読める:

| モジュール | 役割（推定） |
|---|---|
| `useAgeSegment` | `?st=` から年代セグメントを返す React フック |
| `nurseTextReplacer` | KW/セグメントに応じて **記事内テキストをトークン置換** |
| `rankingDetect` + `rankingData` / `rankingDataMale` | KWで **ランキングのデータセット自体を差し替え**（例: 男性看護師向け） |
| `HeroSection` | ファーストビュー |
| `ExitIntentModal` / `AnxietyReliefBlock` / `SeasonalBanner` / `LastPushSection` / `QuickDiagnosisWidget` | 差し込み型の訴求ブロック群 |

→ 単なる表示切替に留まらず、**①テキスト置換 ②ランキングデータ差替 ③訴求ブロック出し分け** を組み合わせている。

---

## 5. エリア別（"中央区"）は「出し分け」ではなく「静的生成」

- `中央区` がHTMLに **173回** 出現。H1「中央区で駅近・好条件看護師求人」、H2「中央区の看護師転職事情」等に直接埋め込み。
- = **エリアごとに1ページ静的生成するプログラマティックSEO**（ランタイム置換ではない）。
- 同梱の `geo-10972795.js`（3.4MB）は **別案件（英国の太陽光発電）のReaddy残骸** で、当ページでは未使用（`routeMatch` が `/admin/ai-strategy-deliverables` を指す）。

---

## 5.5 なぜ広告KWは「1ページ」で足りるのか（1ページ多態の仕組み）★重要

> エリア別（§5）は「SEOのためURLを分けて量産」。一方、**広告のKW出し分けはURLを増やさず1枚で済む**。理由は以下のとおり。

### 仕組み: 全パターンを最初から1枚に入れ、CSSで隠し、KWで該当分だけ出す

1枚のHTMLの中に**全パターンのブロックを最初から書いておき**、CSSで既定は全部 `display:none`。URLの `?st=` を見て、合致したブロックだけ表示する。

```
広告のリンク先は全部「同じ1枚のLP」。違うのは ?st= だけ。
┌─────────────────────────────────────────────────────────────┐
│  A) 夜勤なし広告  → /lp?st=看護師 夜勤なし                       │
│  B) ブランク広告  → /lp?st=看護師 ブランク 復職                  │
│  C) クリニック広告→ /lp?st=看護師 クリニック 求人               │
└─────────────────────────────────────────────────────────────┘
                         │ 同じ index.html を読む
                         ▼
        JSが st を正規表現で判定 → <html> にクラス付与
        A) <html class="kw-yakin-nashi">
        B) <html class="kw-fukushoku">
        C) <html class="kw-clinic">
                         │
                         ▼
   本文には全ブロックが入っているが、CSSで既定は全部 display:none
   ┌───────────────────────────────────────────────┐
   │ [夜勤なし特集]  .yakin-nashi   （既定: 非表示）  │
   │ [ブランク復職]  .fukushoku     （既定: 非表示）  │
   │ [クリニック特集] .clinic        （既定: 非表示）  │
   │ [デフォルト訴求] .default       （既定: 非表示）  │
   └───────────────────────────────────────────────┘
        <html> のクラスに一致した1つだけ display:block
                         │
                         ▼
   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
   │ Aで来た人     │ │ Bで来た人     │ │ Cで来た人     │
   │ [夜勤なし特集]│ │ [ブランク復職]│ │ [クリニック]  │
   │  だけ表示     │ │  だけ表示     │ │  だけ表示     │
   └──────────────┘ └──────────────┘ └──────────────┘
   ※ どれにも当たらない／直アクセス → [デフォルト訴求] を表示
```

**ページは1枚のまま。中身の見せ方だけがKWで変わる。**

### 「何百KWでも1枚」= KWの数だけブロックを作るのではない

リスティングのKWは何百個あっても、**意図（インテント）で束ねると数パターン**に集約できる。正規表現で“ゆるくマッチ”させるのがコツ。

```js
if (/夜勤(なし|無し|専従なし|したくない)/.test(st)) ... // ← 何十通りの言い回しを1本で吸収
if (/ブランク|復職|復帰|離職|ママ|主婦/.test(st)) ...
if (/クリニック|外来|日勤のみ|美容(クリニック)?/.test(st)) ...
```

| 実際の検索KW（例） | マッチする束 | 見えるブロック |
|---|---|---|
| 看護師 夜勤なし 求人 | 夜勤なし | 夜勤なし特集 |
| 准看護師 夜勤 したくない | 夜勤なし | 夜勤なし特集 |
| 看護師 ブランク 復帰 不安 | ブランク | ブランク復職特集 |
| ママナース 復職 | ブランク | ブランク復職特集 |
| 美容クリニック 看護師 | クリニック | クリニック特集 |

→ **何百KW → 5〜6個の「意図ブロック」に集約**。だから1枚＋数ブロックで全KWをカバーできる。

### エリア別（量産）と広告KW（1枚）の分かれ目 = 「SEOで拾わせたいか」

```
                ┌──────────────────────────────┐
   流入は何?     │                              │
                ▼                              ▼
        Google検索（自然流入）           広告クリック（リスティング）
                │                              │
        SEOで別URLをインデックス        検索エンジンに登録不要
        させたい                        （URLを増やす理由がない）
                │                              │
                ▼                              ▼
        ★ ページ量産が必要              ★ 1ページ多態でOK
        （エリア×条件ぶんの静的ページ）  （?st= でブロック差し替え）
```

| | エリア別（SEO） | 広告KW別（リスティング） |
|---|---|---|
| 流入元 | Google自然検索 | 広告クリック |
| URL | エリア数だけ分ける | 1枚（`?st=` だけ変わる） |
| ページ数 | 量産が必要 | 1〜数枚 |
| 手法 | プログラマティックSEO（静的生成） | 1ページ多態（JS+CSS） |

---

## 6. Squad beyond での再現方法 ★本題

beyond には2系統の出し分け機構があり、参考サイトの手法を **特殊スタックなし** で再現できる。

### レイヤーA: Branch Operation（分岐）= 広告/パラメータ → 記事バージョンの出し分け
beyond の Branch Operation は `articles / ads / conversion_event_tags / parameters` を束ね、**広告やURLパラメータに応じて配信する記事バージョンを切り替える**機能。コード不要。

- 使いどころ: **粗い単位（記事まるごと / FV単位）** の出し分け。
- 適する軸: **エリア別 / 条件別 / KWグループ別**。
- 設計例:
  - 広告グループ（=KWグループ）ごとに記事バージョンを用意し、Branch で紐付け。
  - 例) 「夜勤なし」広告グループ → 夜勤なし訴求バージョン、「ブランク」広告グループ → 復職支援訴求バージョン。

### レイヤーB: HTMLエディタ版の記事に生JS/CSSを埋め込み（参考サイトと同一手法）
beyond の HTMLエディタ版記事は **生のHTML/CSS/JSをそのまま投入可能**。よって §3 の「`?st=` → classList → CSS表示切替」を **1記事内のFV/ブロック差し替え**としてそのまま移植できる。

- 使いどころ: **1記事の中で**、検索KWに応じてFV見出し・バッジ・訴求ブロックを細かく出し分け。
- Branch（レイヤーA）と併用すると、「粗い分岐 × 記事内の細かい差し替え」の二段構えになる。

### レイヤーC: 動的差し込み（トークン置換）
KWエコー（検索語をそのまま見出しに反映）やエリア名の差し込みは、beyond の動的差し込み or §3 の JS でトークン（例 `{{area}}` `{{kw}}`）を置換して実現。

---

## 7. セグメント軸別レシピ（今回採用する軸）

### 軸1: KWグループ別（ネガティブ/除外を含むKW設計に対応）
- **広告側**: 広告グループ＝意図ごとにKWを分割し、各グループのファイナルURLを `...?st={keyword}&grp=<group_id>` に。除外キーワード（ネガティブKW）で各グループの意図純度を上げる。
- **beyond側**:
  - 粗い分岐 → **Branch Operation** で `grp` ごとに記事バージョンを出し分け。
  - 細かい差し替え → HTMLエディタ版で `?st=` を正規表現判定し、FV見出し/バッジを切替。

```js
// 例: KW意図を判定して <html> にクラス付与（beyond HTMLエディタに貼付）
(function () {
  var p = new URLSearchParams(location.search);
  var st = decodeURIComponent(p.get("st") || "");
  var grp = (p.get("grp") || "").toLowerCase();
  var html = document.documentElement;

  // 条件軸
  if (/夜勤(なし|無し|専従なし)/.test(st)) html.classList.add("kw-yakin-nashi");
  if (/ブランク|復職|復帰/.test(st))      html.classList.add("kw-fukushoku");
  if (/クリニック|外来/.test(st))         html.classList.add("kw-clinic");

  // 年代軸
  if (/(20代|2[0-9]歳)/.test(st)) html.classList.add("age20s");
  else if (/(30代|3[0-9]歳)/.test(st)) html.classList.add("age30s");

  // KWグループ（広告側から明示。除外KW設計で意図純度を担保）
  if (grp) html.classList.add("grp-" + grp.replace(/[^a-z0-9_-]/g, ""));
})();
```

### 軸2: エリア別
- **方針**: 参考サイト同様、SEOを狙うなら **エリアごとに beyond 記事を静的に作成**（Branch で割当 or 個別URL）。広告のみなら `?area=` を受けて見出しのエリア名だけ差し込みでも可。
- **実装（差し込み版）**:

```js
(function () {
  var area = decodeURIComponent(new URLSearchParams(location.search).get("area") || "");
  if (!area) return;
  document.querySelectorAll("[data-area-token]").forEach(function (el) {
    el.textContent = el.getAttribute("data-area-token").replace(/\{area\}/g, area);
  });
})();
```
```html
<h1 data-area-token="{area}で駅近・好条件の看護師求人">あなたのエリアで駅近・好条件の看護師求人</h1>
```

### 軸3: 条件別（夜勤なし / ブランク / クリニック / 復職 など）
- **CSS表示切替（参考サイト方式）**: ブロックを既定非表示にし、KWクラス時のみ表示。

```css
.kw-block { display: none; }
html.kw-yakin-nashi .kw-block.yakin-nashi,
html.kw-fukushoku   .kw-block.fukushoku,
html.kw-clinic      .kw-block.clinic { display: block; }

/* どのKWにも当たらない場合のデフォルト訴求 */
html:not(.kw-yakin-nashi):not(.kw-fukushoku):not(.kw-clinic) .kw-block.default { display: block; }
```
```html
<section class="kw-block yakin-nashi">夜勤なしで働ける求人特集 …</section>
<section class="kw-block fukushoku">ブランクOK・復職支援が手厚い求人 …</section>
<section class="kw-block clinic">クリニック・外来の日勤求人 …</section>
<section class="kw-block default">あなたに合う看護師求人を厳選 …</section>
```

---

## 8. 実装チェックリスト（beyond運用）

- [ ] 広告グループをKW意図別に分割（条件・エリア・年代）。各グループに除外KWを設定して意図純度を上げる。
- [ ] 各広告のファイナルURLに ValueTrack を付与: `?st={keyword}`（必要に応じ `&grp=` `&area=`）。
- [ ] beyond で記事バージョンを用意し、**Branch Operation** で広告/パラメータ → バージョンを割当（粗い出し分け）。
- [ ] FV/記事内の細かい差し替えは **HTMLエディタ版記事**に §7 のJS/CSSを埋め込み。
- [ ] デフォルト（どのKWにも当たらない）表示を必ず用意（パラメータ無し直アクセス対策）。
- [ ] CV計測: クリックID（`gclid`等）の sessionStorage 引き継ぎ + アフィリンク遷移時の `gtag conversion` 発火を実装。
- [ ] 計測タグ（GA4 / 各広告 / Clarity）を beyond のタグ設定 or HTML に設置。

---

## 9. 注意点

- **SEOと出し分けの分離**: ランタイムでFVを書き換える手法は **広告流入向け**。SEO評価を狙うエリアページは「静的生成（=固定の見出し本文）」にするのが参考サイトの作法。両者を混ぜない。
- **CLS/ちらつき**: CSS表示切替方式は、JSが走る前に一瞬デフォルトが見える可能性。`<html>` クラス付与は **`<head>` 内の最速タイミング**で実行する（参考サイトも即時関数を上部に配置）。
- **パラメータ汚染対策**: `st` 等は外部入力。`textContent` で挿入し（`innerHTML` を避け）XSSを防ぐ。正規表現マッチで想定値のみ反映する。
- **AI生成の再現**: 参考サイトは Readdy で土台を生成 → 計測/出し分けJSを後付け、という構成。beyond運用では「AIで記事ドラフト生成 → beyondのHTMLエディタへ流し込み → Branch/JSで出し分け」の流れが等価。

---

## 10. 参考リンク集

### 解析対象サイトで使われていたツール
- **Readdy（AIサイトビルダー / 当サイトの生成元）** — https://readdy.ai/ （日本語: https://readdy.ai/ja ）
  - 解説記事: https://note.com/55clotho/n/n9ad89a8d9472 / https://roboin.io/article/2026/05/12/readdy-ai-website-builder-features-and-how-to-use/
- **Microsoft Clarity（ヒートマップ/セッション録画）** — https://clarity.microsoft.com/
- **Google アナリティクス (GA4)** — https://analytics.google.com/
- **Google タグマネージャー (GTM)** — https://tagmanager.google.com/

### 広告URLに検索KWを渡す（出し分けの入口）
- **Google広告 ValueTrack `{keyword}` について** — https://support.google.com/google-ads/answer/2375447?hl=ja
- **Google広告 ValueTrack でトラッキングを設定** — https://support.google.com/google-ads/answer/6305348?hl=ja
- **Google広告 ValueTrack の活用方法** — https://support.google.com/google-ads/answer/6305529?hl=ja
- **Yahoo!/LINEヤフー広告 トラッキングURL・カスタムパラメータ（検索広告）** — https://ads-help.yahoo-net.jp/s/article/H000044782?language=ja
- **Yahoo!広告 トラッキング用パラメータ** — https://ads-help.yahoo.co.jp/yahooads/ss/articledetail?lan=ja&aid=1061
- 解説（外部）: ValueTrackとは — https://anagrams.jp/blog/how-to-valuetrack-parameter/

> 補足: 参考サイトの `?st=` は独自命名のパラメータ。広告管理画面でファイナルURL/トラッキングテンプレートを `{lpurl}?st={keyword}` のように設定すると、検索語が `st` に自動で入る。

### Squad beyond（再現先のツール）
- **製品・機能** — https://squadbeyond.com/product/ / 概要 — https://squadbeyond.com/overview/
- **Squad beyondとは（機能/事例）** — https://squadbeyond.com/blog/what_is_squadbeyond/
- **ブランチオペレーション（出し分け/最適パターン診断）資料** — https://service.squadbeyond.com/download/branch-operation/
- **配信割合最適化（AIによるCPA改善・ブランチ新機能）** — https://blog.squadbeyond.com/branchoperation_new
- **よく使う機能（コミュニティ）** — https://service.squadbeyond.com/voice/communities/discussion/1747/
- 第三者比較: https://liskul.com/squad-beyond-166351 / https://leango.co.jp/dejam/blog/article0276/

### 実装の基礎技術（MDN）
- **URLSearchParams（URLパラメータ読取）** — https://developer.mozilla.org/ja/docs/Web/API/URLSearchParams
- **Element.classList（クラス付与）** — https://developer.mozilla.org/ja/docs/Web/API/Element/classList
- **Node.textContent（XSS安全なテキスト挿入）** — https://developer.mozilla.org/ja/docs/Web/API/Node/textContent

---

## 11. 用語集

| 用語 | 意味 |
|---|---|
| **ファーストビュー（FV）** | ページを開いた瞬間に見える最上部の領域。CV率を最も左右する。 |
| **リスティング広告** | 検索連動型広告（Google/Yahoo）。ユーザーの検索KWに対して出る広告。 |
| **ValueTrack `{keyword}`** | 広告のリンク先URLに、実際にユーザーが検索したKW等を自動差し込みする仕組み。 |
| **`?st=`（検索語パラメータ）** | 参考サイトが検索KWを受け取るために使う独自URLパラメータ（`search term` の略と推定）。 |
| **出し分け** | 流入元（KW/広告/エリア等）に応じて表示するコンテンツを変えること。 |
| **Branch Operation（ブランチ/分岐）** | Squad beyond の機能。広告/パラメータに応じて配信する記事バージョンを切り替える。コード不要。 |
| **HTMLエディタ版（beyond）** | beyond の記事形式の一つ。生のHTML/CSS/JSをそのまま入稿できるため、参考サイトの手法を移植可能。 |
| **動的差し込み** | トークン（例 `{area}`）を流入情報で置換する機能。 |
| **プログラマティックSEO** | テンプレに地域名等を流し込み、大量のページを自動生成してSEO流入を狙う手法（"中央区"ページがこれ）。 |
| **クリックID（gclid等）** | 広告クリックを一意に識別するID。CV計測の突合に使う。アフィリンクへ引き継ぐ必要がある。 |
| **CLS（Cumulative Layout Shift）** | 表示ズレの指標。JSで後からFVを書き換えると一瞬チラつくため要対策。 |
| **CV（コンバージョン）** | 成果地点（会員登録・申込等）。 |

---

## 付録A: 全部入りコピペ用スニペット（beyond HTMLエディタ想定）

`<head>` のできるだけ上部に置く（チラつき防止のため、まず非表示CSS→判定JSの順）。

```html
<!-- 1) KW別ブロックは既定で非表示にしておく（チラつき防止のため最優先で読む） -->
<style>
  .kw-block, .age20s-badge, .age30s-badge { display: none; }
  html.age20s .age20s-badge,
  html.age30s .age30s-badge { display: block; animation: .5s ease-out ageBadgeSlideIn; }
  html.kw-yakin-nashi .kw-block.yakin-nashi,
  html.kw-fukushoku   .kw-block.fukushoku,
  html.kw-clinic      .kw-block.clinic { display: block; }
  /* どのKWにも当たらない（直アクセス含む）場合のデフォルト */
  html:not(.kw-yakin-nashi):not(.kw-fukushoku):not(.kw-clinic) .kw-block.default { display: block; }
  @keyframes ageBadgeSlideIn { from { opacity:0; transform:translateY(-6px);} to { opacity:1; transform:none;} }
</style>

<!-- 2) 検索KW(?st=)とエリア(?area=)を読み、<html>にクラス付与＆エリア名差し込み -->
<script>
(function () {
  var p   = new URLSearchParams(location.search);
  var st  = decodeURIComponent(p.get("st")   || "");
  var area= decodeURIComponent(p.get("area") || "");
  var grp = (p.get("grp") || "").toLowerCase();
  var h   = document.documentElement;

  // 条件軸
  if (/夜勤(なし|無し|専従なし)/.test(st)) h.classList.add("kw-yakin-nashi");
  if (/ブランク|復職|復帰/.test(st))      h.classList.add("kw-fukushoku");
  if (/クリニック|外来/.test(st))         h.classList.add("kw-clinic");
  // 年代軸
  if (/(20代|2[0-9]歳)/.test(st)) h.classList.add("age20s");
  else if (/(30代|3[0-9]歳)/.test(st)) h.classList.add("age30s");
  // KWグループ（広告側から明示。除外KW設計で意図純度を担保）
  if (grp) h.classList.add("grp-" + grp.replace(/[^a-z0-9_-]/g, ""));

  // エリア名の差し込み（XSS回避のため textContent を使用）
  if (area) {
    document.querySelectorAll("[data-area-token]").forEach(function (el) {
      el.textContent = el.getAttribute("data-area-token").replace(/\{area\}/g, area);
    });
  }
})();
</script>
```

```html
<!-- 3) 本文側：KW別ブロック＋エリアトークン -->
<h1 data-area-token="{area}で駅近・好条件の看護師求人">あなたのエリアで駅近・好条件の看護師求人</h1>

<section class="kw-block yakin-nashi">夜勤なしで働ける求人特集 …</section>
<section class="kw-block fukushoku">ブランクOK・復職支援が手厚い求人 …</section>
<section class="kw-block clinic">クリニック・外来の日勤求人 …</section>
<section class="kw-block default">あなたに合う看護師求人を厳選 …</section>

<span class="age20s-badge">20代の転職に強い！</span>
<span class="age30s-badge">30代のキャリアアップ向け！</span>
```

> 広告側ファイナルURL例: `https://example.com/lp?st={keyword}&area=中央区&grp=yakin`

---

## 付録B: 解析に使った主なファイル

| ファイル | 内容 |
|---|---|
| `*.html`（本体, 約602KB） | レンダリング済みDOM。`?st=`即時関数・CSS表示切替・CV計測・クリックID引継ぎ・schema.org を含む |
| `index-Cui1VGLg.js`（約296KB） | Vite ビルドのSPAシェル（React Router + i18next）。出し分けモジュール名を含む依存マップ |
| `index-CNaZSjJS.css`（約123KB） | `.age20s-badge` 等の表示切替ルール |
| `geo-10972795.js`（約3.4MB） | 別案件のReaddy残骸（未使用） |
| `js`, `js(1)` | GTMコンテナ |
| `f.txt` | gtag.js |
| `8u95wuffon`, `clarity.js` | Microsoft Clarity |
