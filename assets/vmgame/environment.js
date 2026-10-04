/* Original, source-coordinate effects for the approved 1672 x 941 landscape.
   Water paths deliberately avoid buildings/bridge decks. No artwork is replaced. */
(() => {
  'use strict';
  const W=1672,H=941;
  const waterAreas=[
    [[0,134],[1672,134],[1672,174],[1520,178],[1450,165],[1300,176],[1140,166],[1050,180],[890,168],[760,177],[670,167],[510,181],[370,169],[200,177],[0,161]],
    [[288,414],[327,395],[351,377],[404,400],[469,431],[526,459],[542,504],[509,528],[461,519],[407,491],[350,465],[298,449]],
    [[640,481],[689,508],[745,538],[803,568],[846,589],[844,615],[800,612],[752,600],[702,581],[660,569],[635,550]],
    [[860,601],[921,628],[981,660],[1056,699],[1087,714],[1110,741],[1040,732],[973,705],[910,676],[865,651]],
    [[1076,511],[1143,507],[1204,492],[1244,479],[1257,502],[1224,532],[1214,553],[1232,577],[1271,598],[1360,621],[1480,646],[1590,640],[1672,633],[1672,689],[1620,716],[1570,732],[1514,720],[1432,693],[1351,684],[1268,654],[1195,629],[1126,589],[1076,563]],
    [[711,429],[762,442],[812,446],[847,439],[876,439],[888,459],[925,483],[959,492],[973,506],[919,489],[858,473],[801,451],[741,442]],
    [[1172,260],[1238,272],[1289,276],[1301,285],[1361,298],[1464,301],[1476,317],[1421,329],[1360,323],[1320,307],[1260,298],[1200,289]]
  ];
  const windows=[[737,329],[752,329],[767,329],[781,328],[926,322],[941,326],[957,330],[974,332],[1009,332],[1027,330],[1044,326],[1093,381],[1108,386],[1124,390],[1141,390],[1157,387],[1171,380],[815,355],[831,358],[847,358],[860,351]];
  // Bridge lamp bases sit on the deck; optional third coordinate starts the
  // reflection at water level beneath the arch instead of beneath the lamp.
  const lamps=[[373,312,354],[476,347,397],[590,398,448],[722,454,507],[855,517,570],[999,584,638],[1133,648,704],[864,399],[924,420],[1224,468],[1318,551],[1429,584]];
  function polygon(ctx,points){ctx.moveTo(...points[0]);for(const p of points.slice(1))ctx.lineTo(...p);ctx.closePath();}
  function mount(host,{motion=true,quality='high',night=false}={}){
    const canvas=document.createElement('canvas');canvas.className='vm-environment-canvas';canvas.setAttribute('aria-hidden','true');host.append(canvas);
    const lightCanvas=document.createElement('canvas');lightCanvas.className='vm-environment-canvas vm-light-canvas';lightCanvas.setAttribute('aria-hidden','true');host.append(lightCanvas);
    const waterCtx=canvas.getContext('2d'),lightCtx=lightCanvas.getContext('2d');let ctx=waterCtx,layerController;
    let waterTexture=new Image();const nightTexture=document.createElement('canvas');
    function prepareTexture(){if(!waterTexture.naturalWidth)return;nightTexture.width=waterTexture.naturalWidth;nightTexture.height=waterTexture.naturalHeight;const paint=nightTexture.getContext('2d');paint.filter='brightness(.29) saturate(.6)';paint.drawImage(waterTexture,0,0);render();}
    waterTexture.src='assets/vmgame/art/kingdom.webp';waterTexture.onload=prepareTexture;
    let visible=true,enabled=true,last=0,elapsed=0,frame=0,raf=0,size={width:0,height:0},frameWidth=W,frameHeight=H;
    if(window.VMSceneLayers)VMSceneLayers.mount(host).then(controller=>{layerController=controller;controller.set({motion,enabled});if(controller.background){waterTexture=controller.background;frameWidth=waterTexture.naturalWidth;frameHeight=waterTexture.naturalHeight;clouds.querySelectorAll('image').forEach(image=>image.setAttribute('href',waterTexture.src));prepareTexture();resize()}});
    const water=new Path2D();for(const pts of waterAreas){water.moveTo(...pts[0]);pts.slice(1).forEach(p=>water.lineTo(...p));water.closePath();}
    const clouds=document.createElementNS('http://www.w3.org/2000/svg','svg');clouds.setAttribute('viewBox','0 0 1672 941');clouds.setAttribute('preserveAspectRatio','xMidYMid slice');clouds.setAttribute('aria-hidden','true');clouds.classList.add('vm-cloud-layer');
    const skyId=(host.id||'preview')+'-sky-fade';
    clouds.innerHTML='<defs><linearGradient id="'+skyId+'" x1="0" y1="0" x2="0" y2="1"><stop stop-color="white"/><stop offset=".75" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient><mask id="'+skyId+'-mask"><rect width="1672" height="132" fill="url(#'+skyId+')"/></mask></defs><g mask="url(#'+skyId+'-mask)"><g class="vm-cloud vm-cloud-0"><image href="assets/vmgame/art/kingdom.webp" width="1672" height="941"/><image href="assets/vmgame/art/kingdom.webp" x="1672" width="1672" height="941"/></g></g>';host.append(clouds);
    function resize(){size={width:host.clientWidth,height:host.clientHeight};const dpr=Math.min(devicePixelRatio||1,quality==='low'?1:1.25,(quality==='low'?1280:1800)/Math.max(size.width,size.height,1));canvas.width=lightCanvas.width=Math.round(size.width*dpr);canvas.height=lightCanvas.height=Math.round(size.height*dpr);const cover=Math.max(size.width/frameWidth,size.height/frameHeight),w=frameWidth*cover,h=frameHeight*cover;Object.assign(clouds.style,{width:w+'px',height:h+'px',left:(size.width-w)/2+'px',top:(size.height-h)/2+'px'});clouds.setAttribute('preserveAspectRatio','none');render();}
    function glow(x,y,r,color){const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'rgba(255,185,90,0)');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);}
    function render(){
      for(const surface of [waterCtx,lightCtx]){surface.setTransform(1,0,0,1,0,0);surface.clearRect(0,0,canvas.width,canvas.height)}ctx=waterCtx;if(!enabled||!size.width)return;
      const scale=Math.max(canvas.width/frameWidth,canvas.height/frameHeight),ox=(canvas.width-frameWidth*scale)/2,oy=(canvas.height-frameHeight*scale)/2,sx=scale*frameWidth/W,sy=scale*frameHeight/H;ctx.setTransform(sx,0,0,sy,ox,oy);
      const t=elapsed/1000;
      ctx.save();ctx.clip(water);
      // Refract only clipped water texels; land and bridge silhouettes stay still.
      if(waterTexture.complete&&waterTexture.naturalWidth){ctx.save();ctx.globalAlpha=night?.35:.62;const strip=quality==='low'?20:10,sx=waterTexture.naturalWidth/W,sy=waterTexture.naturalHeight/H,texture=night&&nightTexture.width?nightTexture:waterTexture;for(let y=134;y<742;y+=strip){const dx=Math.sin(y*.045+t*1.7)*2.2,dy=Math.cos(y*.06+t*1.5)*.65;ctx.drawImage(texture,0,y*sy,waterTexture.naturalWidth,strip*sy,dx,y+dy,W,strip+.7)}ctx.restore();}
      // Stream ribbons move through the actual river geometry, not across the UI.
      const count=quality==='low'?85:170;
      for(let i=0;i<count;i++){
        const sea=i<35,x=((i*113.73+t*(sea?18:25))%(W+80))-40,y=(sea?137+i*7.19%37:235+(i*33.19+t*10)%510)+Math.sin(t*1.7+i)*2;
        const width=10+i%24,alpha=(night?.23:.36)+Math.sin(i+t*2)*.12;
        ctx.strokeStyle=night?`rgba(146,218,248,${alpha})`:`rgba(218,255,253,${alpha})`;ctx.lineWidth=1.3+i%3*.4;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+width*.5,y+2,x+width,y-1);ctx.stroke();
      }
      if(night){for(const [x,y,reflectionY] of lamps){for(let j=0;j<12;j++){const yy=(reflectionY||y+12)+j*4,xx=x+Math.sin(t*2+j)*4;ctx.fillStyle=`rgba(255,195,96,${.38*(1-j/12)})`;ctx.fillRect(xx-3-j*.35,yy,6+j*.7,1.6);}}}
      ctx.restore();
      ctx=lightCtx;ctx.setTransform(sx,0,0,sy,ox,oy);
      if(night){
        // Warm arched windows and lamp posts anchored to the existing facades/decks.
        for(const [x,y] of windows){glow(x,y,14,'rgba(255,186,83,.33)');ctx.fillStyle='#ffdaa0';ctx.beginPath();ctx.roundRect(x-2,y-5,4,9,[2,2,0,0]);ctx.fill();}
        for(const [x,y] of lamps){ctx.strokeStyle='#493d37';ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(x,y+3);ctx.lineTo(x,y-12);ctx.stroke();glow(x,y-12,24,'rgba(255,189,87,.42)');ctx.fillStyle='#ffe4b3';ctx.fillRect(x-2.1,y-15,4.2,6);}
        for(let i=0;i<48;i++){const x=i*179.31%W,y=12+i*29.9%101;ctx.fillStyle=`rgba(230,244,255,${.5+.3*Math.sin(t*.9+i)})`;ctx.beginPath();ctx.arc(x,y,i%5===0?1.3:.7,0,Math.PI*2);ctx.fill();}
        glow(1330,65,48,'rgba(190,225,255,.12)');ctx.fillStyle='#e4edf5';ctx.beginPath();ctx.arc(1330,65,12,0,Math.PI*2);ctx.fill();
      }
      canvas.dataset.frame=String(++frame);
    }
    function tick(now){raf=0;if(!motion||document.hidden||!visible||!enabled)return;const delta=last?Math.min(now-last,100):0;if(delta<(quality==='low'?65:32)){raf=requestAnimationFrame(tick);return;}elapsed+=delta;last=now;render();raf=requestAnimationFrame(tick);}
    function sync(){host.classList.toggle('vm-night',night);host.classList.toggle('vm-still',!motion||document.hidden||!visible);host.classList.toggle('vm-low',quality==='low');layerController?.set({motion:motion&&!document.hidden&&visible,enabled});if(raf)cancelAnimationFrame(raf);last=performance.now();render();if(motion&&!document.hidden&&visible&&enabled)raf=requestAnimationFrame(tick);}
    const observer=new ResizeObserver(resize);observer.observe(host);const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync()});intersection.observe(host);
    document.addEventListener('visibilitychange',sync);resize();sync();
    return {set(next={}){if('motion'in next)motion=next.motion;if('quality'in next)quality=next.quality;if('night'in next)night=next.night;if('enabled'in next)enabled=next.enabled;clouds.hidden=!enabled;sync();},canvas};
  }
  window.VMEnvironment={mount,waterAreas,windows,lamps};
})();
