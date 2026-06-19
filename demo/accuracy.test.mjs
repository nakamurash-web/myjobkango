// 出し分け精度の検証：現実的な看護師リスティングKWに正解ラベルを付け、
// nurse-lp-demo.html 内の「判定スクリプト（実コード）」をそのまま実行して精度を測る。
//   実行: node demo/accuracy.test.mjs
import fs from 'fs';
const html = fs.readFileSync(new URL('./nurse-lp-demo.html', import.meta.url), 'utf8');
const segJs = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1])
  .find(s=>s.includes('classList.add("kw-yakin-nashi")'));
if(!segJs){console.error('判定スクリプトが見つかりません');process.exit(1);}

// 実コードを走らせ、付与された条件クラス/年代クラスを返す
function classify(kw){
  const classes=new Set();
  const sandbox={
    window:{}, location:{search:'?st='+encodeURIComponent(kw)}, URLSearchParams, decodeURIComponent,
    sessionStorage:{getItem:()=>null,setItem:()=>{}},
    document:{documentElement:{classList:{add:c=>classes.add(c)}},addEventListener:()=>{},querySelectorAll:()=>[]}
  };
  new Function(...Object.keys(sandbox),segJs)(...Object.values(sandbox));
  const cond = [...classes].find(c=>c.startsWith('kw-'))?.replace('kw-','') || 'none';
  const age  = [...classes].find(c=>c.startsWith('age')) || 'none';
  return {cond, age};
}

// ===== 条件軸データセット（kw, 正解条件）=====
// 重複KWは「優先順位: 夜勤なし > ブランク > クリニック」で正解を付与
const DATA = [
  // --- 夜勤なし ---
  ['看護師 夜勤なし','yakin-nashi'], ['看護師 夜勤なし 求人','yakin-nashi'],
  ['准看護師 夜勤 したくない','yakin-nashi'], ['看護師 日勤のみ','yakin-nashi'],
  ['看護師 日勤だけ 求人','yakin-nashi'], ['ナース 夜勤無し 転職','yakin-nashi'],
  ['看護師 夜勤専従なし','yakin-nashi'], ['看護師 夜勤 やりたくない','yakin-nashi'],
  ['看護師 日勤希望','yakin-nashi'], ['病棟 夜勤なし 看護師','yakin-nashi'],
  ['看護師 夜勤 嫌','yakin-nashi'], ['看護師 ブランク 夜勤なし','yakin-nashi'], // 重複→優先で夜勤なし
  ['看護師 夜勤少なめ','yakin-nashi'],   // ★既知の穴になりやすい（少なめ）
  ['看護師 夜勤 減らしたい','yakin-nashi'], // ★穴になりやすい

  // --- ブランク復職 ---
  ['看護師 ブランク','fukushoku'], ['看護師 ブランク 復帰','fukushoku'],
  ['看護師 復職','fukushoku'], ['看護師 復職 支援','fukushoku'],
  ['ママナース 求人','fukushoku'], ['ママナース 復職','fukushoku'],
  ['主婦 看護師 復帰','fukushoku'], ['看護師 離職中 復帰','fukushoku'],
  ['潜在看護師 復職','fukushoku'], ['ブランクあり 看護師 転職','fukushoku'],
  ['子育て 看護師 復帰','fukushoku'], ['看護師 ブランク 不安','fukushoku'],
  ['看護師 復帰 怖い','fukushoku'], ['看護師 ブランク 10年','fukushoku'],

  // --- クリニック ---
  ['美容クリニック 看護師','clinic'], ['美容看護師 求人','clinic'],
  ['クリニック 看護師 転職','clinic'], ['外来 看護師 求人','clinic'],
  ['看護師 クリニック 日勤','clinic'], ['眼科 クリニック 看護師','clinic'],
  ['美容外科 看護師','clinic'], ['看護師 外来 パート','clinic'],
  ['皮膚科 看護師 求人','none'],   // ★科目のみ＝バケットなし→default(none)が正
  ['内科 クリニック 看護師','clinic'],

  // --- none（条件バケットなし＝default表示が正）---
  ['看護師 求人','none'], ['看護師 転職','none'], ['看護師 転職サイト おすすめ','none'],
  ['看護師 高収入','none'], ['看護師 高給 求人','none'],
  ['看護師 夜勤専従','none'],            // ★夜勤“希望”→夜勤なしと誤判定しないこと
  ['夜勤専従 看護師 高収入','none'],
  ['訪問看護 求人','none'], ['訪問看護師 転職','none'],
  ['看護師 派遣','none'], ['看護師 単発 バイト','none'], ['看護師 パート','none'],
  ['看護師 正社員','none'], ['オペ室 看護師 求人','none'], ['ICU 看護師 求人','none'],
  ['看護師 求人 東京','none'], ['看護師 給料 高い','none'], ['看護師 寮あり','none'],
  ['看護師 託児所あり','none'], ['看護師 残業少ない','none'], ['看護師 求人 中央区','none'],
];

// ===== 条件軸の評価 =====
const LABELS=['yakin-nashi','fukushoku','clinic','none'];
const conf={}; LABELS.forEach(a=>{conf[a]={}; LABELS.forEach(b=>conf[a][b]=0);});
const miss=[];
let correct=0;
for(const [kw,exp] of DATA){
  const got=classify(kw).cond;
  conf[exp][got]++;
  if(got===exp) correct++; else miss.push({kw,exp,got});
}
const N=DATA.length;

console.log('================ 出し分け精度レポート（条件軸）================');
console.log('サンプル数: '+N+'   全体正解率(Accuracy): '+(correct/N*100).toFixed(1)+'%  ('+correct+'/'+N+')\n');

// クラス別 precision / recall / F1
console.log('--- クラス別 適合率/再現率 ---');
console.log('class         | 正解数 | Precision | Recall |  F1');
for(const c of LABELS){
  const tp=conf[c][c];
  const fp=LABELS.reduce((s,r)=> s + (r!==c?conf[r][c]:0),0);
  const fn=LABELS.reduce((s,p)=> s + (p!==c?conf[c][p]:0),0);
  const support=LABELS.reduce((s,p)=>s+conf[c][p],0);
  const prec=tp+fp? tp/(tp+fp):0, rec=tp+fn? tp/(tp+fn):0;
  const f1=prec+rec? 2*prec*rec/(prec+rec):0;
  console.log(c.padEnd(13)+' | '+String(support).padStart(5)+'  |   '+
    (prec*100).toFixed(0).padStart(3)+'%    |  '+(rec*100).toFixed(0).padStart(3)+'%  | '+(f1*100).toFixed(0).padStart(3)+'%');
}

// 混同行列
console.log('\n--- 混同行列（行=正解 / 列=判定）---');
console.log('exp\\got      '+LABELS.map(l=>l.slice(0,5).padStart(6)).join(''));
for(const r of LABELS){
  console.log(r.padEnd(13)+LABELS.map(c=>String(conf[r][c]).padStart(6)).join(''));
}

// 誤分類リスト
console.log('\n--- 誤分類 ('+miss.length+'件) ---');
miss.forEach(m=>console.log('  「'+m.kw+'」 期待:'+m.exp+' → 判定:'+m.got));

// ===== 年代軸（参考）=====
const AGE=[
  ['20代 看護師 転職','age20s'], ['看護師 25歳 転職','age20s'],
  ['30代 看護師','age30s'], ['看護師 35歳 復職','age30s'],
  ['40代 看護師 転職','none'],   // ★age40sバケットなし→未検出が正
  ['看護師 転職','none'],
];
let aok=0; const amiss=[];
for(const [kw,exp] of AGE){const g=classify(kw).age; g===exp?aok++:amiss.push({kw,exp,got:g});}
console.log('\n================ 年代軸（参考）================');
console.log('正解率: '+(aok/AGE.length*100).toFixed(0)+'%  ('+aok+'/'+AGE.length+')');
amiss.forEach(m=>console.log('  「'+m.kw+'」 期待:'+m.exp+' → 判定:'+m.got));

console.log('\n注: 「none」は“条件バケットに該当せずデフォルト訴求を出すのが正しい”ケース。');
console.log('    誤分類のうち none→他 は誤発火、他→none は取りこぼし（バケット拡張の候補）。');
