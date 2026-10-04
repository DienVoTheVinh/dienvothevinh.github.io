/* Exact construction formulas; no rounded construction factors or backend state. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VMProof=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y});
  const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y});
  const scale=(a,t)=>({x:a.x*t,y:a.y*t});
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const cross=(a,b)=>a.x*b.y-a.y*b.x;
  function intersect(a,b,c,d){const u=sub(b,a),v=sub(d,c),det=cross(u,v);if(Math.abs(det)<1e-12)throw new RangeError('Hai đường thẳng không có giao điểm duy nhất.');return add(a,scale(u,cross(sub(c,a),v)/det));}
  function construct(t=.6){
    if(!Number.isFinite(t)||t<=0||t>=1)throw new RangeError('G phải nằm trong đoạn AB, khác A và B.');
    const A={x:0,y:2.8},B={x:-1.6,y:.8},C={x:1.6,y:.8};
    const AB=distance(A,B),AC=distance(A,C),BC=distance(B,C),factor=1+BC/AC;
    const E=add(A,scale(sub(C,A),factor)),K=add(A,scale(sub(B,A),factor));
    const G=add(B,scale(sub(A,B),t));
    const F=intersect(G,E,B,C);
    const bisector=add(scale(sub(A,B),1/AB),scale(sub(C,B),1/BC));
    const H=intersect(G,C,B,add(B,bisector));
    return {A,B,C,E,K,G,F,H,t,factor,AB,AC,BC,ratios:{GH_HC:distance(G,H)/distance(H,C),GF_FE:distance(G,F)/distance(F,E),GB_BK:distance(G,B)/distance(B,K),GB_BC:distance(G,B)/BC,AK_AB:distance(A,K)/AB,AE_AC:distance(A,E)/AC}};
  }
  const statements=[
    {id:'ratio-equal',text:'GH/HC = GF/FE'},
    {id:'ratio-whole',text:'GH/GC = GF/GE'},
    {id:'ratio-common',text:'GH/HC = GB/BK và GF/FE = GB/BK'},
    {id:'bisector-ratio',text:'GH/HC = GB/BC'},
    {id:'thales-ratio',text:'GF/FE = GB/BK'},
    {id:'equal-sides',text:'BK = CE = BC'},
    {id:'similar-ratio',text:'AK/AB = AE/AC, nên AK = AE'},
    {id:'wrong-bisector',text:'GH/HC = GC/BC'},
    {id:'wrong-thales',text:'GF/FE = GK/BK'},
    {id:'wrong-side',text:'BK = AB'},
    {id:'wrong-goal',text:'GH/HC = FE/GF'}
  ];
  const theorems=[
    {id:'converse',text:'Thalès đảo trong tam giác GCE'},
    {id:'transitive',text:'Hai tỉ số cùng bằng một tỉ số'},
    {id:'bisector',text:'Tính chất phân giác trong tam giác GBC'},
    {id:'thales-gke',text:'Thalès trong tam giác GKE'},
    {id:'subtract',text:'Trừ các đoạn bằng nhau; dùng CE = BC'},
    {id:'thales-ake',text:'Thalès trong tam giác AKE; AB = AC'},
    {id:'pythagoras',text:'Định lí Pythagore'},
    {id:'area',text:'Công thức diện tích tam giác'}
  ];
  const steps=[
    {id:'goal',number:'01',title:'Tìm điều kiện đủ cho đích đến',premise:'Trong tam giác GCE, H thuộc GC, F thuộc GE; A, C, E thẳng hàng.',statement:'ratio-equal',theorem:'converse',depends:['merge'],hint:'So sánh hai tỉ số chia cạnh GC và GE. Khi nào có thể dùng Thalès đảo?',explain:'GH/HC = GF/FE suy ra HF ∥ CE theo Thalès đảo. Vì A, C, E thẳng hàng nên HF ∥ AC.'},
    {id:'merge',number:'02',title:'Nối hai nhánh bằng một tỉ số chung',premise:'Ta cần GH/HC = GF/FE. Dùng điểm K đã dựng để chọn cùng một tỉ số trung gian.',statement:'ratio-common',theorem:'transitive',depends:['angle','parallel','length'],hint:'Cùng đưa hai tỉ số về GB/BK. Nhánh bên trái còn cần thay BC bằng BK.',explain:'Từ GH/HC = GB/BC và BK = BC, có GH/HC = GB/BK. Ghép với GF/FE = GB/BK được hai tỉ số cần bằng nhau.'},
    {id:'angle',number:'03',title:'Nhánh trái · khai thác đường phân giác',premise:'G nằm trong AB nên tia BG trùng tia BA. BH là phân giác góc GBC và H thuộc GC.',statement:'bisector-ratio',theorem:'bisector',depends:[],hint:'Phân giác từ B chia cạnh GC theo tỉ số hai cạnh kề BG và BC.',explain:'Trong tam giác GBC, BH là phân giác góc GBC nên GH/HC = GB/BC.'},
    {id:'parallel',number:'04',title:'Nhánh phải · khai thác đường song song',premise:'Trong tam giác GKE, B thuộc GK, F thuộc GE và BF ∥ KE vì B, F, C thẳng hàng.',statement:'thales-ratio',theorem:'thales-gke',depends:[],hint:'Thalès cho GB/BK = GF/FE. Chú ý BK là đoạn còn lại, không phải GK.',explain:'BF ∥ KE trong tam giác GKE nên GB/BK = GF/FE theo định lí Thalès.'},
    {id:'length',number:'05',title:'Cầu nối · vì sao thay được BC bằng BK?',premise:'K vượt qua B trên tia AB; E vượt qua C trên tia AC. Ta đã có AK = AE, AB = AC và CE = BC.',statement:'equal-sides',theorem:'subtract',depends:['construction'],hint:'BK = AK − AB và CE = AE − AC. Trừ từng cặp đoạn bằng nhau.',explain:'BK = AK − AB = AE − AC = CE. Theo giả thiết CE = BC, vậy BK = CE = BC.'},
    {id:'construction',number:'06',title:'Gốc sơ đồ · chứng minh tam giác AKE cân',premise:'Dựng K trên tia đối của tia BA sao cho KE ∥ BC. B thuộc AK, C thuộc AE, AB = AC.',statement:'similar-ratio',theorem:'thales-ake',depends:[],hint:'Trong tam giác AKE, BC ∥ KE cho AK/AB = AE/AC. Kết hợp AB = AC.',explain:'BC ∥ KE nên AK/AB = AE/AC. Vì AB = AC, suy ra AK = AE; do đó tam giác AKE cân tại A.'}
  ];
  function check(id,statement,theorem){const step=steps.find(s=>s.id===id);if(!step)throw new RangeError('Bước chứng minh không hợp lệ.');const validStatement=step.statement===statement||(id==='goal'&&statement==='ratio-whole');return {statement:validStatement,theorem:step.theorem===theorem,correct:validStatement&&step.theorem===theorem};}
  return {construct,intersect,distance,cross,sub,statements,theorems,steps,check};
});
