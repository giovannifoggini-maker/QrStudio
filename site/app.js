(function(){
'use strict';
const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => Array.from(root.querySelectorAll(selector));
const HISTORY_KEY = 'qrstudio.history.v1';
const PREF_KEY = 'qrstudio.prefs.v1';
const HISTORY_MAX = 30;
let activeView = 'create';
let currentQR = null;
let logoDataUrl = '';
let logoImage = null;
let deferredInstallPrompt = null;
let cameraStream = null;
let detector = null;
let cameraLive = false;
let scanLock = false;
let scannerTimer = 0;
const CAMERA_SCAN_INTERVAL_MS = 260;
const CAMERA_DECODE_MAX_SIDE = 720;
let batchRenderTimer = 0;
let cameraFacingMode = 'environment';
let torchOn = false;
let decoderLoadPromise = null;
const scannerCanvas = document.createElement('canvas');
const scannerContext = scannerCanvas.getContext('2d', {willReadFrequently:true});
let toastTimer = 0;
let historyItems = loadJSON(HISTORY_KEY, []);
let prefs = loadJSON(PREF_KEY, {fg:'#101721',bg:'#ffffff',correction:'M',size:'1024',saveHistory:true,type:'url'});
const levelMap = {L:1,M:0,Q:3,H:2};
const typeNames = {url:'Link / URL',text:'Testo',wifi:'Wi-Fi',email:'Email',phone:'Telefono',sms:'SMS',contact:'Contatto',geo:'GPS'};
function loadJSON(key, fallback){try{const value=JSON.parse(localStorage.getItem(key));return value ?? fallback;}catch{return fallback;}}
function storeJSON(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{toast('Memoria locale non disponibile.','error');return false;}}
function toast(message,type='ok',detail=''){
  const root=$('#toastRegion'); if(!root)return;
  const node=document.createElement('div');node.className='toast'+(type==='error'?' error':'');
  const strong=document.createElement('b');strong.textContent=message;node.append(strong);
  if(detail){const small=document.createElement('small');small.textContent=detail;node.append(small);}
  root.append(node);setTimeout(()=>node.remove(),4200);
}
function safeText(value){return String(value??'').trim();}
function escapeVCard(value){return String(value||'').replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');}
function escapeWifi(value){return String(value||'').replace(/([\\;,:])/g,'\\$1');}
function addField(id,label,placeholder='',type='text',value=''){
  const wrap=document.createElement('div');wrap.className='field-control';
  const lab=document.createElement('label');lab.htmlFor=id;lab.textContent=label.toUpperCase();wrap.append(lab);
  const input=document.createElement(type==='textarea'?'textarea':'input');input.id=id;input.name=id;input.placeholder=placeholder;
  if(type!=='textarea') input.type=type;
  if(value)input.value=value;
  wrap.append(input);return wrap;
}
function addSelectField(id,label,options,initial){
  const wrap=document.createElement('div');wrap.className='field-control';const lab=document.createElement('label');lab.htmlFor=id;lab.textContent=label.toUpperCase();wrap.append(lab);
  const select=document.createElement('select');select.id=id;for(const [val,caption] of options){const opt=document.createElement('option');opt.value=val;opt.textContent=caption;select.append(opt);}select.value=initial;wrap.append(select);return wrap;
}
function addCheck(id,label,checked=false){
  const row=document.createElement('div');row.className='settings-item';row.style.padding='6px 0 0';
  const wrap=document.createElement('label');wrap.style.display='flex';wrap.style.alignItems='center';wrap.style.gap='8px';wrap.style.fontSize='10px';wrap.style.color='#9aabba';
  const input=document.createElement('input');input.id=id;input.type='checkbox';input.checked=checked;input.style.accentColor='var(--mint)';wrap.append(input,document.createTextNode(label));row.append(wrap);return row;
}
function renderTypeFields(type, preserve=false){
  const root=$('#typeFields');root.replaceChildren();
  switch(type){
    case 'url': root.append(addField('mainPayload','Indirizzo web','https://example.com','text','https://')); root.append(makeHint('Un indirizzo senza protocollo verrà completato con https://.')); break;
    case 'text': root.append(addField('mainPayload','Testo da codificare','Scrivi il messaggio che vuoi trasformare in QR…','textarea')); root.append(makeHint('Sono supportati caratteri accentati, emoji e lingue Unicode.')); break;
    case 'wifi': {
      root.append(addField('wifiSsid','Nome rete (SSID)','Nome della rete Wi-Fi'));
      root.append(addField('wifiPassword','Password','Lascia vuoto per rete aperta','text'));
      root.append(addSelectField('wifiSecurity','Sicurezza',[['WPA','WPA / WPA2 / WPA3'],['WEP','WEP (legacy)'],['nopass','Senza password']],'WPA'));
      root.append(addCheck('wifiHidden','Rete nascosta',false));root.append(makeHint('La password non viene salvata nella cronologia. Chiunque scansioni il QR può ottenere le credenziali.'));break;
    }
    case 'email': {
      root.append(addField('emailTo','Destinatario','nome@example.com','email'));
      root.append(addField('emailSubject','Oggetto','Oggetto del messaggio'));
      root.append(addField('emailBody','Messaggio','Testo email (facoltativo)','textarea'));break;
    }
    case 'phone': root.append(addField('phoneNumber','Numero','+39 333 123 4567','tel'));root.append(makeHint('La scansione propone di chiamare il numero codificato.'));break;
    case 'sms': {root.append(addField('smsNumber','Numero destinatario','+39 333 123 4567','tel'));root.append(addField('smsBody','Messaggio','Testo SMS precompilato','textarea'));break;}
    case 'contact': {
      const row=document.createElement('div');row.className='field-inline';row.append(addField('contactFirst','Nome','Mario'),addField('contactLast','Cognome','Rossi'));root.append(row);
      root.append(addField('contactPhone','Telefono','+39 333 123 4567','tel'));root.append(addField('contactEmail','Email','nome@example.com','email'));root.append(addField('contactOrg','Organizzazione','Azienda (facoltativo)'));root.append(makeHint('Esporta un contatto in formato vCard 3.0.'));break;
    }
    case 'geo': {const row=document.createElement('div');row.className='field-inline';row.append(addField('geoLat','Latitudine','45.4642','number'),addField('geoLon','Longitudine','9.1900','number'));root.append(row);root.append(makeHint('Inserisci coordinate decimali comprese tra -90/90 e -180/180.'));break;}
  }
  if(preserve) restoreTypeValues(type);
}
function makeHint(text){const el=document.createElement('p');el.className='hint-line';el.textContent=text;return el;}
const fieldMemory={};
function saveCurrentTypeValues(){const type=$('#qrType').value;const root=$('#typeFields');fieldMemory[type]={};$$('input,textarea,select',root).forEach(el=>{fieldMemory[type][el.id]=el.type==='checkbox'?el.checked:el.value;});}
function restoreTypeValues(type){const data=fieldMemory[type];if(!data)return;for(const [id,value] of Object.entries(data)){const el=$('#'+id);if(el){if(el.type==='checkbox')el.checked=!!value;else el.value=value;}}}
function getField(id){return safeText($('#'+id)?.value);}
function getFormPayload(){
  const type=$('#qrType').value;let payload='',label='';
  switch(type){
    case 'url': {let url=getField('mainPayload');if(!url)throw Error('Inserisci un indirizzo web.');if(!/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(url))url='https://'+url;let parsed;try{parsed=new URL(url);}catch{throw Error('L’indirizzo web non è valido.');}if(!['http:','https:','mailto:','tel:'].includes(parsed.protocol))throw Error('Per sicurezza sono supportati solo link http, https, mailto e tel.');payload=url;label=parsed.hostname||url;break;}
    case 'text': payload=getField('mainPayload');label=payload.slice(0,65)||'Testo';if(!payload)throw Error('Scrivi il testo da codificare.');break;
    case 'wifi': {const ssid=getField('wifiSsid');if(!ssid)throw Error('Inserisci il nome della rete Wi-Fi.');const security=$('#wifiSecurity').value;const password=security==='nopass'?'':getField('wifiPassword');if(security!=='nopass'&&!password)throw Error('Inserisci la password oppure scegli “Senza password”.');payload='WIFI:T:'+security+';S:'+escapeWifi(ssid)+';P:'+escapeWifi(password)+';H:'+($('#wifiHidden').checked?'true':'false')+';;';label='Wi-Fi · '+ssid;break;}
    case 'email': {const to=getField('emailTo');if(!to||!to.includes('@'))throw Error('Inserisci un indirizzo email valido.');const params=new URLSearchParams();if(getField('emailSubject'))params.set('subject',getField('emailSubject'));if(getField('emailBody'))params.set('body',getField('emailBody'));payload='mailto:'+to+(params.size?'?'+params.toString():'');label='Email · '+to;break;}
    case 'phone': {const phone=getField('phoneNumber');if(!phone)throw Error('Inserisci un numero di telefono.');payload='tel:'+phone.replace(/[\s()-]/g,'');label='Telefono · '+phone;break;}
    case 'sms': {const phone=getField('smsNumber');if(!phone)throw Error('Inserisci un numero di telefono.');payload='SMSTO:'+phone.replace(/[\s()-]/g,'')+':'+getField('smsBody');label='SMS · '+phone;break;}
    case 'contact': {const first=getField('contactFirst'),last=getField('contactLast'),phone=getField('contactPhone'),email=getField('contactEmail'),org=getField('contactOrg');if(!first&&!last&&!phone&&!email)throw Error('Inserisci almeno nome, telefono o email.');const lines=['BEGIN:VCARD','VERSION:3.0','N:'+escapeVCard(last)+';'+escapeVCard(first)+';;;','FN:'+escapeVCard((first+' '+last).trim())];if(phone)lines.push('TEL;TYPE=CELL:'+escapeVCard(phone));if(email)lines.push('EMAIL:'+escapeVCard(email));if(org)lines.push('ORG:'+escapeVCard(org));lines.push('END:VCARD');payload=lines.join('\r\n');label='Contatto · '+(first+' '+last).trim();break;}
    case 'geo': {const lat=Number($('#geoLat').value),lon=Number($('#geoLon').value);if(!getField('geoLat')||!getField('geoLon')||!Number.isFinite(lat)||!Number.isFinite(lon)||lat < -90||lat>90||lon < -180||lon>180)throw Error('Coordinate GPS non valide.');payload='geo:'+lat+','+lon;label='GPS · '+lat.toFixed(4)+', '+lon.toFixed(4);break;}
  }
  return {type,payload,label:label||payload.slice(0,65)};
}
function makeMatrix(payload, level){
  if(typeof window.FogQR==='undefined')throw Error('Il motore QR non è stato caricato.');
  const qr=new FogQR.QRCode(0,FogQR.ErrorCorrection[level]??FogQR.ErrorCorrection.M);
  qr.addData(payload);qr.make();const count=qr.getModuleCount();const matrix=[];
  for(let y=0;y<count;y++){const row=[];for(let x=0;x<count;x++)row.push(qr.isDark(y,x));matrix.push(row);}
  return {matrix,count,version:(count-17)/4,level};
}
function drawMatrix(canvas,matrix,options,targetSize=1024,logo=logoImage){
  const count=matrix.count,quiet=4,units=count+quiet*2;const modulePx=Math.max(2,Math.floor(targetSize/units));const dim=units*modulePx;
  canvas.width=dim;canvas.height=dim;const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle=options.bg;ctx.fillRect(0,0,dim,dim);ctx.fillStyle=options.fg;
  for(let y=0;y<count;y++)for(let x=0;x<count;x++)if(matrix.matrix[y][x])ctx.fillRect((x+quiet)*modulePx,(y+quiet)*modulePx,modulePx,modulePx);
  if(logo){const logoPx=Math.max(24,Math.floor(dim*.17));const x=Math.floor((dim-logoPx)/2),y=Math.floor((dim-logoPx)/2),pad=Math.max(5,Math.floor(modulePx*.75));ctx.fillStyle=options.bg;const plate=logoPx+pad*2;const px=Math.floor((dim-plate)/2),py=Math.floor((dim-plate)/2);if(typeof ctx.roundRect==='function'){ctx.beginPath();ctx.roundRect(px,py,plate,plate,Math.floor(modulePx));ctx.fill();}else ctx.fillRect(px,py,plate,plate);ctx.drawImage(logo,x,y,logoPx,logoPx);}
  return {canvas,width:dim,height:dim,modulePx,quiet};
}
function buildSvg(matrix,options,logoData=''){
  const quiet=4,n=matrix.count,total=n+quiet*2,parts=[];
  for(let y=0;y<n;y++){for(let x=0;x<n;x++)if(matrix.matrix[y][x])parts.push(`M${x+quiet} ${y+quiet}h1v1h-1z`);}
  let out=`<svg xmlns="http://www.w3.org/2000/svg" width="${total*10}" height="${total*10}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="QR code generated by QR Studio"><title>QR Studio QR code</title><rect width="${total}" height="${total}" fill="${options.bg}"/><path d="${parts.join('')}" fill="${options.fg}"/>`;
  if(logoData){const w=n*.17,plate=w+1.5,x=(total-w)/2,y=(total-w)/2;out+=`<rect x="${(total-plate)/2}" y="${(total-plate)/2}" width="${plate}" height="${plate}" rx="0.8" fill="${options.bg}"/><image href="${logoData}" x="${x}" y="${y}" width="${w}" height="${w}" preserveAspectRatio="xMidYMid meet"/>`;}
  out+='</svg>';return out;
}
function currentOptions(){return {fg:$('#fgColor').value,bg:$('#bgColor').value,correction:logoImage?'H':$('#correction').value,size:Math.max(256,Math.min(2000,Number($('#exportSize').value)||1024))};}
function setCurrentQR(info,matrix,canvas,options){currentQR={...info,matrix,canvas,options,svg:buildSvg(matrix,options,logoDataUrl)};$('#qrPlaceholder').hidden=true;$('#qrCanvas').hidden=false;$('#logoStamp').hidden=!logoImage;$('#previewTitle').textContent='CODICE PRONTO';$('#previewDetails').textContent=`${info.label} · Livello ${options.correction} · ${canvas.width}×${canvas.height}px`;
  $('#moduleCount').textContent=matrix.count+'×'+matrix.count;$('#downloadPng').disabled=false;$('#downloadSvg').disabled=false;$('#copyPayload').disabled=false;$('#shareQr').disabled=false;if($('#exportProject'))$('#exportProject').disabled=false;$('#runtimeStatus').textContent='QR ENGINE READY';
}
function saveHistory(info,options,matrix){
  if(!prefs.saveHistory||info.type==='wifi')return false;
  const record={id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),type:info.type,payload:info.payload,label:info.label,date:new Date().toISOString(),fg:options.fg,bg:options.bg,correction:options.correction,count:matrix.count};
  historyItems.unshift(record);historyItems=historyItems.slice(0,HISTORY_MAX);storeJSON(HISTORY_KEY,historyItems);renderHistory();return true;
}
function refreshGenerate(){
  try{
    const info=getFormPayload();const options=currentOptions();const matrix=makeMatrix(info.payload,options.correction);const canvas=$('#qrCanvas');const drawn=drawMatrix(canvas,matrix,options,options.size,logoImage);setCurrentQR(info,matrix,canvas,options);const saved=saveHistory(info,options,matrix);
    if(info.type==='wifi')toast('QR Wi-Fi generato','ok','Per privacy, questo codice non viene inserito nella cronologia.');else toast('QR code generato','ok',saved?'Salvato nella cronologia locale.': 'Puoi scaricarlo in PNG o SVG.');
  }catch(error){toast('Impossibile generare il QR', 'error',error?.message||'Controlla il contenuto e riprova.');}
}
function hexToBytes(text){return new TextEncoder().encode(text);}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
function safeFilename(value){return String(value||'qr-studio').normalize('NFKD').replace(/[^\w.-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,50)||'qr-studio';}
function downloadCurrentPng(){if(!currentQR)return;currentQR.canvas.toBlob(blob=>{if(blob)downloadBlob(blob, safeFilename(currentQR.label)+'.png');else toast('Esportazione PNG non riuscita','error');},'image/png');}
function downloadCurrentSvg(){if(!currentQR)return;downloadBlob(new Blob([currentQR.svg],{type:'image/svg+xml;charset=utf-8'}),safeFilename(currentQR.label)+'.svg');}
async function copyText(text){try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);toast('Copiato negli appunti');return;}throw new Error('clipboard unavailable');}catch{const temp=document.createElement('textarea');temp.value=text;temp.style.position='fixed';temp.style.opacity='0';document.body.append(temp);temp.select();const ok=document.execCommand('copy');temp.remove();toast(ok?'Copiato negli appunti':'Copia non disponibile',ok?'ok':'error',ok?'':'Seleziona manualmente il contenuto.');}}
async function shareCurrent(){if(!currentQR)return;try{if(navigator.canShare&&navigator.share&&currentQR.canvas.toBlob){const blob=await new Promise(resolve=>currentQR.canvas.toBlob(resolve,'image/png'));const file=new File([blob],safeFilename(currentQR.label)+'.png',{type:'image/png'});if(navigator.canShare({files:[file]})){await navigator.share({title:'QR Studio',text:currentQR.label,files:[file]});return;}}if(navigator.share){await navigator.share({title:'QR Studio',text:currentQR.payload});return;}await copyText(currentQR.payload);toast('Contenuto copiato: la condivisione non è supportata da questo browser.');}catch(error){if(error?.name!=='AbortError')toast('Condivisione non disponibile','error',error?.message||'');}}
function navigate(view){if(!$('#view-'+view))return;activeView=view;$$('.view').forEach(el=>el.classList.toggle('active',el.id==='view-'+view));$$('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===view));$('#crumbTitle').textContent=({create:'QR GENERATOR',scan:'QR SCANNER',batch:'BATCH EXPORT',history:'LOCAL ARCHIVE',settings:'SYSTEM CONFIG'})[view]||'QR STUDIO';$('#sidebar').classList.remove('mobile-open');window.scrollTo({top:0,behavior:'instant'});if(view==='history')renderHistory();if(view==='scan')updateScannerSupport();}
function updateHistoryCount(){const count=historyItems.length;$('#historyCount').textContent=String(count);$('#historySummary').textContent=count+' ELEMENT'+(count===1?'O':'I');}
function renderHistory(){const grid=$('#historyGrid');grid.replaceChildren();$('#historyEmpty').hidden=historyItems.length>0;updateHistoryCount();for(const item of historyItems){const card=document.createElement('article');card.className='history-card';const thumb=document.createElement('div');thumb.className='history-thumb';const canvas=document.createElement('canvas');thumb.append(canvas);try{const matrix=makeMatrix(item.payload,item.correction||'M');drawMatrix(canvas,matrix,{fg:item.fg||'#101721',bg:item.bg||'#fff'},128,null);}catch{}const data=document.createElement('div');data.className='history-data';const type=document.createElement('div');type.className='history-type';type.textContent=typeNames[item.type]||'QR';const title=document.createElement('b');title.textContent=item.label||item.payload.slice(0,55);const date=document.createElement('small');date.textContent=new Date(item.date).toLocaleString();const actions=document.createElement('div');actions.className='history-card-actions';const reuse=document.createElement('button');reuse.className='mini-action';reuse.textContent='RIAPRI';reuse.addEventListener('click',()=>{try{const matrix=makeMatrix(item.payload,item.correction||'M');const canvas=$('#qrCanvas');const options={fg:item.fg||'#101721',bg:item.bg||'#ffffff',correction:item.correction||'M',size:1024};$('#qrType').value='text';saveCurrentTypeValues();renderTypeFields('text');$('#mainPayload').value=item.payload;$('#fgColor').value=options.fg;$('#bgColor').value=options.bg;$('#correction').value=options.correction;$('#exportSize').value='1024';logoImage=null;logoDataUrl='';const info={type:item.type,payload:item.payload,label:item.label||item.payload.slice(0,55)};drawMatrix(canvas,matrix,options,1024,null);setCurrentQR(info,matrix,canvas,options);navigate('create');toast('QR ripristinato dalla cronologia');}catch(e){toast('Impossibile riaprire il QR','error',e.message);}});const del=document.createElement('button');del.className='mini-action';del.textContent='×';del.setAttribute('aria-label','Elimina elemento');del.addEventListener('click',()=>{historyItems=historyItems.filter(x=>x.id!==item.id);storeJSON(HISTORY_KEY,historyItems);renderHistory();});actions.append(reuse,del);data.append(type,title,date,actions);card.append(thumb,data);grid.append(card);}}
const JSQR_CANDIDATES = [
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
  'https://unpkg.com/jsqr@1.4.0/dist/jsQR.js'
];
function loadScriptOnce(src,timeoutMs=8500){return new Promise((resolve,reject)=>{
  const script=document.createElement('script');let settled=false;const finish=(ok)=>{if(settled)return;settled=true;clearTimeout(timer);if(!ok)script.remove();ok?resolve(true):reject(new Error('Decoder non disponibile'));};
  const timer=setTimeout(()=>finish(false),timeoutMs);script.src=src;script.async=true;script.crossOrigin='anonymous';script.onload=()=>finish(typeof window.jsQR==='function');script.onerror=()=>finish(false);document.head.append(script);
});}
async function ensureJsQR(){
  if(typeof window.jsQR==='function')return true;
  if(!decoderLoadPromise){decoderLoadPromise=(async()=>{for(const src of JSQR_CANDIDATES){try{await loadScriptOnce(src);if(typeof window.jsQR==='function')return true;}catch{}}return false;})().finally(()=>{if(typeof window.jsQR!=='function')decoderLoadPromise=null;});}
  return decoderLoadPromise;
}
function createNativeDetector(){try{return typeof window.BarcodeDetector==='function'?new window.BarcodeDetector({formats:['qr_code']}):null;}catch{return null;}}
function cameraCapability(){return !!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia&&(window.isSecureContext||location.hostname==='localhost'||location.hostname==='127.0.0.1'));}
function updateScannerSupport(){
  const native=!!createNativeDetector(), canCamera=cameraCapability();
  $('#scannerSupport').textContent=window.jsQR?'UNIVERSAL DECODER READY':native?'NATIVE DETECTOR READY':'FALLBACK ON DEMAND';
  $('#scannerNote').textContent=native?'Lettura con fotocamera e immagini: usa il decoder del browser, con fallback JavaScript se necessario. Fotocamera consentita solo su HTTPS o localhost.':window.jsQR?'Decoder JavaScript attivo per immagini e fotocamera. Servono HTTPS o localhost per usare la fotocamera.':'Scanner per immagini e fotocamera: se il browser non ha il rilevatore QR nativo, QR Studio prova a caricare il decoder di riserva al primo utilizzo. Questa prima operazione richiede una connessione internet; i contenuti QR non vengono inviati al servizio che distribuisce il decoder.';
  $('#startCamera').disabled=!canCamera;
  if(!canCamera)$('#scannerNote').textContent='La fotocamera richiede un contesto sicuro (HTTPS o localhost) e il permesso del browser. Puoi comunque caricare un’immagine QR.';
}
function sourceDimensions(source){return {width:source.videoWidth||source.naturalWidth||source.width||0,height:source.videoHeight||source.naturalHeight||source.height||0};}
function sourceToImageData(source,maxSide=1000){
  const {width,height}=sourceDimensions(source);if(!width||!height)throw Error('La sorgente immagine non è ancora pronta.');
  const scale=Math.min(1,maxSide/Math.max(width,height));const w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
  scannerCanvas.width=w;scannerCanvas.height=h;scannerContext.clearRect(0,0,w,h);scannerContext.drawImage(source,0,0,w,h);
  return scannerContext.getImageData(0,0,w,h);
}
function jsQrDecodeSource(source,maxSide=1000){if(typeof window.jsQR!=='function')return null;try{const imageData=sourceToImageData(source,maxSide);const hit=window.jsQR(imageData.data,imageData.width,imageData.height,{inversionAttempts:'attemptBoth'});return hit&&typeof hit.data==='string'?hit.data:null;}catch(error){return null;}}
async function decodeQrSource(source){
  const native=createNativeDetector();
  if(native){try{const hits=await native.detect(source);if(hits&&hits.length&&typeof hits[0].rawValue==='string'&&hits[0].rawValue)return hits[0].rawValue;}catch{}}
  if(typeof window.jsQR!=='function')await ensureJsQR();
  return jsQrDecodeSource(source,1200);
}
function showScanResult(text,sourceLabel='QR'){if(!text)return;stopCamera();$('#scanEmpty').hidden=true;$('#scanResult').hidden=false;$('#scanOutput').value=text;const trimmed=text.trim();let format='TESTO';let url='';if(/^https?:\/\//i.test(trimmed)){format='LINK WEB';try{const parsed=new URL(trimmed);if(['http:','https:'].includes(parsed.protocol))url=parsed.href;}catch{}}else if(/^WIFI:/i.test(trimmed))format='CREDENZIALI WI-FI';else if(/^BEGIN:VCARD/i.test(trimmed))format='VCARD / CONTATTO';else if(/^mailto:/i.test(trimmed))format='EMAIL';else if(/^tel:/i.test(trimmed))format='NUMERO DI TELEFONO';else if(/^geo:/i.test(trimmed))format='COORDINATE GPS';else if(/^SMSTO:/i.test(trimmed)||/^sms:/i.test(trimmed))format='SMS';$('#scanFormat').textContent='FORMATO RILEVATO: '+format+' · '+sourceLabel;$('#openScan').hidden=!url;$('#openScan').dataset.url=url;$('#scanRecent').textContent=trimmed.slice(0,180)+(trimmed.length>180?'…':'');toast('QR letto con successo');}
function stopCamera(){cameraLive=false;torchOn=false;if(scannerTimer)clearTimeout(scannerTimer);scannerTimer=0;scanLock=false;if(cameraStream){cameraStream.getTracks().forEach(track=>track.stop());cameraStream=null;}const video=$('#scannerVideo');video.pause();video.srcObject=null;video.hidden=true;$('#scannerPlaceholder').hidden=false;$('#stopCamera').disabled=true;$('#switchCamera').disabled=true;$('#torchButton').disabled=true;$('#torchButton').textContent='ϟ TORCIA';$('#startCamera').disabled=!cameraCapability();}
async function startCamera(){
  if(!cameraCapability()){toast('Fotocamera non disponibile','error','Apri QR Studio tramite HTTPS o localhost e consenti l’accesso alla fotocamera.');return;}
  try{
    detector=createNativeDetector();
    if(!detector){const loaded=await ensureJsQR();if(!loaded){updateScannerSupport();toast('Decoder QR non raggiungibile','error','Serve una connessione internet al primo uso per caricare il decoder di riserva. Puoi provare un browser con rilevatore QR nativo oppure caricare l’immagine quando il decoder è disponibile.');return;}}
    else {ensureJsQR().then(updateScannerSupport).catch(()=>{});}
    cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:cameraFacingMode},width:{ideal:960},height:{ideal:540},frameRate:{ideal:15,max:20}},audio:false});
    const video=$('#scannerVideo');video.srcObject=cameraStream;await video.play();cameraLive=true;$('#scannerPlaceholder').hidden=true;video.hidden=false;$('#startCamera').disabled=true;$('#stopCamera').disabled=false;$('#switchCamera').disabled=false;
    const track=cameraStream.getVideoTracks()[0];let capabilities={};try{capabilities=track.getCapabilities?track.getCapabilities():{};}catch{}$('#torchButton').disabled=!capabilities.torch;
    updateScannerSupport();scanCameraFrame();toast('Fotocamera attiva','ok',cameraFacingMode==='environment'?'Camera posteriore preferita':'Camera frontale preferita');
  }catch(error){stopCamera();toast('Impossibile avviare la fotocamera','error',error?.message||'Controlla permessi e contesto HTTPS/localhost.');}
}
async function switchCamera(){if(!cameraStream)return;cameraFacingMode=cameraFacingMode==='environment'?'user':'environment';stopCamera();await startCamera();}
async function toggleTorch(){const track=cameraStream?.getVideoTracks?.()[0];if(!track)return;try{torchOn=!torchOn;await track.applyConstraints({advanced:[{torch:torchOn}]});$('#torchButton').textContent=torchOn?'ϟ TORCIA ON':'ϟ TORCIA';}catch(error){torchOn=false;toast('Torcia non supportata','error','La fotocamera selezionata non permette di controllare il flash.');}}
async function scanCameraFrame(){
  if(!cameraLive||document.hidden)return;
  const video=$('#scannerVideo');
  if(!scanLock&&video.readyState>=2){
    scanLock=true;
    try{
      let text=null;
      if(detector){try{const hits=await detector.detect(video);if(hits?.length&&hits[0].rawValue)text=hits[0].rawValue;}catch{}}
      if(!text&&typeof window.jsQR==='function')text=jsQrDecodeSource(video,CAMERA_DECODE_MAX_SIDE);
      if(text){showScanResult(text,detector?'FOTOCAMERA':'FOTOCAMERA / FALLBACK');return;}
    }catch{}finally{scanLock=false;}
  }
  // Schedule only one scan task every 260 ms; do not spin a requestAnimationFrame loop.
  if(cameraLive&&!document.hidden)scannerTimer=window.setTimeout(scanCameraFrame,CAMERA_SCAN_INTERVAL_MS);
}
async function scanImageFile(file){
  if(!file)return;if(!/^image\/(png|jpeg|webp|bmp|gif|avif)$/.test(file.type)&&!file.name.match(/\.(png|jpe?g|webp|bmp|gif|avif)$/i)){toast('Formato immagine non supportato','error','Usa PNG, JPG, WebP, BMP, GIF o AVIF.');return;}
  if(file.size>20*1024*1024){toast('Immagine troppo grande','error','Il limite è 20 MB.');return;}
  let source=null,ownedBitmap=false,objectUrl='';
  try{
    if(typeof createImageBitmap==='function'){source=await createImageBitmap(file);ownedBitmap=true;}
    else {objectUrl=URL.createObjectURL(file);source=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('Immagine illeggibile'));image.src=objectUrl;});}
    let text=await decodeQrSource(source);
    if(text){showScanResult(text,'IMMAGINE IMPORTATA');toast('Immagine QR decodificata');}
    else toast('Nessun QR leggibile','error','Inquadra il codice per intero, con bordo chiaro, contrasto sufficiente e senza sfocatura.');
  }catch(error){toast('Impossibile leggere l’immagine','error',error?.message||'Controlla il formato.');}
  finally{if(ownedBitmap)source?.close?.();if(objectUrl)URL.revokeObjectURL(objectUrl);$('#scanFile').value='';}
}
async function runQrSelfTest(){
  const button=$('#testQrButton'),status=$('#testQrStatus');button.disabled=true;status.className='test-status';status.textContent='Genero il QR campione e verifico la lettura…';
  const sample='QR-STUDIO-SELF-TEST|FOGLABS|PASS';
  try{
    const matrix=makeMatrix(sample,'H'),canvas=document.createElement('canvas');drawMatrix(canvas,matrix,{fg:'#111827',bg:'#ffffff',correction:'H',size:640},640,null);
    let decoded=jsQrDecodeSource(canvas,900);
    if(!decoded){const native=createNativeDetector();if(native){try{const hits=await native.detect(canvas);decoded=hits?.[0]?.rawValue||null;}catch{}}}
    if(!decoded&&typeof window.jsQR!=='function'){await ensureJsQR();decoded=jsQrDecodeSource(canvas,900);}
    if(decoded===sample){status.className='test-status pass';status.textContent='PASS · QR generato e riletto correttamente';showScanResult(decoded,'TEST AUTOMATICO');toast('Test QR superato','ok','Generazione e lettura funzionano in questo browser.');}
    else {status.className='test-status fail';status.textContent='NON VERIFICATO · decoder non disponibile o lettura fallita';toast('Test QR non completato','error','Verifica la connessione al decoder di riserva o prova il browser con rilevatore nativo.');}
  }catch(error){status.className='test-status fail';status.textContent='ERRORE · '+(error?.message||'test fallito');toast('Test QR fallito','error',error?.message||'');}
  finally{button.disabled=false;updateScannerSupport();}
}
async function runSampleImageTest(){
  const status=$('#testQrStatus'),button=$('#testImageButton');button.disabled=true;status.className='test-status';status.textContent='Carico e leggo l’immagine campione…';
  const expected='QR-STUDIO-IMAGE-IMPORT-TEST|FOGLABS|PASS';
  try{
    const image=new Image();image.decoding='async';image.src='./assets/qr-studio-test.png';
    await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Immagine campione mancante'));});
    const decoded=await decodeQrSource(image);
    if(decoded===expected){status.className='test-status pass';status.textContent='PASS · immagine PNG importata e decodificata';showScanResult(decoded,'IMMAGINE CAMPIONE PNG');toast('Test immagine QR superato','ok','Il lettore ha decodificato il PNG campione.');}
    else {status.className='test-status fail';status.textContent='NON VERIFICATO · decoder non disponibile o QR non letto';toast('Test immagine QR non completato','error','Controlla il supporto scanner o la connessione per caricare il decoder di riserva.');}
  }catch(error){status.className='test-status fail';status.textContent='ERRORE · '+(error?.message||'lettura fallita');toast('Test immagine fallito','error',error?.message||'');}
  finally{button.disabled=false;updateScannerSupport();}
}
function createQrFromScan(){const text=$('#scanOutput').value;if(!text)return;stopCamera();saveCurrentTypeValues();$('#qrType').value='text';renderTypeFields('text');$('#mainPayload').value=text;fieldMemory.text={mainPayload:text};navigate('create');refreshGenerate();toast('Contenuto importato nel generatore');}
function exportScanText(){const text=$('#scanOutput').value;if(!text)return;downloadBlob(new Blob([text],{type:'text/plain;charset=utf-8'}),'qr-studio-scanned-content.txt');}
function exportCurrentProject(){
  if(!currentQR){toast('Genera prima un QR','error');return;}
  if((currentQR.type==='wifi'||/^WIFI:/i.test(currentQR.payload))&&!confirm('Il progetto esportato contiene le credenziali Wi-Fi in chiaro. Vuoi continuare?'))return;
  const project={format:'foglabs-qr-studio-project',version:1,createdAt:new Date().toISOString(),type:currentQR.type,label:currentQR.label,payload:currentQR.payload,options:{fg:currentQR.options.fg,bg:currentQR.options.bg,correction:currentQR.options.correction,size:currentQR.options.size},logoDataUrl:logoDataUrl||null};
  downloadBlob(new Blob([JSON.stringify(project,null,2)],{type:'application/json;charset=utf-8'}),safeFilename(currentQR.label)+'.qrstudio.json');toast('Progetto QR esportato','ok','Include contenuto, colori, dimensione, correzione e logo.');
}
function loadLogoDataUrl(dataUrl){return new Promise((resolve,reject)=>{if(!dataUrl){clearLogo();resolve();return;}if(!/^data:image\/(png|jpeg|webp);base64,/i.test(dataUrl)||dataUrl.length>5_800_000){reject(Error('Logo incorporato non valido o troppo grande.'));return;}const image=new Image();image.onload=()=>{logoDataUrl=dataUrl;logoImage=image;$('#logoStatus').textContent='Logo importato dal progetto · correzione H attiva.';$('#clearLogo').hidden=false;$('#correction').value='H';resolve();};image.onerror=()=>reject(Error('Il logo del progetto non è leggibile.'));image.src=dataUrl;});}
async function importProjectFile(file){
  if(!file)return;if(file.size>8*1024*1024){toast('Progetto troppo grande','error','Il limite è 8 MB.');return;}
  try{
    const project=JSON.parse(await file.text());if(project.format!=='foglabs-qr-studio-project'||project.version!==1||typeof project.payload!=='string'||!project.payload.trim())throw Error('Formato progetto non valido. Seleziona un file .qrstudio.json esportato da QR Studio.');
    if(project.payload.length>12000)throw Error('Il contenuto è troppo lungo per essere importato in un QR.');
    const options=project.options||{};$('#fgColor').value=/^#[0-9a-f]{6}$/i.test(options.fg)?options.fg:'#101721';$('#bgColor').value=/^#[0-9a-f]{6}$/i.test(options.bg)?options.bg:'#ffffff';$('#correction').value=['L','M','Q','H'].includes(options.correction)?options.correction:'M';$('#exportSize').value=['512','768','1024','1600'].includes(String(options.size))?String(options.size):'1024';updateColorLabels();
    await loadLogoDataUrl(project.logoDataUrl||null);saveCurrentTypeValues();$('#qrType').value='text';renderTypeFields('text');$('#mainPayload').value=project.payload;fieldMemory.text={mainPayload:project.payload};persistPrefs();navigate('create');refreshGenerate();toast('Progetto importato','ok','Il contenuto del QR è stato ricostruito.');
  }catch(error){toast('Importazione progetto fallita','error',error?.message||'JSON non valido.');}
  finally{$('#projectImportInput').value='';}
}
function countBatch(){return $('#batchInput').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);}
function renderBatchList(){const values=countBatch();$('#batchCount').textContent=values.length+' righe valide';$('#batchEmpty').hidden=values.length>0;const list=$('#batchList');list.replaceChildren();values.slice(0,100).forEach((v,i)=>{const row=document.createElement('div');row.className='batch-entry';const idx=document.createElement('span');idx.className='batch-entry-index';idx.textContent=String(i+1).padStart(2,'0');const text=document.createElement('span');text.className='batch-entry-text';text.textContent=v;row.append(idx,text);list.append(row);});if(values.length>100){const more=document.createElement('div');more.className='hint-line';more.textContent=`Altri ${values.length-100} valori non verranno inclusi nel prossimo archivio.`;list.append(more);}}
function crc32(bytes){let crc=0xffffffff;for(let i=0;i<bytes.length;i++){crc^=bytes[i];for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function concatBytes(parts){const length=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(length);let offset=0;for(const p of parts){out.set(p,offset);offset+=p.length;}return out;}
function zipStore(files){const local=[],central=[];let offset=0;const now=new Date(),dosTime=(now.getHours()<<11)|(now.getMinutes()<<5)|Math.floor(now.getSeconds()/2),dosDate=((Math.max(1980,now.getFullYear())-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate();for(const file of files){const name=hexToBytes(file.name),data=file.data instanceof Uint8Array?file.data:new Uint8Array(file.data),crc=crc32(data);const header=new Uint8Array(30);const d=new DataView(header.buffer);d.setUint32(0,0x04034b50,true);d.setUint16(4,20,true);d.setUint16(6,0x0800,true);d.setUint16(8,0,true);d.setUint16(10,dosTime,true);d.setUint16(12,dosDate,true);d.setUint32(14,crc,true);d.setUint32(18,data.length,true);d.setUint32(22,data.length,true);d.setUint16(26,name.length,true);d.setUint16(28,0,true);local.push(header,name,data);const ch=new Uint8Array(46);const c=new DataView(ch.buffer);c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint16(10,0,true);c.setUint16(12,dosTime,true);c.setUint16(14,dosDate,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint16(30,0,true);c.setUint16(32,0,true);c.setUint16(34,0,true);c.setUint16(36,0,true);c.setUint32(38,0,true);c.setUint32(42,offset,true);central.push(ch,name);offset+=header.length+name.length+data.length;}
  const centralBytes=concatBytes(central),localBytes=concatBytes(local);const end=new Uint8Array(22);const e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(4,0,true);e.setUint16(6,0,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,centralBytes.length,true);e.setUint32(16,localBytes.length,true);e.setUint16(20,0,true);return concatBytes([localBytes,centralBytes,end]);}
const waitFrame=()=>new Promise(resolve=>setTimeout(resolve,0));
async function exportBatch(){const values=countBatch().slice(0,100);if(!values.length){toast('Aggiungi almeno un contenuto','error');return;}if(countBatch().length>100)toast('Limite batch: primi 100 valori','error');const opts=currentOptions();const files=[];const progress=$('#batchProgress');progress.hidden=false;$('#batchExport').disabled=true;try{for(let i=0;i<values.length;i++){const payload=values[i];const matrix=makeMatrix(payload,opts.correction);const canvas=document.createElement('canvas');drawMatrix(canvas,matrix,opts,opts.size,null);const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PNG export failed')),'image/png'));const bytes=new Uint8Array(await blob.arrayBuffer());files.push({name:`${safeFilename($('#batchPrefix').value)}-${String(i+1).padStart(3,'0')}.png`,data:bytes});const pct=Math.round((i+1)/values.length*100);$('#batchProgressLabel').textContent=`Codice ${i+1} di ${values.length}`;$('#batchProgressPct').textContent=pct+'%';$('#batchProgressBar').style.width=pct+'%';await waitFrame();}const zip=zipStore(files);downloadBlob(new Blob([zip],{type:'application/zip'}),safeFilename($('#batchPrefix').value)+'.zip');toast('Archivio ZIP creato', 'ok',`${values.length} QR code esportati. Elaborazione locale.`);}catch(error){toast('Esportazione interrotta','error',error?.message||'');}finally{$('#batchExport').disabled=false;}}
function applyPrefs(){if($('#fgColor'))$('#fgColor').value=prefs.fg||'#101721';if($('#bgColor'))$('#bgColor').value=prefs.bg||'#ffffff';if($('#correction'))$('#correction').value=prefs.correction||'M';if($('#exportSize'))$('#exportSize').value=prefs.size||'1024';if($('#historyToggle'))$('#historyToggle').checked=prefs.saveHistory!==false;updateColorLabels();}
function persistPrefs(){prefs={...prefs,fg:$('#fgColor').value,bg:$('#bgColor').value,correction:$('#correction').value,size:$('#exportSize').value,saveHistory:$('#historyToggle').checked,type:$('#qrType').value};storeJSON(PREF_KEY,prefs);}
function updateColorLabels(){$('#fgHex').textContent=$('#fgColor').value.toUpperCase();$('#bgHex').textContent=$('#bgColor').value.toUpperCase();}
function loadLogo(file){if(!file)return;if(!/^image\/(png|jpeg|webp)$/.test(file.type)){toast('Formato logo non supportato','error','Usa PNG, JPEG o WebP.');return;}if(file.size>4*1024*1024){toast('Logo troppo grande','error','Il limite è 4 MB.');return;}const reader=new FileReader();reader.onload=()=>{const image=new Image();image.onload=()=>{logoDataUrl=String(reader.result);logoImage=image;$('#logoStatus').textContent=`Logo caricato: ${file.name} · correzione H attiva.`;$('#clearLogo').hidden=false;$('#correction').value='H';toast('Logo caricato','ok','Il QR verrà rigenerato con correzione H al prossimo clic.');};image.onerror=()=>toast('Immagine logo non valida','error');image.src=reader.result;};reader.onerror=()=>toast('Impossibile leggere il file logo','error');reader.readAsDataURL(file);}
function clearLogo(){logoDataUrl='';logoImage=null;$('#logoInput').value='';$('#logoStatus').textContent='Nessun logo selezionato. Con logo, la correzione passa automaticamente a H.';$('#clearLogo').hidden=true;}
function exportSettings(){persistPrefs();downloadBlob(new Blob([JSON.stringify(prefs,null,2)],{type:'application/json'}),'qr-studio-settings.json');}
function resetSettings(){if(!confirm('Ripristinare impostazioni e colori predefiniti? La cronologia non verrà eliminata.'))return;prefs={fg:'#101721',bg:'#ffffff',correction:'M',size:'1024',saveHistory:true,type:'url'};storeJSON(PREF_KEY,prefs);applyPrefs();$('#qrType').value='url';renderTypeFields('url');clearLogo();currentQR=null;$('#qrCanvas').hidden=true;$('#qrPlaceholder').hidden=false;$('#downloadPng').disabled=$('#downloadSvg').disabled=$('#copyPayload').disabled=$('#shareQr').disabled=true;if($('#exportProject'))$('#exportProject').disabled=true;toast('Impostazioni ripristinate');}
function setUpEvents(){
  $$('[data-view]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.view)));
  $('#menuToggle').addEventListener('click',()=>$('#sidebar').classList.toggle('mobile-open'));
  $('#qrType').addEventListener('change',()=>{saveCurrentTypeValues();renderTypeFields($('#qrType').value);prefs.type=$('#qrType').value;persistPrefs();});
  $('#generateButton').addEventListener('click',()=>{persistPrefs();refreshGenerate();});
  $('#fgColor').addEventListener('input',updateColorLabels);$('#bgColor').addEventListener('input',updateColorLabels);
  $('#swapColors').addEventListener('click',()=>{const a=$('#fgColor').value;$('#fgColor').value=$('#bgColor').value;$('#bgColor').value=a;updateColorLabels();});
  $('#correction').addEventListener('change',()=>{if(logoImage&&$('#correction').value!=='H'){$('#correction').value='H';toast('Correzione H necessaria per il logo');}});
  $('#logoInput').addEventListener('change',event=>loadLogo(event.target.files[0]));$('#clearLogo').addEventListener('click',clearLogo);
  $('#downloadPng').addEventListener('click',downloadCurrentPng);$('#downloadSvg').addEventListener('click',downloadCurrentSvg);$('#exportProject').addEventListener('click',exportCurrentProject);$('#importProjectTrigger').addEventListener('click',()=>$('#projectImportInput').click());$('#settingsImportProject').addEventListener('click',()=>$('#projectImportInput').click());$('#projectImportInput').addEventListener('change',event=>importProjectFile(event.target.files[0]));$('#copyPayload').addEventListener('click',()=>currentQR&&copyText(currentQR.payload));$('#shareQr').addEventListener('click',shareCurrent);
  $('#startCamera').addEventListener('click',startCamera);$('#stopCamera').addEventListener('click',stopCamera);$('#switchCamera').addEventListener('click',switchCamera);$('#torchButton').addEventListener('click',toggleTorch);$('#testQrButton').addEventListener('click',runQrSelfTest);$('#testImageButton').addEventListener('click',runSampleImageTest);$('#createFromScan').addEventListener('click',createQrFromScan);$('#exportScanText').addEventListener('click',exportScanText);$('#scanFile').addEventListener('change',event=>scanImageFile(event.target.files[0]));$('#copyScan').addEventListener('click',()=>copyText($('#scanOutput').value));$('#openScan').addEventListener('click',()=>{const url=$('#openScan').dataset.url;if(url&&/^https?:\/\//i.test(url))window.open(url,'_blank','noopener,noreferrer');});
  $('#batchInput').addEventListener('input',()=>{clearTimeout(batchRenderTimer);batchRenderTimer=window.setTimeout(renderBatchList,120);});$('#batchExport').addEventListener('click',exportBatch);
  $('#clearHistory').addEventListener('click',()=>{if(!historyItems.length)return;if(!confirm('Vuoi eliminare tutta la cronologia locale?'))return;historyItems=[];storeJSON(HISTORY_KEY,historyItems);renderHistory();toast('Cronologia eliminata');});
  $('#historyToggle').addEventListener('change',()=>{prefs.saveHistory=$('#historyToggle').checked;persistPrefs();toast(prefs.saveHistory?'Salvataggio cronologia attivato':'Salvataggio cronologia disattivato');});$('#exportSettings').addEventListener('click',exportSettings);$('#resetSettings').addEventListener('click',resetSettings);
  $('#helpButton').addEventListener('click',()=>$('#helpDialog').showModal());$('#closeHelp').addEventListener('click',()=>$('#helpDialog').close());$('#helpOk').addEventListener('click',()=>$('#helpDialog').close());
  $('#installButton').addEventListener('click',async()=>{if(deferredInstallPrompt){deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;$('#installButton').disabled=true;}else toast('Installazione dal browser','ok','Apri il menu del browser e scegli “Installa app” o “Aggiungi alla schermata Home”.');});
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstallPrompt=event;$('#installButton').disabled=false;});window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;$('#installButton').disabled=true;toast('QR Studio installato');});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&cameraLive)stopCamera();});
  window.addEventListener('pagehide',stopCamera);
}
function init(){applyPrefs();$('#qrType').value=typeNames[prefs.type]?prefs.type: (['url','text','wifi','email','phone','sms','contact','geo'].includes(prefs.type)?prefs.type:'url');renderTypeFields($('#qrType').value);setUpEvents();renderHistory();renderBatchList();updateScannerSupport();
 if('serviceWorker'in navigator&&/^https?:$/.test(location.protocol)){navigator.serviceWorker.register('./sw.js').then(()=>$('#swStatus').textContent='REGISTRATO').catch(()=>$('#swStatus').textContent='NON DISPONIBILE');}else $('#swStatus').textContent='SOLO WEB';updateScannerSupport();
 if(location.protocol==='file:')$('#runtimeStatus').textContent='LOCAL FILE';
 if(new URLSearchParams(location.search).get('selftest')==='qr')setTimeout(runQrSelfTest,180);
}
document.addEventListener('DOMContentLoaded',init);
})();
