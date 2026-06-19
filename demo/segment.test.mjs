import fs from 'fs';
const FILE=new URL('./nurse-lp-demo.html', import.meta.url);
const html = fs.readFileSync(FILE,'utf8');

const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const segJs = scripts.find(s=>s.includes('classList.add("kw-yakin-nashi")'));
if(!segJs){console.error('判定スクリプトが見つかりません');process.exit(1);}

function run(search){
  const classes=new Set(); const store={};
  const tokenEl={_t:'{area}で看護師求人',getAttribute(){return this._t;},set textContent(v){this._o=v;},get textContent(){return this._o;}};
  const sandbox={
    window:{},                       // 冪等ガード用（runごとに新規＝毎回実行される）
    location:{search,href:'https://demo.test/'+search},
    URLSearchParams, decodeURIComponent,
    sessionStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=v;}},
    document:{
      documentElement:{classList:{add:c=>classes.add(c)}},
      addEventListener:(_e,cb)=>cb(),
      querySelectorAll:sel=> sel==='[data-area-token]'?[tokenEl]:[]
    }
  };
  new Function(...Object.keys(sandbox),segJs)(...Object.values(sandbox));
  return {classes:[...classes],store,area:tokenEl._o};
}

const E=encodeURIComponent;
const cases=[
  ['?st='+E('看護師 夜勤なし 求人'),        ['kw-yakin-nashi']],
  ['?st='+E('准看護師 夜勤 したくない'),     ['kw-yakin-nashi']],
  ['?st='+E('看護師 ブランク 復帰 不安'),    ['kw-fukushoku']],
  ['?st='+E('ママナース 復職'),              ['kw-fukushoku']],
  ['?st='+E('美容クリニック 看護師'),        ['kw-clinic']],
  ['?st='+E('外来 看護師 求人'),             ['kw-clinic']],          // 純クリニック
  ['?st='+E('看護師 外来 日勤のみ'),         ['kw-yakin-nashi']],     // 優先: 夜勤なし>クリニック
  ['?st='+E('看護師 夜勤専従 高収入'),       []],                     // 夜勤希望→誤検出しない
  ['?st='+E('20代 看護師 転職'),             ['age20s']],
  ['?st='+E('看護師 夜勤なし 30代'),         ['kw-yakin-nashi','age30s']],
  ['',                                       []],                     // 直アクセス
];

let ok=0,ng=0;
console.log('=== 出し分け判定テスト（実コード実行）===');
for(const [search,expect] of cases){
  const got=run(search).classes.filter(c=>!c.startsWith('grp-'));
  const pass=expect.every(e=>got.includes(e))&&got.length===expect.length;
  console.log((pass?'✅':'❌')+'  '+decodeURIComponent(search||'(直アクセス)').slice(0,30).padEnd(30)+' → ['+got.join(', ')+']');
  pass?ok++:ng++;
}

console.log('\n=== 付随機能テスト ===');
const r2=run('?st=test&grp=Yakin_01&area='+E('中央区')+'&gclid=ABC123');
for(const [n,p] of [
  ['grpクラス付与', r2.classes.includes('grp-yakin_01')],
  ['エリア差し込み', r2.area==='中央区で看護師求人'],
  ['クリックID保存', JSON.parse(r2.store.tracking_click_ids||'{}').gclid==='ABC123'],
]){console.log((p?'✅':'❌')+'  '+n);p?ok++:ng++;}

console.log('\n=== CSS表示契約チェック ===');
const flat=html.replace(/\s+/g,'');
for(const [n,p] of [
  ['既定で全KWブロック非表示', /\.kw-block,\.age20s-badge,\.age30s-badge\{display:none\}/.test(flat)],
  ['夜勤クラス→夜勤ブロック表示', /html\.kw-yakin-nashi\s+\.kw-block\.yakin-nashi/.test(html)],
  ['default常時表示ルール', /\.kw-block\.default\{display:block\}/.test(flat)],
]){console.log((p?'✅':'❌')+'  '+n);p?ok++:ng++;}

console.log('\n=== 結果: '+ok+' passed / '+ng+' failed ===');
process.exit(ng?1:0);
