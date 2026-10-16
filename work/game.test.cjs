const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

function makeElement(){
  const classes=new Set();
  return {children:[],style:{},dataset:{},textContent:'',disabled:false,_html:'',listeners:{},
    classList:{add(c){classes.add(c)},remove(c){classes.delete(c)},toggle(c,on){const value=on===undefined?!classes.has(c):on;value?classes.add(c):classes.delete(c);return value},contains(c){return classes.has(c)}},
    get innerHTML(){return this._html},set innerHTML(v){this._html=v;this.children=[]},
    append(e){this.children.push(e)},remove(){},addEventListener(type,callback){(this.listeners[type]||=[]).push(callback)},contains(e){return this===e||this.children.some(child=>child.contains(e))},
    querySelector(){return this.mark||(this.mark=makeElement())},querySelectorAll(){return[]},
    getBoundingClientRect(){return {width:1280,height:552,left:0,top:0}},clientWidth:1280,clientHeight:552};
}
function boot(){
  const elements=new Map(),handlers={},cards=['vyron','redwolf','stinger'].map(id=>{let e=makeElement();e.dataset.operator=id;return e});
  const get=s=>{if(!elements.has(s))elements.set(s,makeElement());return elements.get(s)};
  const skills=['ultimate','smoke','cannon'].map(name=>{let e=get(`[data-skill="${name}"]`);e.dataset.skill=name;return e});
  get('#skillTree').querySelectorAll=()=>skills;
  const noop=()=>{};
  get('#canvas').getContext=()=>new Proxy({createRadialGradient:()=>({addColorStop:noop}),measureText:s=>({width:s.length*8})},{get:(o,k)=>k in o?o[k]:noop,set:(o,k,v)=>(o[k]=v,true)});
  const env={Math,console,performance:{now:()=>0},devicePixelRatio:1,setTimeout:noop,cancelAnimationFrame:noop,requestAnimationFrame:()=>1,
    addEventListener(type,cb){(handlers[type]||=[]).push(cb)},document:{querySelector:get,querySelectorAll:s=>s==='.operator-card'?cards:s==='.skill'?skills:[],createElement:makeElement}};
  env.window=env;
  const src=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8').replace('fresh();resize();draw();','globalThis.test={get G(){return G},get keys(){return keys},start,backToSelect,useSkill,toggleCrouch,toggleBackpack,pickupGroundItem,dropItemById,createLoot,startContainerSearch,update,draw,blocked,clearSight,determineLocomotion,explode,shoot,trackAim,EVAC,CONTAINERS};fresh();resize();draw();');
  vm.createContext(env);vm.runInContext(src,env);
  const api=env.test;
  return {...api,get G(){return api.G},get keys(){return api.keys},elements,cards,skills,
    key(code,down=true,repeat=false){for(let cb of handlers[down?'keydown':'keyup']||[])cb({code,key:code,repeat,preventDefault(){}})},
    run(seconds){for(let elapsed=0;elapsed<seconds;){let dt=Math.min(.02,seconds-elapsed);api.update(dt);elapsed+=dt}},
    reset(){api.start();api.G.enemies=[];api.G.spawn=999;api.G.player.x=100;api.G.player.y=450;return api.G.player}};
}
const t=boot();
function check(name,fn){fn();console.log('PASS '+name)}
check('all three operators deploy; only Red Wolf can use X/G/V',()=>{
  for(const card of t.cards){card.onclick();t.start();assert.equal(t.G.player.operator,card.dataset.operator);t.useSkill('ultimate');assert.equal(t.G.player.skills.ultimate.active,card.dataset.operator==='redwolf'?8:0)}
  t.cards[1].onclick();
});
check('idle / walk / sprint / crouch are exclusive and have different speeds',()=>{
  let p=t.reset();t.update(.02);assert.equal(p.fsm.state,'IDLE');t.key('KeyD');t.run(.2);let walk=p.x-100;assert.equal(p.fsm.state,'WALK');
  p=t.reset();t.key('KeyD');t.key('ShiftLeft');t.run(.2);assert.equal(p.fsm.state,'SPRINT');assert(Math.abs((p.x-100)/walk-1.65)<.001);assert(p.stamina<100);
  p=t.reset();t.key('KeyD');t.key('ShiftRight');t.key('KeyC');t.key('KeyC',true,true);t.run(.2);assert.equal(p.fsm.state,'CROUCH');assert(p.crouched);assert(Math.abs((p.x-100)/walk-.52)<.001);
  t.key('KeyC',false);t.key('KeyC');t.update(.02);assert.equal(p.fsm.state,'SPRINT');
});
check('sprint exhaustion waits for 25 stamina instead of alternating every frame',()=>{
  let p=t.reset();p.stamina=.1;t.key('KeyD');t.key('ShiftLeft');t.update(.02);assert(p.exhausted);t.run(.5);assert.equal(p.fsm.state,'WALK');assert(p.exhausted);t.run(1.7);assert.equal(p.fsm.state,'SPRINT');
});
check('X stacks with sprint; repeated activation is blocked by cooldown',()=>{
  let p=t.reset();t.key('KeyD');t.key('ShiftLeft');t.useSkill('ultimate');t.run(.2);assert(Math.abs(p.x-100-190*1.65*1.45*.2)<.001);assert.equal(p.fsm.state,'SPRINT');let cd=p.skills.ultimate.cd;t.useSkill('ultimate');assert.equal(p.skills.ultimate.cd,cd);t.key('KeyD',false);t.run(8);assert.equal(p.skills.ultimate.active,0);assert(p.skills.ultimate.cd>0);t.run(17);assert.equal(p.skills.ultimate.cd,0);
});
check('G creates expiring smoke and blocks sight through the cloud',()=>{
  t.reset();t.useSkill('smoke');assert.equal(t.G.grenades.length,1);t.useSkill('smoke');assert.equal(t.G.grenades.length,1);t.run(1);assert.equal(t.G.smokes.length,1);let s=t.G.smokes[0];assert.equal(t.clearSight({x:s.x-180,y:s.y},{x:s.x+180,y:s.y}),false);t.run(8);assert.equal(t.G.smokes.length,0);
});
check('smoke conceals; crouch reduces fresh detection; nearby enemies still deal damage',()=>{
  const enemy=(x,y)=>({x,y,r:15,hp:3,stun:0,speed:0,angle:0,wander:0,alert:0,lastSeen:null});
  let p=t.reset();let e=enemy(350,450);t.G.enemies=[e];t.update(.02);assert(e.lastSeen);
  p=t.reset();p.crouched=true;e=enemy(350,450);t.G.enemies=[e];t.update(.02);assert.equal(e.lastSeen,null);
  p=t.reset();e=enemy(350,450);t.G.enemies=[e];t.G.smokes=[{x:220,y:450,radius:100,life:6,max:8}];t.update(.02);assert.equal(e.lastSeen,null);
  e.x=p.x;e.y=p.y;t.update(.02);assert.equal(p.hp,88);
});
check('V launches three rounds; central and outer blast damage differ',()=>{
  t.reset();t.useSkill('cannon');assert.equal(t.G.pendingShots.length,3);t.run(.32);assert.equal(t.G.pendingShots.length,0);assert.equal(t.G.grenades.length,3);
  let e=(x)=>({x,y:450,r:15,hp:10,stun:0,dead:false});let center=e(500),outer=e(575),outside=e(620);t.G.enemies=[center,outer,outside];t.explode(500,450);assert.equal(center.hp,6);assert.equal(outer.hp,8);assert.equal(outside.hp,10);
});
check('grenades collide with enemies and walls; no explosive damage through walls',()=>{
  t.reset();t.G.enemies=[{x:300,y:450,r:15,hp:3,stun:0,angle:0,speed:0,wander:0,alert:0,lastSeen:null,dead:false}];t.useSkill('cannon');t.run(.6);assert(t.G.kills>0);
  let p=t.reset();p.x=200;p.y=350;t.trackAim({clientX:300,clientY:250});t.useSkill('smoke');t.run(.6);assert(t.G.smokes[0].y>=320);
  const e={x:240,y:290,r:15,hp:10,stun:0};t.G.enemies=[e];t.explode(240,320);assert.equal(e.hp,10);
});
check('damage state ends; reset clears its HUD; terminal states stop movement',()=>{
  let p=t.reset();let e={x:p.x,y:p.y,r:15,hp:3,stun:0,angle:0,speed:0,wander:0,alert:0,lastSeen:null};t.G.enemies=[e];t.update(.02);assert.equal(p.fsm.state,'HIT');t.G.enemies=[];t.run(.25);assert.equal(p.fsm.state,'IDLE');t.backToSelect();assert.equal(t.elements.get('#fsmState').textContent,'待机');
  p=t.reset();p.hp=1;t.G.enemies=[{...e,x:p.x,y:p.y,stun:0}];t.update(.02);assert.equal(p.fsm.state,'DEAD');let x=p.x;t.key('KeyD');t.run(.1);assert.equal(p.x,x);assert.equal(t.elements.get('#hp').textContent,0);
});
check('E searches a tiered container; Tab inventory picks up its ground loot',()=>{
  t.reset();t.G.player.x=145;t.G.player.y=325;t.key('KeyE');t.run(.9);assert.equal(t.G.bins[0].searched,true);assert(t.G.groundLoot.length>=1);assert.equal(t.G.player.items.length,0);t.key('KeyE',false);t.key('Tab');assert.equal(t.G.backpackOpen,true);let item=t.G.groundLoot[0];t.pickupGroundItem(item.id);assert.equal(t.G.player.items.length,1);assert.equal(t.G.groundLoot.some(i=>i.id===item.id),false);t.key('Tab');assert.equal(t.G.backpackOpen,false);
});
check('each container scatters once; all drops remain reachable and identified',()=>{
  t.reset();const bins=t.G.bins.map(bin=>({...bin}));const allTypes=new Set();
  for(const bin of bins){const p=t.reset(),current=t.G.bins[bin.id],tier=t.CONTAINERS[current.type].tier;allTypes.add(current.type);p.x=current.x;p.y=current.y;t.key('KeyE');t.key('KeyE',false);t.run(2.5);const count=t.G.groundLoot.length;assert(current.searched);assert(count>=tier&&count<=tier+1);assert.equal(p.items.length,0);assert.equal(new Set(t.G.groundLoot.map(item=>item.id)).size,count);for(const item of t.G.groundLoot){assert(!t.blocked(item.x,item.y,8));assert(Math.hypot(item.x-p.x,item.y-p.y)<185)}t.key('KeyE');t.run(3);assert.equal(t.G.groundLoot.length,count);t.draw()}
  assert.equal(allTypes.size,7);
});
check('higher container tiers consistently improve high-rarity outcomes',()=>{
  t.reset();const originalRandom=Math.random;let seed=18456;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
  try{let previousHigh=-1,previousTop=-1;for(let tier=1;tier<=4;tier++){let high=0,top=0;for(let n=0;n<16000;n++){let item=t.createLoot(tier);if(item.tier>=4)high++;if(item.tier>=5)top++;assert(item.tier>=1&&item.tier<=6)}assert(high>previousHigh);assert(top>previousTop);previousHigh=high;previousTop=top}}finally{Math.random=originalRandom}
});
check('full slots, excess weight and distant loot stay on the ground',()=>{
  const p=t.reset();t.toggleBackpack(true);const sample=t.createLoot(1);const spawn=(id,w,x=p.x)=>({...sample,id,w,x,y:p.y,pop:0,phase:0});
  p.items=Array.from({length:10},(_,i)=>({...sample,id:'bag-'+i,w:.1}));p.weight=1;t.G.groundLoot=[spawn('full',.1)];t.pickupGroundItem('full');assert.equal(p.items.length,10);assert.equal(t.G.groundLoot.length,1);
  p.items=[{...sample,id:'heavy',w:11.8}];p.weight=11.8;t.G.groundLoot=[spawn('exact',.2),spawn('over',.1),spawn('distant',.1,p.x+400)];t.pickupGroundItem('exact');assert.equal(p.items.length,2);assert(Math.abs(p.weight-12)<.0001);t.pickupGroundItem('over');assert(t.G.groundLoot.some(item=>item.id==='over'));t.pickupGroundItem('distant');assert(t.G.groundLoot.some(item=>item.id==='distant'));assert.equal(p.items.length,2);
});
check('dragging transfers both ways and repeated pickup preserves one identity',()=>{
  const p=t.reset();t.G.groundLoot=[{...t.createLoot(3),x:p.x,y:p.y,pop:0,phase:0}];const item=t.G.groundLoot[0];t.toggleBackpack(true);
  const fire=(element,type,event)=>{for(const callback of element.listeners[type]||[])callback(event)};const event={preventDefault(){},dataTransfer:{effectAllowed:'',dropEffect:'',setData(){},getData(){return ''}}};
  fire(t.elements.get('#groundList').children[0],'dragstart',event);fire(t.elements.get('#bagDropZone'),'dragover',event);fire(t.elements.get('#bagDropZone'),'drop',event);assert.equal(p.items[0].id,item.id);assert.equal(t.G.groundLoot.length,0);assert(Math.abs(p.weight-item.w)<.0001);
  fire(t.elements.get('#bagGrid').children[0],'dragstart',event);fire(t.elements.get('#groundDropZone'),'drop',event);assert.equal(p.items.length,0);assert.equal(p.weight,0);assert.equal(t.G.groundLoot[0].id,item.id);
  t.pickupGroundItem(item.id);t.pickupGroundItem(item.id);assert.equal(p.items.length,1);assert.equal(p.items[0].id,item.id);assert.equal(t.G.groundLoot.length,0);
});
check('inventory freezes timer and combat; movement or damage interrupts search',()=>{
  let p=t.reset();t.useSkill('ultimate');t.toggleBackpack(true);const time=t.G.time,cd=p.skills.ultimate.cd,ammo=p.ammo;t.key('KeyD');t.key('Space');t.key('KeyG');t.run(2);assert.equal(p.x,100);assert.equal(p.ammo,ammo);assert.equal(t.G.time,time);assert.equal(p.skills.ultimate.cd,cd);assert.equal(p.skills.smoke.cd,0);t.key('Escape');assert.equal(t.G.backpackOpen,false);t.run(.1);assert.equal(p.x,100);
  p=t.reset();p.x=145;p.y=325;t.key('KeyE');t.key('KeyE',false);t.run(.2);t.key('KeyD');t.run(.1);assert.equal(t.G.searching,null);assert(!t.G.bins[0].searched);assert.equal(t.G.groundLoot.length,0);
  t.key('KeyD',false);t.key('KeyE');p.stagger=.22;t.run(.1);assert.equal(t.G.searching,null);assert(!t.G.bins[0].searched);
});
check('pause freezes skill clocks and game timer; restart clears effects and backpack',()=>{
  t.reset();t.useSkill('ultimate');t.key('Escape');let time=t.G.time,cd=t.G.player.skills.ultimate.cd;t.run(2);assert.equal(t.G.time,time);assert.equal(t.G.player.skills.ultimate.cd,cd);t.reset();assert.equal(t.G.smokes.length,0);assert.equal(t.G.pendingShots.length,0);assert.equal(t.G.player.skills.ultimate.cd,0);assert.equal(t.G.backpackOpen,false);
});
check('lever -> power -> open -> extraction remains intact',()=>{
  let p=t.reset();p.items=[{name:'测试潮物',v:1400,w:1,c:'#fff',r:'稀有'}];p.weight=1;p.x=t.EVAC.lever.x;p.y=t.EVAC.lever.y;t.key('KeyE');t.run(1.7);assert.equal(t.G.evac.phase,'powering');t.G.enemies=[];t.G.spawn=999;t.run(8);assert.equal(t.G.evac.phase,'open');p.x=1665;p.y=1070;t.run(2.5);assert.equal(t.G.state,'over');assert.equal(p.fsm.state,'EXTRACTED');assert.equal(t.elements.get('#resultTitle').textContent,'撤离成功');
});
check('time limit failure and canvas render smoke/effects without errors',()=>{t.reset();t.G.time=.01;t.update(.02);assert.equal(t.G.state,'over');t.reset();t.G.smokes.push({x:300,y:450,radius:100,life:4,max:8});t.G.explosions.push({x:200,y:450,r:30,life:.3});t.draw()});
console.log('\nAll gameplay regression checks passed.');
