// 「検索語句レポート」をセルフ予測（合成生成）し、出荷コードの判定ロジックで
// 実トラフィック想定の出し分け精度・カバレッジを推定する。
//   実行: node demo/search-terms-report.mjs
//   出力: コンソールのレポート + demo/search-terms-sample.csv
// ※ これは実データではなく、現実的な語彙・分布で生成した「予測用シミュレーション」。
import fs from 'fs';
const html = fs.readFileSync(new URL('./nurse-lp-demo.html', import.meta.url),'utf8');
const segJs = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1])
  .find(s=>s.includes('__lpSegmentInit'));
if(!segJs){console.error('判定スクリプトが見つかりません');process.exit(1);}

function classify(kw){
  const c=new Set();
  const sb={window:{},location:{search:'?st='+encodeURIComponent(kw)},URLSearchParams,decodeURIComponent,
    sessionStorage:{getItem:()=>null,setItem:()=>{}},
    document:{documentElement:{classList:{add:x=>c.add(x)}},addEventListener:()=>{},querySelectorAll:()=>[]}};
  new Function(...Object.keys(sb),segJs)(...Object.values(sb));
  return [...c].find(x=>x.startsWith('kw-')&&x!=='kw-matched')?.replace('kw-','')||'none';
}

// ---- 決定論的PRNG（再現性のため）----
let seed=20260619>>>0;
const rnd=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;seed>>>=0;return seed/4294967296;};
const pick=a=>a[Math.floor(rnd()*a.length)];

// ---- 語彙（真の意図ラベル付き）----
const BASE=['看護師','准看護師','ナース','看護師'];           // 看護師を厚めに
const SUF =['求人','転職','募集','採用','転職サイト','','求人 おすすめ'];
const AREA=['','','','中央区','新宿区','横浜','大阪','名古屋','札幌','福岡','東京','千葉','駅近','沿線'];
const AGE =['','','','','20代','30代','40代','50代','25歳','35歳'];

// 意図グループ: [修飾語, 真ラベル, 相対ボリューム]
const INTENTS=[
  // 夜勤なし
  ['夜勤なし','yakin-nashi',5],['夜勤無し','yakin-nashi',2],['日勤のみ','yakin-nashi',3],
  ['日勤だけ','yakin-nashi',1],['夜勤 したくない','yakin-nashi',1],['夜勤専従なし','yakin-nashi',1],
  ['夜勤少なめ','yakin-nashi',1],['夜勤 減らしたい','yakin-nashi',1],['日勤希望','yakin-nashi',1],
  // ブランク復職
  ['ブランク','fukushoku',4],['復職','fukushoku',3],['復帰','fukushoku',2],['ママナース','fukushoku',2],
  ['主婦 復帰','fukushoku',1],['潜在看護師','fukushoku',1],['ブランクあり','fukushoku',1],['子育て 復帰','fukushoku',1],
  // クリニック
  ['クリニック','clinic',4],['外来','clinic',2],['美容クリニック','clinic',3],['美容看護師','clinic',2],
  ['美容外科','clinic',1],['眼科クリニック','clinic',1],['内科クリニック','clinic',1],['皮膚科クリニック','clinic',1],
  // 夜勤専従 / 治験 / 高収入（新バケット）
  ['夜勤専従','yakin-senju',2],['夜勤バイト','yakin-senju',1],['夜勤のみ','yakin-senju',1],
  ['治験','chiken',1],['CRC','chiken',1],['治験コーディネーター','chiken',1],
  ['高収入','kounyuu',4],['高給','kounyuu',1],['高時給','kounyuu',1],['年収600万','kounyuu',1],
  // none（条件バケット無し＝デフォルト訴求が正）— ロングテールの“他意図”
  ['訪問看護','none',3],['派遣','none',2],['単発','none',2],
  ['パート','none',3],['正社員','none',2],['託児所あり','none',1],['寮あり','none',1],['残業なし','none',2],
  ['残業少ない','none',1],['オペ室','none',1],['ICU','none',1],['健診','none',1],
  ['透析','none',1],['給料','none',1],['','none',8], // 修飾なし=超generic
];

// ---- 生成 ----
const map=new Map(); // query -> {truth, imp, clk}
const weighted=[]; INTENTS.forEach(([m,l,w])=>{for(let i=0;i<w;i++)weighted.push([m,l]);});
const TARGET=280;
let guard=0;
while(map.size<TARGET && guard++<20000){
  const [mod,truth]=pick(weighted);
  const parts=[pick(BASE), mod, pick(AGE), pick(AREA), pick(SUF)].filter(Boolean);
  // 語順を軽くシャッフル（実検索の揺らぎ）
  for(let i=parts.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[parts[i],parts[j]]=[parts[j],parts[i]];}
  const q=parts.join(' ').replace(/\s+/g,' ').trim();
  if(!q||map.has(q)) continue;
  map.set(q,{truth,imp:0,clk:0});
}
// ---- 表示回数はZipf（頭でっかち）、CTRは軽く付与 ----
const rows=[...map.entries()].map(([q,v])=>({q,...v}));
for(let i=rows.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[rows[i],rows[j]]=[rows[j],rows[i]];}
rows.forEach((r,i)=>{ r.imp=Math.max(3,Math.round(4000/(i+3)*(0.6+rnd()*0.8))); r.clk=Math.round(r.imp*(0.01+rnd()*0.05)); });

// ---- 判定 ----
const LABELS=['yakin-nashi','fukushoku','clinic','yakin-senju','chiken','kounyuu','none'];
const conf={};LABELS.forEach(a=>{conf[a]={};LABELS.forEach(b=>conf[a][b]=0);});
let qOK=0, impTotal=0, impPersonalized=0, impMisfire=0, impCorrect=0;
const noneClusters={};
for(const r of rows){
  r.pred=classify(r.q);
  conf[r.truth][r.pred]++;
  impTotal+=r.imp;
  if(r.pred===r.truth){qOK++; impCorrect+=r.imp;}
  if(r.pred!=='none') impPersonalized+=r.imp;
  if(r.truth==='none'&&r.pred!=='none') impMisfire+=r.imp;        // 誤発火
  if(r.truth==='none'){ // 取りこぼし候補のクラスタリング（修飾語で集計）
    for(const key of ['高収入','高給','給料','訪問看護','派遣','単発','パート','正社員','託児所','寮','残業','オペ室','ICU','健診','治験','透析','夜勤専従']){
      if(r.q.includes(key)){noneClusters[key]=(noneClusters[key]||{imp:0,n:0});noneClusters[key].imp+=r.imp;noneClusters[key].n++;}
    }
  }
}
const N=rows.length;
const pct=(a,b)=>(a/b*100).toFixed(1)+'%';

console.log('============ 検索語句レポート（セルフ予測 / 合成）============');
console.log('※ 実データではなく、現実的な語彙・Zipf分布で生成したシミュレーション\n');
console.log('ユニーク検索語句: '+N+' 件   総表示回数(予測): '+impTotal.toLocaleString());
console.log('クエリ単位 正解率: '+pct(qOK,N)+'  ('+qOK+'/'+N+')\n');

console.log('--- 表示回数ベースのカバレッジ ---');
console.log('  個別訴求が出る割合（非default）: '+pct(impPersonalized,impTotal));
console.log('  デフォルト訴求のままの割合      : '+pct(impTotal-impPersonalized,impTotal));
console.log('  ★誤発火（other→条件）の表示割合 : '+pct(impMisfire,impTotal)+'  ← 低いほど安全');
console.log('  判定が正しい表示の割合          : '+pct(impCorrect,impTotal)+'\n');

console.log('--- クラス別（クエリ数 / 表示回数シェア）---');
console.log('class         | queries | impブロック表示シェア');
for(const c of LABELS){
  const qn=rows.filter(r=>r.pred===c).length;
  const im=rows.filter(r=>r.pred===c).reduce((s,r)=>s+r.imp,0);
  console.log('  '+c.padEnd(11)+' | '+String(qn).padStart(5)+'   | '+pct(im,impTotal));
}

console.log('\n--- 混同行列（行=真の意図 / 列=判定）---');
console.log('truth\\pred   '+LABELS.map(l=>l.slice(0,5).padStart(7)).join(''));
for(const r of LABELS) console.log('  '+r.padEnd(11)+LABELS.map(c=>String(conf[r][c]).padStart(7)).join(''));

console.log('\n--- 取りこぼし上位＝新バケット候補（none意図の表示回数シェア）---');
Object.entries(noneClusters).sort((a,b)=>b[1].imp-a[1].imp).slice(0,8)
  .forEach(([k,v])=>console.log('  '+k.padEnd(8)+' : '+pct(v.imp,impTotal).padStart(6)+'  ('+v.n+'クエリ)'));

// 誤発火サンプル
const misfires=rows.filter(r=>r.truth==='none'&&r.pred!=='none');
console.log('\n--- 誤発火サンプル（最大10件 / 0件が理想）---');
if(!misfires.length) console.log('  なし（誤発火0件）');
else misfires.slice(0,10).forEach(r=>console.log('  「'+r.q+'」 → '+r.pred));

// CSV出力
const csv=['query,impressions,clicks,truth,predicted',
  ...rows.sort((a,b)=>b.imp-a.imp).map(r=>`"${r.q}",${r.imp},${r.clk},${r.truth},${r.pred}`)].join('\n');
fs.writeFileSync(new URL('./search-terms-sample.csv',import.meta.url),csv);
console.log('\n→ 明細を demo/search-terms-sample.csv に出力（表示回数降順）');
