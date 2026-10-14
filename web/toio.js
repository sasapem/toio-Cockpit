// ============================================================
// Toio: toio コアキューブ を Chrome の Web Bluetooth で直接つなぐ部品
//   const cube=await Toio.connect();   // ボタンを押した中で呼ぶ(ブラウザの決まり)
//   cube.move(左の速さ, 右の速さ)     // -115..115
//   cube.lamp(r,g,b)  cube.sound(番号)  cube.stop()
//   cube.on('position', p=>...)  // マットの上の位置 {x,y,angle}(マットがある時だけ)
//   cube.on('motion', m=>...)    // {flat, collision, doubleTap, posture, shake}
//   cube.on('button', b=>...)    // {pressed}
// ============================================================
const Toio=(()=>{
 const SERVICE='10b20100-5b3b-4571-9508-cf3efcd7bbae';
 const CH={id:'10b20101-5b3b-4571-9508-cf3efcd7bbae',motor:'10b20102-5b3b-4571-9508-cf3efcd7bbae',lamp:'10b20103-5b3b-4571-9508-cf3efcd7bbae',
  sound:'10b20104-5b3b-4571-9508-cf3efcd7bbae',motion:'10b20106-5b3b-4571-9508-cf3efcd7bbae',button:'10b20107-5b3b-4571-9508-cf3efcd7bbae',
  battery:'10b20108-5b3b-4571-9508-cf3efcd7bbae',config:'10b201ff-5b3b-4571-9508-cf3efcd7bbae'};
 const cubes=[];
 class Cube{
  constructor(device){this.device=device;this.name=device.name||'toio';this.ch={};this.listeners={};this.pos=null;this.motion=null;this.battery=null;this.button=false;this.connected=false;this._lastMove=0;this._moveQ=null}
  on(ev,f){(this.listeners[ev]=this.listeners[ev]||[]).push(f);return this}
  _fire(ev,d){for(const f of this.listeners[ev]||[])f(d,this)}
  async _setup(){const server=await this.device.gatt.connect();const svc=await server.getPrimaryService(SERVICE);
   for(const k in CH){try{this.ch[k]=await svc.getCharacteristic(CH[k])}catch(e){}}
   const sub=async(k,f)=>{const c=this.ch[k];if(!c)return;try{await c.startNotifications();c.addEventListener('characteristicvaluechanged',e=>f(e.target.value))}catch(e){}};
   await sub('id',v=>{const t=v.getUint8(0);
    if(t===1){this.pos={x:v.getUint16(1,true),y:v.getUint16(3,true),angle:v.getUint16(5,true),onMat:true};this._fire('position',this.pos)}
    else if(t===2){this.pos={standardId:v.getUint32(1,true),angle:v.getUint16(5,true),onMat:true};this._fire('position',this.pos)}
    else if(t===3||t===4){if(this.pos)this.pos.onMat=false;this._fire('position',this.pos||{onMat:false})}});
   await sub('motion',v=>{this.motion={flat:!!v.getUint8(1),collision:!!v.getUint8(2),doubleTap:v.byteLength>3&&!!v.getUint8(3),posture:v.byteLength>4?v.getUint8(4):0,shake:v.byteLength>5?v.getUint8(5):0};this._fire('motion',this.motion)});
   await sub('button',v=>{this.button=v.getUint8(1)===0x80;this._fire('button',{pressed:this.button})});
   await sub('battery',v=>{this.battery=v.getUint8(0);this._fire('battery',this.battery)});
   try{const b=await this.ch.battery.readValue();this.battery=b.getUint8(0)}catch(e){}
   try{await this.ch.config.writeValue(new Uint8Array([0x18,0x00,0x05,0x01]))}catch(e){}   // 位置の通知: 5(=50ms)ごと、変化があった時
   this.device.addEventListener('gattserverdisconnected',()=>{this.connected=false;this._fire('disconnect')});
   this.connected=true}
  // モーター: 左右 -115..115。送りすぎないように 50ms に1回にまとめる
  move(l,r){this._moveQ=[l,r];const now=performance.now();if(now-this._lastMove<50){if(!this._moveT)this._moveT=setTimeout(()=>{this._moveT=null;this._flush()},50);return}this._flush()}
  _flush(){if(!this._moveQ||!this.ch.motor)return;const [l,r]=this._moveQ;this._moveQ=null;this._lastMove=performance.now();
   const s=v=>Math.min(115,Math.round(Math.abs(v)));const d=v=>v>=0?1:2;
   this.ch.motor.writeValueWithoutResponse(new Uint8Array([0x01,0x01,d(l),s(l),0x02,d(r),s(r)])).catch(()=>{})}
  stop(){this.move(0,0)}
  // 目標の位置へ(マットがある時): x,y はマット座標、angle は向き(0-359)
  goTo(x,y,angle,speed){ // 目標指定つきモーター制御(toio仕様 0x03、13バイト)
   if(!this.ch.motor)return;const a=angle==null?0:(angle&0x1fff);const atype=angle==null?5:0;   // 5=回転しない 0=近い方へ回って向く
   const sp=Math.max(10,Math.min(255,Math.round(speed||50)));
   const b=new Uint8Array([0x03, 0x00, 0x05, 0x00, sp, 0x00, 0x00, x&255,(x>>8)&255, y&255,(y>>8)&255, a&255, ((a>>8)&0x1f)|(atype<<5)]);
   //                    種類  識別  ﾀｲﾑｱｳﾄ 移動型 最大速度 速度変化 予約   目標X            目標Y            目標角度(下13bit)+角度型(上3bit)
   this.ch.motor.writeValueWithoutResponse(b).catch(()=>{})}
  lamp(r,g,b,ms){if(!this.ch.lamp)return;this.ch.lamp.writeValue(new Uint8Array([0x03,Math.min(255,Math.round((ms||0)/10)),0x01,0x01,r,g,b])).catch(()=>{})}
  lampOff(){if(this.ch.lamp)this.ch.lamp.writeValue(new Uint8Array([0x01])).catch(()=>{})}
  sound(id,vol){if(!this.ch.sound)return;this.ch.sound.writeValue(new Uint8Array([0x02,id,vol==null?255:vol])).catch(()=>{})}   // 0..10 の効果音
  note(n,ms,vol){if(!this.ch.sound)return;this.ch.sound.writeValue(new Uint8Array([0x03,0x01,0x01,Math.min(255,Math.round((ms||300)/10)),n,vol==null?255:vol])).catch(()=>{})}
  disconnect(){try{this.stop();this.device.gatt.disconnect()}catch(e){}}
 }
 async function connect(){ // ブラウザの選択画面が出る。必ずボタンなど「人の操作」の中で呼ぶ
  if(!navigator.bluetooth)throw new Error('このブラウザは Bluetooth に対応していません(Chrome を使ってください)');
  const device=await navigator.bluetooth.requestDevice({filters:[{services:[SERVICE]}]});
  const cube=new Cube(device);await cube._setup();cubes.push(cube);return cube}
 return {connect,cubes,SERVICE,Cube}
})();
