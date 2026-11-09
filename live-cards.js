/* Compact NAS histories with one shared range; no provider requests or historical imports. */
(()=>{
 const $=id=>document.getElementById(id),grid=$('liveSensors'),range=$('liveCardRange'),mode=$('liveRangeMode');if(!grid||!range)return;
 const config={lightning:{metrics:['lightning_count'],unit:'',type:'lightning'},thermohygro:{metrics:['temperature_c'],names:['Temperatur'],unit:'°C',type:'line',connectGaps:true},rain:{metrics:['rain_total_mm'],names:['Niederschlag'],unit:'mm',type:'rain'},solar:{metrics:['solar_wm2'],names:['Solarstrahlung'],unit:'W/m²',type:'bars'},wind:{metrics:['wind_kmh','gust_kmh'],names:['Wind Mittel','Böe'],unit:'km/h',type:'line'},pressure:{metrics:['pressure_hpa'],names:['Luftdruck'],unit:'hPa',type:'line'}};
 let historyController=null;let snapshot=null,revision=0,cached=new Map(),clipNumber=0;const axisCache=new Map(),plotObservers=new Set();const clearPlotObservers=()=>{for(const observer of plotObservers)observer.disconnect();plotObservers.clear()};
 try{const saved=localStorage.getItem('wetter.liveCardRange');if(['1','2','6','24','168','720','8760'].includes(saved))range.value=saved}catch(e){}
 const defaults={thermohygro:['Temperatur & Feuchte','#d87543'],rain:['Niederschlag','#3e91c9'],wind:['Wind','#298b79'],pressure:['Luftdruck','#8274ba'],solar:['Solarstrahlung & UV','#c8941e'],lightning:['Gewitter','#a06bc6']};
 let display={order:[],colors:{}},arranging=false;try{const stored=JSON.parse(localStorage.getItem('wetter.liveDisplay')||'{}');if(Array.isArray(stored.order))display.order=[...new Set(stored.order.filter(k=>typeof k==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(k)))].slice(0,100);for(const kind of Object.keys(defaults))if(/^#[0-9a-f]{6}$/i.test(stored.colors?.[kind]))display.colors[kind]=stored.colors[kind]}catch(e){}
 const saveDisplay=()=>{try{localStorage.setItem('wetter.liveDisplay',JSON.stringify(display))}catch(e){$('liveAppearanceStatus').textContent='Für diese Sitzung übernommen; dauerhaftes Speichern nicht verfügbar.'}};
 function orderControls(){const cards=[...grid.querySelectorAll('[data-sensor-key]')];cards.forEach((card,index)=>{let controls=card.querySelector('.live-order-controls');if(!controls){controls=document.createElement('div');controls.className='live-order-controls';controls.setAttribute('role','group');controls.setAttribute('aria-label','Reihenfolge – '+card.querySelector('h3').textContent);for(const [step,symbol,label]of [[-1,'↑','nach vorne'],[1,'↓','nach hinten']]){const button=document.createElement('button');button.type='button';button.textContent=symbol;button.setAttribute('aria-label',card.querySelector('h3').textContent+' '+label);button.onclick=()=>{const neighbor=step<0?card.previousElementSibling:card.nextElementSibling;if(!neighbor)return;if(step<0)grid.insertBefore(card,neighbor);else grid.insertBefore(neighbor,card);display.order=[...grid.querySelectorAll('[data-sensor-key]')].map(c=>c.dataset.sensorKey);saveDisplay();orderControls()};controls.append(button)}card.prepend(controls)}controls.hidden=!arranging;controls.children[0].disabled=index===0;controls.children[1].disabled=index===cards.length-1})}
 const scaleSpecs={
  thermometer:['Thermometer','°C',-20,40],thermohygro:['Temperaturdiagramm','°C',-20,40],
  rain:['Niederschlagsdiagramm','mm',0,100],rainTank:['Niederschlag · Wasserbehälter','mm',0,100],wind:['Wind und Böen','km/h',0,100],pressure:['Luftdruckdiagramm','hPa',920,1040],barometer:['Barometer · Meereshöhe','hPa',970,1050],barometerZones:['Barometer · Farbzonen','hPa',1005,1020],
  solar:['Solarstrahlungsdiagramm','W/m²',0,1200],solarMeter:['Solarstrahlung · Säule','W/m²',0,1200],lightning:['Gewitter · Anzahl','Blitze',0,1000],distance:['Gewitter · Entfernung','km',0,40]
 };
 const scaleDefaults=()=>Object.fromEntries(Object.entries(scaleSpecs).map(([key,spec])=>[key,spec.slice(2)]));
 const gaugeKeys=new Set(['thermometer','rainTank','solarMeter','barometer','barometerZones']);
 const defaultPressureColors={low:'#438fbe',high:'#bd882e'};
 const validColor=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
 const defaultStationHeight=575;
 let scales=scaleDefaults(),customCharts=false,customGauges=false,stationHeight=defaultStationHeight;
 let pressureColors={...defaultPressureColors};
 const validHeight=value=>Number.isFinite(value)&&value>=-500&&value<=5000;
 function validScale(key,low,high){return Number.isFinite(low)&&Number.isFinite(high)&&high>low&&Number.isFinite(high-low)&&(key==='thermometer'?low<0&&high>0:['thermohygro','pressure'].includes(key)||low>=0)}
 try{
  const saved=JSON.parse(localStorage.getItem('wetter.liveScales')||'{}');
  if(validHeight(saved.stationHeight))stationHeight=saved.stationHeight;
  for(const key of Object.keys(scales)){
   let pair=saved.bounds?.[key];
   if(!Array.isArray(pair)||!validScale(key,...pair))continue;
   if(key==='barometer'&&saved.barometerBasis!=='sea-level'){
    pair=pair.map(value=>WeatherLiveCardData.seaLevelPressure(value,15,stationHeight));
   }
   // Earlier versions saved the converted bounds at full floating-point precision.
   if(key==='barometer'&&validScale(key,...pair)&&pair.some(value=>Math.abs(value-Number(value.toFixed(6)))>1e-9)){
    const rounded=pair.map(value=>Math.round(value*10)/10);
    if(validScale(key,...rounded))pair=rounded;
   }
   if(validScale(key,...pair))scales[key]=pair.slice(0,2);
  }
  customCharts=(saved.customCharts??saved.custom)===true;
  customGauges=(saved.customGauges??saved.custom)===true;
  for(const key of Object.keys(pressureColors)){
   if(validColor(saved.pressureColors?.[key]))pressureColors[key]=saved.pressureColors[key];
  }
 }catch(e){}
 const bounds=(key,low,high)=>customCharts&&scales[key]?scales[key]:[low,high];
 function gaugeBounds(key,value){
  if(customGauges)return scales[key];
  if(!Number.isFinite(value))return scaleSpecs[key].slice(2);
  if(key==='thermometer'){
   return [Math.min(-10,Math.floor((value-5)/10)*10),Math.max(20,Math.ceil((value+5)/10)*10)];
  }
  if(key==='barometer'){
   const center=Math.round(value/20)*20;
   return [Math.min(center-20,scales.barometerZones[0]-10),Math.max(center+20,scales.barometerZones[1]+10)];
  }
  if(key==='solarMeter')return [0,Math.max(200,Math.ceil(value*1.1/200)*200)];
  const target=Math.max(5,value*1.2);
  const magnitude=10**Math.floor(Math.log10(target));
  return [0,[1,2,5,10].map(step=>step*magnitude).find(limit=>limit>=target)];
 }
 function thermometer(){
  for(const card of grid.querySelectorAll('[data-sensor-kind=thermohygro]')){
   const upper=card.querySelector('.live-temperature-upper');let meter=upper.querySelector('.live-thermometer');
   if(!meter){meter=document.createElement('div');meter.className='live-thermometer';upper.prepend(meter)}
   const value=snapshot?.sensors.find(s=>s.key===card.dataset.sensorKey)?.observation?.values?.temperature_c,[low,high]=gaugeBounds('thermometer',value);
   const y=t=>88-(Math.max(low,Math.min(high,t))-low)/(high-low)*82,zero=y(0),id='thermo-'+(++clipNumber);
   const percent=n=>n+'%';
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('role','img');
   svg.setAttribute('aria-label','Thermometer: '+(Number.isFinite(value)?num(value)+' °C':'kein Messwert')+' · Skala '+low+' bis '+high+' °C');
   const add=(tag,attrs,content,parent=svg)=>{const node=document.createElementNS(svg.namespaceURI,tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,v);if(content!==undefined)node.textContent=content;parent.append(node);return node};
   const defs=add('defs',{}),gradient=add('linearGradient',{id,x1:0,y1:0,x2:0,y2:1},undefined,defs),split=(zero-6)/82;
   for(const [offset,color] of [[0,'#ef454c'],[split,'#ffc870'],[split,'#91e4ff'],[1,'#245dc7']])add('stop',{offset,'stop-color':color},undefined,gradient);
   add('rect',{x:5,y:'6%',width:4,height:'82%',rx:2,fill:'url(#'+id+')'});
   add('rect',{x:21,y:'4%',width:16,height:'87%',rx:8,fill:'var(--bg)',stroke:'var(--muted)'});
   add('circle',{cx:29,cy:'91%',r:10,fill:'var(--bg)',stroke:'var(--muted)'});
   if(Number.isFinite(value)){
    const color=value<0?'#64bdf7':'#ed665a',top=y(value);
    add('rect',{x:25,y:percent(top),width:8,height:percent(91-top),rx:3,fill:color});
    add('circle',{cx:29,cy:'91%',r:6,fill:color});
   }
   const targetStep=(high-low)/6;
   const magnitude=10**Math.floor(Math.log10(targetStep));
   const majorStep=([1,2,5,10].find(step=>step*magnitude>=targetStep)||10)*magnitude;
   const labels=[high,0,low];
   if(Number.isFinite(majorStep)&&majorStep>0){
    const minorStep=majorStep/5;
    const firstTick=Math.ceil(low/minorStep);
    for(let i=0;i<=35;i++){
     const index=firstTick+i,t=index*minorStep;
     if(t>high+minorStep*1e-8)break;
     const major=index%5===0;
     const yy=percent(y(t));
     add('line',{x1:41,x2:major?49:45,y1:yy,y2:yy,stroke:'var(--muted)','stroke-width':.65});
     if(major&&labels.every(v=>Math.abs(y(v)-y(t))>=8))labels.push(t);
    }
   }
   add('line',{x1:1,x2:52,y1:percent(zero),y2:percent(zero),stroke:'var(--text)','stroke-width':1.6});
   for(const v of labels){
    const yy=y(v);
    if(v!==0&&Math.abs(zero-yy)<8)continue;
    const label=v!==0&&Math.abs(v)<.01?Number(v.toPrecision(3)).toString():v.toLocaleString('de-CH',{maximumFractionDigits:2});
    add('text',{x:53,y:percent(yy),dy:3,fill:v===0?'var(--text)':'var(--muted)','font-size':9,'font-weight':v===0?700:500},label);
   }
   meter.replaceChildren(svg);
  }
 }
 function solarMeter(){
  for(const card of grid.querySelectorAll('[data-sensor-kind=solar]')){
   const upper=card.querySelector('.live-solar-upper');
   let meter=upper.querySelector('.live-solar-meter');
   if(!meter){
    meter=document.createElement('div');
    meter.className='live-solar-meter';
    upper.append(meter);
   }
   const value=snapshot?.sensors.find(sensor=>sensor.key===card.dataset.sensorKey)?.observation?.values?.solar_wm2;
   const [low,high]=gaugeBounds('solarMeter',value);
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
   svg.setAttribute('role','img');
   const reading=Number.isFinite(value)?num(value)+' W/m²':'kein Messwert';
   svg.setAttribute('aria-label','Solarstrahlung '+reading+' · Skala '+low+' bis '+high+' W/m²');
   const add=(tag,attributes,label,parent=svg)=>{
    const element=document.createElementNS(svg.namespaceURI,tag);
    for(const [name,attribute] of Object.entries(attributes))element.setAttribute(name,attribute);
    if(label!==undefined)element.textContent=label;
    parent.append(element);
    return element;
   };
   const id='solar-meter-'+(++clipNumber);
   const defs=add('defs',{});
   const gradient=add('linearGradient',{id,x1:0,y1:1,x2:0,y2:0},undefined,defs);
   add('stop',{offset:0,'stop-color':'var(--sensor)'},undefined,gradient);
   add('stop',{offset:1,'stop-color':'#ffe49c'},undefined,gradient);
   add('rect',{x:2,y:'8%',width:12,height:'84%',rx:6,fill:'var(--bg)',stroke:'var(--muted)','stroke-width':1.25});
   if(Number.isFinite(value)){
    const fill=Math.max(0,Math.min(1,(value-low)/(high-low)))*84;
    if(fill>0)add('rect',{x:3,y:(92-fill)+'%',width:10,height:fill+'%',rx:5,fill:'url(#'+id+')'});
   }
   for(let i=0;i<=16;i++){
    const y=(92-84*i/16)+'%',major=i%4===0;
    add('line',{x1:17,x2:major?24:21,y1:y,y2:y,stroke:'var(--muted)','stroke-width':.7});
    if(major)add('text',{x:27,y,dy:3,fill:'var(--muted)','font-size':9},num(low+(high-low)*i/16));
   }
   meter.replaceChildren(svg);
  }
 }
 function rainTank(card){
  const readings=card.querySelector('.live-rain-values');
  const reading=readings.querySelector('[data-live-stat=rain24]');
  const value=reading.dataset.value===undefined?null:Number(reading.dataset.value);
  let meter=readings.querySelector('.live-rain-tank');
  if(!meter){
   meter=document.createElement('div');
   meter.className='live-rain-tank';
   readings.prepend(meter);
  }
  const [low,high]=gaugeBounds('rainTank',value);
  const top=17,bottom=115,level=bottom-(bottom-top)*Math.max(0,Math.min(1,(value-low)/(high-low)));
  const id='rain-water-'+(++clipNumber);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 94 132');
  svg.setAttribute('role','img');
  svg.setAttribute('aria-label','Regenmenge · '+(value===null?'kein Messwert':num(value,value>50?0:1)+' mm')+' · Skala '+num(low)+' bis '+num(high)+' mm');
  svg.innerHTML=`
   <defs>
    <linearGradient id="${id}">
     <stop stop-color="var(--sensor)" stop-opacity=".62"/>
     <stop offset=".55" stop-color="var(--sensor)"/>
     <stop offset="1" stop-color="var(--sensor)" stop-opacity=".72"/>
    </linearGradient>
   </defs>
   <path d="M7 17H48V115A20.5 7 0 0 1 7 115Z" fill="var(--bg)"/>
   ${value!==null&&level<bottom?`<path d="M7 ${level}H48V115A20.5 7 0 0 1 7 115Z" fill="url(#${id})"/>
   <ellipse cx="27.5" cy="${level}" rx="20.5" ry="7" fill="var(--sensor)" stroke="var(--panel)" stroke-opacity=".45"/>`:''}
   <path d="M7 17V115A20.5 7 0 0 0 48 115V17" fill="none" stroke="var(--muted)" stroke-width="1.25"/>
   <ellipse cx="27.5" cy="17" rx="20.5" ry="7" fill="none" stroke="var(--muted)" stroke-width="1.25"/>
   <path d="M12 26V109" stroke="var(--text)" stroke-opacity=".22" stroke-linecap="round"/>
  `;
  for(let i=0;i<=8;i++){
   const y=bottom-(bottom-top)*i/8,major=i%2===0;
   const tick=document.createElementNS(svg.namespaceURI,'line');
   for(const [key,v] of Object.entries({x1:53,x2:major?60:57,y1:y,y2:y,stroke:'var(--muted)'}))tick.setAttribute(key,v);
   svg.append(tick);
   if(major){
    const label=document.createElementNS(svg.namespaceURI,'text');
    label.setAttribute('x',63);label.setAttribute('y',y+3);
    label.setAttribute('fill','var(--muted)');label.setAttribute('font-size',10);
    label.textContent=num(low+(high-low)*i/8);
    svg.append(label);
   }
  }
  meter.replaceChildren(svg);
 }
 function rainTanks(){for(const card of grid.querySelectorAll('[data-sensor-kind=rain]'))rainTank(card)}
 function barometer(){
  for(const card of grid.querySelectorAll('[data-sensor-kind=pressure]')){
   const upper=card.querySelector('.live-pressure-upper');
   let meter=upper.querySelector('.live-barometer');
   if(!meter){
    meter=document.createElement('div');
    meter.className='live-barometer';
    upper.prepend(meter);
   }
   const observation=snapshot?.sensors.find(sensor=>sensor.key===card.dataset.sensorKey)?.observation;
   const stationPressure=observation?.values?.pressure_hpa;
   const official=observation?.values?.pressure_qff_hpa;
   const temperature=snapshot?.sensors.find(sensor=>sensor.kind==='thermohygro')?.observation?.values?.temperature_c;
   const elevation=snapshot?.station?Number($('liveStation').selectedOptions[0]?.dataset.elevation):stationHeight;
   const value=Number.isFinite(official)?official:WeatherLiveCardData.seaLevelPressure(stationPressure,temperature,elevation);
   const [low,high]=gaugeBounds('barometer',value),[lowZone,highZone]=scales.barometerZones;
   for(const key of Object.keys(pressureColors)){
    const property='--pressure-'+key;
    if(pressureColors[key]===defaultPressureColors[key])upper.style.removeProperty(property);
    else upper.style.setProperty(property,pressureColors[key]);
   }
   const zones=[['Tief','var(--pressure-low)','☁',low,lowZone],['Normal','var(--pressure-normal)','◐',lowZone,highZone],['Hoch','var(--pressure-high)','☀',highZone,high]];
   const zone=zones[value<lowZone?0:value<highZone?1:2];
   const primary=card.querySelector('.live-primary strong');
   const unit=document.createElement('small');
   unit.textContent=' hPa';
   primary.replaceChildren(Number.isFinite(value)?num(value,0):'–',unit);
   let context=card.querySelector('.live-pressure-context');
   if(!context){
    context=document.createElement('div');context.className='live-pressure-context';primary.after(context);
   }
   context.replaceChildren();
   if(Number.isFinite(value)){
    const label=document.createElement('span');
    label.className='live-pressure-zone';label.style.color=zone[1];label.textContent=zone[2]+' '+zone[0];
    context.append(label);
   }
   if(Number.isFinite(stationPressure)){
    const local=document.createElement('span');local.textContent=num(stationPressure,0)+' hPa an der Station';context.append(local);
   }
   const source=Number.isFinite(official)?'MeteoSchweiz · offizieller QFF':Number.isFinite(value)?'Näherung aus Stationsdruck und Aussentemperatur · '+elevation+' m ü. M.':'Meereshöhendruck nicht verfügbar';
   primary.title=source;
   const info=card.querySelector('.live-info-panel');
   let note=info.querySelector('.live-pressure-source');
   if(!note){note=document.createElement('p');note.className='live-pressure-source';info.append(note)}
   const scaleLabel=num(low)+' bis '+num(high)+' hPa';
   const outside=Number.isFinite(value)&&(value<low||value>high);
   note.textContent=source+' · Zeigerskala ('+(customGauges?'Eigene':'Auto')+'): '+scaleLabel+'.'
    +(outside?' Der Messwert liegt ausserhalb der Skala. Der Zeiger steht am Skalenende.':'')
    +' Druckänderungen beziehen sich auf den gemessenen Stationsdruck.';
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
   svg.setAttribute('viewBox','0 0 144 123');
   svg.setAttribute('role','img');
   const reading=Number.isFinite(value)?num(value)+' hPa':'kein Messwert';
   svg.setAttribute('aria-label','Barometer auf Meereshöhe · '+reading+(Number.isFinite(value)?' · '+zone[0]:'')+' · Skala '+scaleLabel+(outside?' · ausserhalb der Skala':''));
   const add=(tag,attributes,label)=>{
    const element=document.createElementNS(svg.namespaceURI,tag);
    for(const [name,attribute] of Object.entries(attributes))element.setAttribute(name,attribute);
    if(label!==undefined)element.textContent=label;
    svg.append(element);
   };
   const point=(angle,radius)=>{
    const radians=angle*Math.PI/180;
    return [72+radius*Math.sin(radians),66-radius*Math.cos(radians)];
   };
   const angleFor=pressure=>-120+240*Math.max(0,Math.min(1,(pressure-low)/(high-low)));
   for(const [,color,,first,last] of zones){
    const a=angleFor(first),b=angleFor(last);
    if(b<=a)continue;
    const [x1,y1]=point(a,57),[x2,y2]=point(b,57);
    add('path',{d:`M ${x1} ${y1} A 57 57 0 ${Number(b-a>180)} 1 ${x2} ${y2}`,fill:'none',stroke:color,'stroke-width':5});
   }
   for(let i=0;i<=24;i++){
    const angle=-120+10*i,major=i%6===0;
    const [x1,y1]=point(angle,major?47:51),[x2,y2]=point(angle,55);
    add('line',{x1,y1,x2,y2,stroke:'var(--muted)','stroke-width':major?1.7:1});
    if(major){
     const [x,y]=point(angle,37);
     add('text',{x,y:y+3,'text-anchor':'middle',fill:'var(--muted)','font-size':9},num(low+(high-low)*i/24));
    }
   }
   if(Number.isFinite(value)){
    const angle=angleFor(value);
    const [x,y]=point(angle,44),[tailX,tailY]=point(angle+180,9);
    add('line',{x1:tailX,y1:tailY,x2:x,y2:y,stroke:zone[1],'stroke-width':2.8,'stroke-linecap':'round'});
    add('circle',{cx:72,cy:66,r:4.5,fill:zone[1]});
   }
   add('text',{x:72,y:105,'text-anchor':'middle',fill:'var(--muted)','font-size':10},'hPa · Meer');
   for(const [i,[label,color,icon]] of zones.entries())add('text',{x:29+43*i,y:120,'text-anchor':'middle',fill:color,'font-size':11},icon+' '+label);
   meter.replaceChildren(svg);
  }
 }
 function redrawGauges(){thermometer();solarMeter();barometer();rainTanks()}
 function redrawCharts(){clearPlotObservers();for(const card of grid.querySelectorAll('[data-sensor-key]')){const entry=cached.get(card.dataset.sensorKey),host=card.querySelector('.live-mini');if(entry&&host){if(entry.storm)renderStorm(host,entry.storm,card);else render(host,entry.cfg,entry.datasets)}}}
 const scaleToggle=$('liveScaleToggle'),gaugeToggle=$('liveGaugeScaleToggle');
 const scaleFields=$('liveScaleFields'),gaugeFields=$('liveGaugeScaleFields'),scaleStatus=$('liveScaleStatus');
 function syncScaleToggles(){
  for(const [button,label,custom] of [[gaugeToggle,'Symbole',customGauges],[scaleToggle,'Diagramme',customCharts]]){
   button.setAttribute('aria-pressed',String(custom));
   button.textContent=label+' · '+(custom?'Eigene':'Auto');
  }
 }
 function saveScales(){try{localStorage.setItem('wetter.liveScales',JSON.stringify({customCharts,customGauges,bounds:scales,barometerBasis:'sea-level',stationHeight,pressureColors}));return true}catch(e){return false}}
 const elevationField=document.createElement('fieldset'),elevationTitle=document.createElement('legend'),elevationLabel=document.createElement('label'),elevationInput=document.createElement('input');
 elevationTitle.textContent='Eigene Wetterstation';
 elevationLabel.textContent='Sensorhöhe · m ü. M.';
 Object.assign(elevationInput,{type:'number',step:'any',required:true,min:-500,max:5000,value:stationHeight});
 elevationLabel.append(elevationInput);
 elevationField.append(elevationTitle,elevationLabel);
 gaugeFields.append(elevationField);
 const colorField=document.createElement('fieldset'),colorTitle=document.createElement('legend'),colorInputs={};
 colorTitle.textContent='Barometer · Farben';colorField.append(colorTitle);
 for(const [key,label] of [['low','Tiefdruck'],['high','Hochdruck']]){
  const wrap=document.createElement('label'),input=document.createElement('input');
  wrap.textContent=label;input.type='color';input.value=pressureColors[key];wrap.append(input);
  colorField.append(wrap);colorInputs[key]=input;
 }
 gaugeFields.append(colorField);
 const scaleInputs={};
 for(const [key,[name,unit]] of Object.entries(scaleSpecs)){
  const field=document.createElement('fieldset'),title=document.createElement('legend');title.textContent=name+' · '+unit;field.append(title);
  scaleInputs[key]=(key==='barometerZones'?['Tief unter','Hoch ab']:['Min','Max']).map((label,i)=>{const wrap=document.createElement('label'),input=document.createElement('input');wrap.textContent=label;input.type='number';input.step='any';input.required=true;input.value=scales[key][i];input.setAttribute('aria-label',name+' '+label);wrap.append(input);field.append(wrap);return input});(gaugeKeys.has(key)?gaugeFields:scaleFields).append(field);
 }
 $('liveScalesForm').onsubmit=e=>{e.preventDefault();const next={};for(const [key,inputs] of Object.entries(scaleInputs)){const pair=inputs.map(input=>input.valueAsNumber);if(!validScale(key,...pair)){scaleStatus.textContent=scaleSpecs[key][0]+': Min muss kleiner als Max sein.'+(key==='thermometer'?' Die Skala muss 0 °C einschliessen.':!['thermohygro','pressure'].includes(key)?' Min darf nicht negativ sein.':'');inputs[0].focus();return}next[key]=pair}if(!validHeight(elevationInput.valueAsNumber))return;stationHeight=elevationInput.valueAsNumber;scales=next;for(const [key,input] of Object.entries(colorInputs))pressureColors[key]=input.value;scaleStatus.textContent=saveScales()?'Skalen gespeichert.':'Skalen für diese Sitzung übernommen.';redrawGauges();redrawCharts()};
 $('liveScalesDefault').onclick=()=>{scales=scaleDefaults();pressureColors={...defaultPressureColors};for(const [key,input] of Object.entries(colorInputs))input.value=pressureColors[key];stationHeight=defaultStationHeight;elevationInput.value=stationHeight;for(const [key,inputs] of Object.entries(scaleInputs))inputs.forEach((input,i)=>input.value=scales[key][i]);scaleStatus.textContent=saveScales()?'Standardwerte wiederhergestellt.':'Standardwerte für diese Sitzung übernommen.';redrawGauges();redrawCharts()};
 scaleToggle.onclick=()=>{customCharts=!customCharts;saveScales();syncScaleToggles();redrawCharts()};
 gaugeToggle.onclick=()=>{customGauges=!customGauges;saveScales();syncScaleToggles();redrawGauges()};
 syncScaleToggles();
 function applyDisplay(){const cards=[...grid.querySelectorAll('[data-sensor-key]')],known=new Map(cards.map(c=>[c.dataset.sensorKey,c]));for(const key of display.order){const card=known.get(key);if(card){grid.append(card);known.delete(key)}}for(const card of known.values())grid.append(card);for(const card of cards){const kind=card.dataset.sensorKind;card.style.setProperty('--sensor',display.colors[kind]||defaults[kind]?.[1]||'#d87543')}orderControls();solarTimes();feelsLike();thermometer();solarMeter();barometer();rainTanks()}
 $('liveArrange').onclick=()=>{arranging=!arranging;$('liveArrange').setAttribute('aria-pressed',String(arranging));orderControls()};
 for(const [kind,[label,color]]of Object.entries(defaults)){const field=document.createElement('label'),input=document.createElement('input');field.append(document.createTextNode(label));input.type='color';input.value=display.colors[kind]||color;input.dataset.liveColor=kind;input.setAttribute('aria-label','Kachelfarbe '+label);input.oninput=()=>{display.colors[kind]=input.value;saveDisplay();applyDisplay();$('liveAppearanceStatus').textContent='Kachelfarbe gespeichert.'};field.append(input);$('liveColorSettings').append(field)}
 $('liveColorsDefault').onclick=()=>{display.colors={};saveDisplay();for(const input of $('liveColorSettings').querySelectorAll('input'))input.value=defaults[input.dataset.liveColor][1];applyDisplay();$('liveAppearanceStatus').textContent='Standardfarben wiederhergestellt.'};
 function feelsLike(){const value=WeatherLiveCardData.apparentFromSensors(snapshot?.sensors||[],Date.now()/1000);for(const card of grid.querySelectorAll('[data-sensor-kind=thermohygro]')){let row=card.querySelector('.live-feels-like');if(!row){row=document.createElement('span');row.className='live-feels-like';row.append(document.createTextNode('Gefühlt '),document.createElement('b'));card.querySelector('.live-values').prepend(row)}row.title='Apparent Temperature nach Steadman · Schattenbedingungen · Temperatur, Luftfeuchtigkeit und Wind Mittel. Annahme: Wind in 10 m Höhe. '+(Number.isFinite(value)?'Berechneter Näherungswert.':'Nicht verfügbar: aktuelle, zeitlich passende Temperatur-, Feuchte- und Windwerte erforderlich (höchstens 15 Minuten alt, maximal 10 Minuten auseinander).');row.querySelector('b').textContent=Number.isFinite(value)?value.toLocaleString('de-CH',{minimumFractionDigits:1,maximumFractionDigits:1})+' °C':'–'}}
 function solarTimes(){if(snapshot?.station)return;const times=WeatherLiveCardData.sunTimes(Date.now()/1000),format=t=>Number.isFinite(t)?new Date(Math.round(t/60)*60000).toLocaleTimeString('de-CH',{timeZone:'Europe/Zurich',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}):'–';for(const card of grid.querySelectorAll('[data-sensor-kind=solar]')){let host=card.querySelector('.live-sun-times');if(!host){host=document.createElement('div');host.className='live-sun-times';for(const [key,label,arrow]of [['sunrise','Sonnenaufgang','M12 9V2m-3 3 3-3 3 3'],['sunset','Sonnenuntergang','M12 2v7m-3-3 3 3 3-3']]){const block=document.createElement('div');block.className='live-sun-event';block.title=label+' · astronomische Näherung, lokaler Horizont nicht berücksichtigt';block.setAttribute('aria-label',label);const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');const path=document.createElementNS(icon.namespaceURI,'path');path.setAttribute('d','M2 18h20M6 17a6 6 0 0 1 12 0M3 11l2 2m14 0 2-2 '+arrow);icon.append(path);const time=document.createElement('time');time.dataset.sunTime=key;block.append(icon,time);host.append(block)}card.querySelector('.live-values').prepend(host)}for(const time of host.querySelectorAll('time')){const t=times[time.dataset.sunTime];time.textContent=format(t);if(Number.isFinite(t))time.dateTime=new Date(t*1000).toISOString();else time.removeAttribute('datetime')}}}
 setInterval(()=>{if(location.hash==='#live'&&!document.hidden){solarTimes();feelsLike()}},60000);
 let longModes={'720':'rolling','8760':'rolling'};try{const saved=JSON.parse(localStorage.getItem('wetter.liveLongModes')||'{}');for(const key of ['720','8760'])if(['rolling','calendar'].includes(saved[key]))longModes[key]=saved[key]}catch(e){}
 function syncRangeMode(){const long=['720','8760'].includes(range.value);$('liveRangeModeControl').hidden=!long;if(long){mode.options[0].textContent=range.value==='720'?'30 Tage':'12 Monate';mode.options[1].textContent=range.value==='720'?'Kalendermonat':'Kalenderjahr';mode.value=longModes[range.value]}}
 const windowFor=now=>WeatherLiveCardData.rangeWindow(now,range.value,mode.value),calendarMode=()=>['720','8760'].includes(range.value)&&mode.value==='calendar';
 const periodLabel=()=>calendarMode()?new Intl.DateTimeFormat('de-CH',{timeZone:'Europe/Zurich',...(range.value==='720'?{month:'long'}:{year:'numeric'})}).format(new Date()):({'168':'7 Tage','720':'30 Tage','8760':'12 Monate'}[range.value]||range.value+' h');
 const beginningLabel=()=>new Date(windowFor(Date.now()/1000).start*1000).toLocaleDateString('de-CH',{timeZone:'Europe/Zurich',day:'2-digit',month:'2-digit'});
 syncRangeMode();

 function periodLabels(reset=true){const label=periodLabel(),hours=Number(range.value);for(const card of grid.querySelectorAll('[data-sensor-key]')){for(const [key,prefix]of [['dayMax','Max · '],['dayMin','Min · '],['gustMax','Max · '],['gustMin','Min · '],['solarMax','Max · '],['pressure24','Änderung '],['rain24','Letzte ']]){const field=card.querySelector('[data-live-stat="'+key+'"]');if(field){field.parentElement.querySelector('span').textContent=calendarMode()&&['rain24','pressure24'].includes(key)?(key==='rain24'?'Seit ':'Änderung seit ')+beginningLabel():prefix+label;if(reset){field.textContent='–';delete field.dataset.value}}}for(const key of ['pressure1','rain1']){const field=card.querySelector('[data-live-stat="'+key+'"]');if(field)field.parentElement.hidden=hours===1}card.querySelector('.live-rain-values')?.classList.toggle('live-rain-two-values',hours===1);for(const extra of card.querySelectorAll('.live-derived'))extra.title='Max/Min im gewählten Anzeigezeitraum · '+label}if(reset)rainTanks()}
 const num=(v,digits=1)=>v.toLocaleString('de-CH',{maximumFractionDigits:digits}),stamp=t=>new Date(t*1000).toLocaleString('de-CH',{timeZone:'Europe/Zurich',...(Number(range.value)>=720?{day:'2-digit',month:'2-digit',...(range.value==='8760'?{year:'numeric'}:{})}:{}),hour:'2-digit',minute:'2-digit'});
 function message(host,text){host.setAttribute('aria-busy','false');host.replaceChildren();const p=document.createElement('p');p.className='live-mini-message';p.textContent=text;host.append(p)}
 function refreshError(host,text){host.setAttribute('aria-busy','false');if(!host.querySelector('svg')){message(host,text);return}let note=host.querySelector('[data-load-error]');if(!note){note=document.createElement('small');note.className='live-mini-warning';note.dataset.loadError='';host.append(note)}note.textContent='Verlauf nicht aktualisiert';note.title=text+' · Bisheriger Verlauf bleibt sichtbar.'}
 function shells(){for(const card of grid.querySelectorAll('[data-sensor-key]')){if(!config[card.dataset.sensorKind])continue;let host=card.querySelector('.live-mini');if(!host){host=document.createElement('div');host.className='live-mini';card.append(host)}if(!host.querySelector('svg'))message(host,'Verlauf wird geladen …');host.setAttribute('aria-busy','true')}}
 function render(host,cfg,datasets){host.setAttribute('aria-busy','false');host.replaceChildren();const tempBand=Number(range.value)>=720&&cfg.metrics[0]==='temperature_c'&&datasets[0].aggregation==='calendar';if(tempBand){const base=datasets[0];datasets=[{...base,display_aggregation:null},{...base,display_aggregation:null,points:base.points.map(p=>({...p,value:p.maximum}))},{...base,display_aggregation:null,points:base.points.map(p=>({...p,value:p.minimum}))}];cfg={...cfg,names:['Mittel','Max','Min'],metrics:['temperature_c','temperature_max','temperature_min'],colors:['var(--sensor)','#ed7773','#77a9ef'],connectGaps:false,tempBand:true}}const all=datasets.flatMap(d=>d.points).filter(p=>Number.isFinite(p.value));if(!all.length){message(host,cfg.type==='rain'?'Keine neuen Regenmeldungen im Zeitraum':'Keine Messwerte im Zeitraum');return}
 const ns='http://www.w3.org/2000/svg',head=document.createElement('div');head.className='live-mini-heading';for(const [i,name] of cfg.names.entries()){const label=document.createElement('span');label.textContent=name;label.className=i?'live-mini-secondary':'';if(cfg.colors)label.style.color=cfg.colors[i];head.append(label)}const units=document.createElement('small');units.textContent=cfg.unit;head.append(units);host.append(head);
 const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 400 144');svg.setAttribute('role','img');svg.setAttribute('aria-label',cfg.names.join(' und ')+' · '+periodLabel());host.append(svg);
 const add=(tag,attrs,text)=>{const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;svg.append(n);return n};
 const data=datasets[0],isBar=cfg.type!=='line',long=Number(range.value)>=720,displayPoints=cfg.type==='bars'?datasets.flatMap(d=>d.period?d.points:WeatherLiveCardData.binBars(d,48)):all,minimum=isBar?0:Math.min(...all.map(p=>long?p.value:(p.minimum??p.value))),maximum=Math.max(...displayPoints.map(p=>cfg.type==='bars'||long?p.value:(p.maximum??p.value))),padding=Math.max((maximum-minimum)*.16,.15),[low,high]=bounds(host.closest('[data-sensor-kind]').dataset.sensorKind,isBar?0:minimum-padding,maximum+padding),left=12,right=350,plotWidth=right-left,x=t=>left+(t-data.start)/(data.end-data.start)*plotWidth,clipId='live-mini-clip-'+(++clipNumber);
 const smoothTemperature=tempBand&&range.value==='720';
 const windRadius=cfg===config.wind?({'24':2,'168':3,'720':1,'8760':1}[range.value]??0):0;
 let plottedPoints=datasets.map(dataset=>dataset.points);
 if(smoothTemperature){
  const complete=data.points.filter(p=>[p.value,p.minimum,p.maximum].every(Number.isFinite));
  const smoothed=new Map();
  for(const segment of WeatherLiveCardData.segments(complete,1)){
   const curve=WeatherLiveCardData.smoothSegment(segment,1,['value','maximum','minimum']);
   segment.forEach((point,index)=>smoothed.set(point,curve[index]));
  }
  const temperature=data.points.map(p=>smoothed.get(p)??p);
  plottedPoints=['value','maximum','minimum'].map(field=>temperature.map(p=>({...p,value:p[field]})));
 }
 const tip=document.createElement('div');tip.className='live-mini-tooltip';tip.hidden=true;host.append(tip);let viewHeight=144;
 const draw=()=>{svg.replaceChildren();tip.hidden=true;const bottom=Math.max(45,viewHeight-(range.value==='8760'?44:33)),y=v=>bottom-(v-low)/(high-low)*(bottom-14);svg.setAttribute('viewBox','0 0 400 '+viewHeight);
 if(windRadius||smoothTemperature){
  const note=document.createElementNS(ns,'title');
  note.textContent='Geglätteter Verlauf. Der Tooltip zeigt die Werte vor der Glättung.';
  svg.append(note);
 }
 if(cfg.connectGaps){const note=document.createElementNS(ns,'title');note.textContent='Messlücken werden zwischen vorhandenen Temperaturwerten verbunden. Im Tooltip stehen die tatsächlich gespeicherten Messwerte.';svg.append(note)}
 add('rect',{x:left,y:14,width:plotWidth,height:bottom-14,class:'plot-background','data-plot-background':''});
 const defs=add('defs',{}),clip=document.createElementNS(ns,'clipPath'),clipRect=document.createElementNS(ns,'rect');clip.id=clipId;for(const[k,v]of Object.entries({x:left,y:14,width:Math.max(0,Math.min(plotWidth,x(data.observed_end??data.end)-left)),height:bottom-14}))clipRect.setAttribute(k,v);clip.append(clipRect);defs.append(clip);
 for(let i=0;i<3;i++){const yy=14+i*(bottom-14)/2;add('line',{x1:left,x2:right,y1:yy,y2:yy,class:'live-mini-grid'});add('text',{x:right+9,y:yy+3,'text-anchor':'start',class:'live-mini-scale'},num(high-(high-low)*i/2))}
 if(tempBand){for(const segment of WeatherLiveCardData.segments(plottedPoints[0].filter(p=>Number.isFinite(p.minimum)&&Number.isFinite(p.maximum)),1,false)){if(segment.length<2)continue;const band=(upper,lower,color,name)=>{const coords=segment.map(p=>x(p.time??(p.first+p.last)/2)+','+y(upper(p))).concat([...segment].reverse().map(p=>x(p.time??(p.first+p.last)/2)+','+y(lower(p))));add('polygon',{points:coords.join(' '),fill:color,opacity:.30,'clip-path':'url(#'+clipId+')','data-mini-band':name})};band(p=>p.maximum,p=>p.value,'#ffb347','mean-max');band(p=>p.value,p=>p.minimum,'#8199ed','min-mean')}}
 datasets.forEach((d,index)=>{const color=cfg.colors?.[index]||(index?'var(--mini-second)':'var(--sensor)');let points=plottedPoints[index];if(cfg.type==='bars'&&!d.period)points=WeatherLiveCardData.binBars(d,48);
 if(isBar){for(const p of points){if(!Number.isFinite(p.value))continue;const xx=x(p.time??(p.first+p.last)/2),width=Math.max(1,Math.min(22,(p.last-p.first)/(d.end-d.start)*plotWidth*.78));add('rect',{x:Math.max(left,xx-width/2),y:y(p.value),width,height:Math.max(0,bottom-y(p.value)),rx:1.6,fill:color,opacity:.8,'data-mini-bar':cfg.type})}}
 else {for(const segment of WeatherLiveCardData.segments(points,d.aggregation==='calendar'?1:Math.max(900,d.bucket_seconds*2),cfg.connectGaps&&d.aggregation!=='calendar')){const curve=WeatherLiveCardData.smoothSegment(segment,windRadius);const path=curve.map((p,i)=>(i?'L':'M')+x(p.time??(p.first+p.last)/2)+','+y(p.value)).join('');add('path',{d:path,fill:'none',stroke:color,'stroke-width':index?1.8:2.3,'stroke-linejoin':'round','stroke-linecap':'round','data-mini-line':cfg.metrics[index]});if(segment.length===1)add('circle',{cx:x(segment[0].time??segment[0].first),cy:y(segment[0].value),r:2.3,fill:color})}}
 });
 for(const node of svg.querySelectorAll('[data-mini-bar],[data-mini-line],circle'))node.setAttribute('clip-path','url(#'+clipId+')');
 renderTimeAxis(add,data,left,right,bottom);
 const cursor=add('line',{x1:left,x2:left,y1:14,y2:bottom,class:'live-mini-cursor',visibility:'hidden','pointer-events':'none'});
 const hide=()=>{tip.hidden=true;cursor.setAttribute('visibility','hidden')};
 const show=e=>{const matrix=svg.getScreenCTM();if(!matrix)return;const point=svg.createSVGPoint();point.x=e.clientX;point.y=e.clientY;const px=Math.max(left,Math.min(right,point.matrixTransform(matrix.inverse()).x)),t=data.start+(px-left)/plotWidth*(data.end-data.start);tip.replaceChildren();let anchor=null;
 datasets.forEach((d,i)=>{const available=(cfg.type==='bars'&&!d.period?WeatherLiveCardData.binBars(d,48):d.points).filter(p=>Number.isFinite(p.value));if(!available.length)return;const time=p=>p.time??(p.first+p.last)/2,p=available.reduce((a,b)=>Math.abs(time(a)-t)<Math.abs(time(b)-t)?a:b);if(anchor===null)anchor=time(p);const label=calendarStamp(p,d);if(tempBand&&i===0){const date=document.createElement('span');date.textContent=label+(p.partial?' · laufend/teilweise':'');tip.append(date)}const row=document.createElement('div');row.style.color=cfg.colors?.[i]||(i?'var(--mini-second)':'var(--sensor)');row.textContent=(tempBand?'':label+' · ')+cfg.names[i]+(!/Mittel$/.test(cfg.names[i])&&d.display_aggregation==='mean'?' Mittel':d.display_aggregation==='maximum'?' Max':'')+' '+num(p.value)+' '+cfg.unit+(p.incomplete?' · unvollständig':!tempBand&&p.partial?' · laufend/teilweise':'');tip.append(row)});

 if(anchor===null){hide();return}cursor.setAttribute('x1',x(anchor));cursor.setAttribute('x2',x(anchor));cursor.setAttribute('visibility','visible');tip.hidden=false};
 svg.onpointermove=show;svg.onpointerdown=e=>{show(e);if(e.pointerType==='touch')svg.setPointerCapture(e.pointerId)};svg.onpointerup=e=>{if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId)};svg.onpointerleave=hide;svg.onpointercancel=hide;
 };draw();if(typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(()=>{const box=svg.getBoundingClientRect();if(!box.width||!box.height)return;const next=box.height/box.width*400;if(Math.abs(next-viewHeight)>.1){viewHeight=next;draw()}});plotObservers.add(observer);observer.observe(svg)}
 if(cfg.type==='rain'&&datasets[0].unknown_intervals){const note=document.createElement('small');note.className='live-mini-warning';note.textContent='Teilweise ohne Ausgangswert';note.title='Fehlender Ausgangszähler oder Zählerrücksetzung. Nur gesicherte Zunahmen werden angezeigt.';host.append(note)}
 }
 function calendarStamp(point,data){if(!data.period)return stamp(point.time??(point.first+point.last)/2);return new Date((point.first+3600)*1000).toLocaleDateString('de-CH',{timeZone:'Europe/Zurich',...(data.period==='month'?{month:'long',year:'numeric'}:{day:'2-digit',month:'2-digit',year:'numeric'})})}
 function renderTimeAxis(add,data,left,right,bottom){
 const axisKey=[data.start,data.end,range.value].join('|');let axis=axisCache.get(axisKey);if(!axis){axis=WeatherLiveCardData.timeAxis(data.start,data.end,range.value);if(axisCache.size>=8)axisCache.clear();axisCache.set(axisKey,axis)}const x=t=>left+(t-data.start)/(data.end-data.start)*(right-left),text=(xx,yy,label,attrs={})=>add('text',{x:xx,y:yy,'text-anchor':'middle',class:'live-mini-time',...attrs},label);
 const boundaries=axis.groups.slice(calendarMode()?0:1);if(calendarMode()&&axis.groups.length)boundaries.push({start:data.end,label:'Ende'});for(const g of boundaries){const xx=x(g.start);add('line',{x1:xx,x2:xx,y1:bottom+5,y2:bottom+20,class:'live-mini-period-boundary','data-period-boundary':g.label})}
 if(axis.yearMode){for(const g of axis.groups)if(x(g.end)-x(g.start)>30)text(x(g.time),bottom+13,g.label);for(const m of axis.months){if(x(m.end)-x(m.start)<12)continue;const xx=x(m.time);text(xx,bottom+25,m.label,{'text-anchor':'end',transform:'rotate(-45 '+xx+' '+(bottom+25)+')','style':'font-size:8px'})}return}
 if(axis.monthMode){for(const g of axis.groups)if(x(g.end)-x(g.start)>42)text(x(g.time),bottom+16,g.label,{'style':'font-size:8px'});const step=Math.max(1,Math.ceil(axis.days.length/Math.max(2,Math.floor((right-left)/43))));axis.days.forEach((d,i)=>{if(i%step===0)text(x(d.time),bottom+30,d.date,{'style':'font-size:8px'})});return}
 for(const t of axis.midnights)add('line',{x1:x(t),x2:x(t),y1:bottom+4,y2:bottom+10,class:'live-mini-midnight','data-midnight':t});for(const d of axis.days){const width=x(d.end)-x(d.start);if(width<12)continue;const xx=x(d.time),font=Math.min(9,Math.max(6,width/3.2));text(xx,bottom+19,d.weekday,{'style':'font-size:'+font+'px'});text(xx,bottom+30,d.date,{'style':'font-size:'+font+'px'})}axis.times.forEach((t,i)=>text(x(t),bottom+26,stamp(t),{'text-anchor':i===0?'start':i===4?'end':'middle'}));
 }
 function renderStorm(host,data,card){
 host.setAttribute('aria-busy','false');host.replaceChildren();const put=(key,value,unit)=>{const el=card.querySelector('[data-live-stat='+key+']');el.textContent=Number.isFinite(value)?num(value):'–';if(Number.isFinite(value)&&unit){const small=document.createElement('small');small.textContent=' '+unit;el.append(small)}};
 const partial=!data.baseline_available||data.unknown_intervals>0;put('stormCount',partial&&data.total===0?null:data.total,'');if(partial&&data.total>0)card.querySelector('[data-live-stat=stormCount]').prepend(document.createTextNode('≥'));card.querySelector('[data-live-stat=stormCount]').style.setProperty('--storm-count-length',card.querySelector('[data-live-stat=stormCount]').textContent.length);put('stormLast',data.last_distance,'km');put('stormNearest',data.nearest,'km');card.querySelector('[data-live-stat=stormCount]').title=partial?'Unvollständiger Zeitraum: fehlender Ausgangszähler oder Zählerrücksetzung. Angezeigt wird die mindestens beobachtete Blitzanzahl; unbekannte Zunahmen werden nicht geschätzt.':'Beobachtete Zählerzunahmen · '+periodLabel();card.querySelector('[data-live-stat=stormLast]').title=data.event_at?'Letztes gemeldetes Ereignis im Anzeigezeitraum: '+new Date(data.event_at*1000).toLocaleString('de-CH'):'Kein Blitzereignis im Anzeigezeitraum';
 const ns='http://www.w3.org/2000/svg',head=document.createElement('div');head.className='live-mini-heading live-storm-heading';head.innerHTML='<span>Anzahl</span><span class="storm-distance-key">Entfernung · km</span>';head.title='Balken: Anzahl '+(data.period==='day'?'je Tag':data.period==='month'?'je Monat':'je '+(data.bucket_seconds/60)+' Minuten')+'. Punkte: geringste gemeldete Entfernung je Abschnitt; näher = größer.';host.append(head);
 const svg=document.createElementNS(ns,'svg');svg.setAttribute('role','img');svg.setAttribute('aria-label','Gewitter: Blitzanzahl und Entfernung · '+periodLabel());host.append(svg);const tip=document.createElement('div');tip.className='live-mini-tooltip';tip.hidden=true;host.append(tip);
 const add=(tag,attrs,text,parent=svg)=>{const node=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))node.setAttribute(k,v);if(text!==undefined)node.textContent=text;parent.append(node);return node};
 const points=data.points||[],[low,high]=bounds('lightning',0,Math.max(1,...points.map(p=>p.value))*1.15),[minKm,maxKm]=bounds('distance',0,Math.max(40,Math.ceil(Math.max(0,...points.map(p=>p.nearest||0))/10)*10)),left=Math.max(22,8+6*Math.max(num(low).length,num(high).length)),right=352,width=right-left,x=t=>left+(t-data.start)/(data.end-data.start)*width,id='storm-'+(++clipNumber);
 const color=distance=>{const stops=[[0,[241,123,120]],[10,[239,181,106]],[25,[118,203,210]],[40,[83,140,206]]],v=Math.min(40,Math.max(0,distance));let i=1;while(i<3&&v>stops[i][0])i++;const[a,ca]=stops[i-1],[b,cb]=stops[i],f=(v-a)/(b-a);return 'rgb('+ca.map((c,j)=>Math.round(c+(cb[j]-c)*f)).join(',')+')'};
 let height=144;const draw=()=>{svg.replaceChildren();tip.hidden=true;svg.setAttribute('viewBox','0 0 400 '+height);const bottom=Math.max(47,height-(range.value==='8760'?44:33)),plotHeight=bottom-14,y=v=>bottom-(v-low)/(high-low)*plotHeight,dy=v=>bottom-(v-minKm)/(maxKm-minKm)*plotHeight;
 const defs=add('defs',{}),clip=add('clipPath',{id},undefined,defs);add('rect',{x:left,y:14,width:Math.max(0,Math.min(width,x(data.observed_end??data.end)-left)),height:plotHeight},undefined,clip);const gradient=add('linearGradient',{id:id+'-colors',x1:0,y1:1,x2:0,y2:0},undefined,defs);for(const km of [minKm,...[10,25,40].filter(km=>km>minKm&&km<maxKm),maxKm])add('stop',{offset:((km-minKm)/(maxKm-minKm)*100)+'%','stop-color':color(km)},undefined,gradient);
 add('rect',{x:left,y:14,width,height:plotHeight,class:'plot-background','data-plot-background':''});for(const f of [0,.5,1]){const yy=bottom-f*plotHeight;add('line',{x1:left,x2:right,y1:yy,y2:yy,class:'live-mini-grid'});add('text',{x:left-5,y:yy+3,'text-anchor':'end',class:'live-mini-scale'},num(low+f*(high-low)));add('text',{x:359,y:yy+3,class:'live-mini-scale'},num(minKm+f*(maxKm-minKm)))}add('rect',{x:394,y:14,width:4,height:plotHeight,fill:'url(#'+id+'-colors)',rx:2});
 for(const p of points){const xx=x(p.time??(p.first+p.last)/2),barWidth=Math.max(1,width*data.bucket_seconds/(data.end-data.start)*.65);if(p.value>0)add('rect',{x:xx-barWidth/2,y:y(p.value),width:barWidth,height:Math.max(0,bottom-y(p.value)),fill:'var(--sensor)',opacity:.55,'clip-path':'url(#'+id+')'});if(Number.isFinite(p.nearest))add('circle',{cx:xx,cy:dy(p.nearest),r:2.1+3.8*Math.pow(1-Math.min(40,p.nearest)/40,2),fill:color(p.nearest),stroke:'var(--panel)','stroke-width':1,'clip-path':'url(#'+id+')'})}
 renderTimeAxis(add,data,left,right,bottom);
 const cursor=add('line',{x1:left,x2:left,y1:14,y2:bottom,class:'live-mini-cursor',visibility:'hidden'}),hide=()=>{tip.hidden=true;cursor.setAttribute('visibility','hidden')},show=e=>{const matrix=svg.getScreenCTM();if(!matrix)return;const position=svg.createSVGPoint();position.x=e.clientX;position.y=e.clientY;const px=Math.max(left,Math.min(right,position.matrixTransform(matrix.inverse()).x)),t=data.start+(px-left)/width*(data.end-data.start),index=Math.min(Math.ceil((data.end-data.start)/data.bucket_seconds)-1,Math.floor((t-data.start)/data.bucket_seconds)),bucketStart=data.start+index*data.bucket_seconds,p=data.period?points.find(p=>t>=p.first&&t<p.last):points.find(p=>Math.abs(p.first-bucketStart)<1),first=p?.first??bucketStart,anchor=p?.time??(data.period?t:first+data.bucket_seconds/2);cursor.setAttribute('x1',x(anchor));cursor.setAttribute('x2',x(anchor));cursor.setAttribute('visibility','visible');tip.textContent=(p?calendarStamp(p,data):stamp(t))+' · '+(!p&&t>data.observed_end?'Noch keine Daten':p?.incomplete?'Anzahl unvollständig':p?num(p.value)+' Blitze':'Keine Meldungen')+' · Min '+(Number.isFinite(p?.nearest)?num(p.nearest)+' km':'–')+' · Letzter '+(Number.isFinite(p?.last_distance)?num(p.last_distance)+' km':'–')+(p?.partial?' · laufend/teilweise':'');tip.hidden=false};svg.onpointermove=show;svg.onpointerdown=e=>{show(e);if(e.pointerType==='touch')svg.setPointerCapture(e.pointerId)};svg.onpointerup=e=>{if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId)};svg.onpointerleave=hide;svg.onpointercancel=hide;
 };draw();if(typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(()=>{const box=svg.getBoundingClientRect();if(!box.width||!box.height)return;const next=box.height/box.width*400;if(Math.abs(next-height)>.1){height=next;draw()}});plotObservers.add(observer);observer.observe(svg)}
 }
 function sourceRequest(path,query,options){
  const station=snapshot?.station;
  return station?WeatherNasArchive.request('/meteoswiss',{...query,station,action:path.slice(1)},options):WeatherNasArchive.request(path,query,options);
 }
 async function statistics(catalog,id,signal,now=Date.now()/1000,selectedCard=null){const start=windowFor(now).start,hours=(now-start)/3600,label=periodLabel();await Promise.all([...grid.querySelectorAll('[data-sensor-key]')].filter(card=>!selectedCard||card===selectedCard).map(async card=>{const sensor=snapshot.sensors.find(s=>s.key===card.dataset.sensorKey);if(!sensor)return;const kind=sensor.kind;
 const put=(key,value,detail='',integer=false)=>{if(id!==revision||!card.isConnected)return;if(key.startsWith('pressure')&&Number.isFinite(value))value=Math.round(value*10)/10;const el=card.querySelector('[data-live-stat="'+key+'"]');if(!el)return;el.textContent=Number.isFinite(value)?(key.startsWith('pressure')?(value>0?'+':''):'')+num(value,integer?0:1):'–';if(Number.isFinite(value)){const unit=document.createElement('small');unit.textContent=' '+el.dataset.unit;el.append(unit);if(key.startsWith('pressure'))el.append(document.createTextNode(value>0?' ↑':value<0?' ↓':' →'))}if(key==='rain24'){if(Number.isFinite(value))el.dataset.value=String(value);else delete el.dataset.value;rainTank(card)}el.title=detail||'Kein ausreichend gesicherter Ausgangswert im NAS-Archiv.'};
 const series=async(metric,start,end,extra={})=>{const loaded=cached.get(sensor.key),reuse=loaded?.datasets.find((d,i)=>loaded.cfg.metrics[i]===metric);if(extra.aggregation==='rain_increment'&&reuse&&Math.abs(reuse.start-start)<15&&Math.abs((reuse.observed_end??reuse.end)-end)<15)return reuse;const spec=catalog.series.find(s=>s.sensor===sensor.key&&s.metric===metric);if(!spec)return null;return sourceRequest('/series',{provider:spec.provider,sensor:spec.sensor,metric,unit:spec.unit,start,end,...extra},{signal})};
 try{if(['thermohygro','wind','solar'].includes(kind)){const metric={thermohygro:'temperature_c',wind:'gust_kmh',solar:'solar_wm2'}[kind],data=cached.get(sensor.key)?.datasets.find((d,i)=>cached.get(sensor.key).cfg.metrics[i]===metric)||await series(metric,start,now),values=data&&WeatherLiveCardData.extrema(data),spec=catalog.series.find(s=>s.sensor===sensor.key&&s.metric===metric),partial=spec?.first>start+120,detail='Anzeigezeitraum: '+label+(partial?' · Aufzeichnung erst ab '+new Date(spec.first*1000).toLocaleString('de-CH'):''),keys={thermohygro:['dayMax','dayMin'],wind:['gustMax','gustMin'],solar:['solarMax']}[kind];put(keys[0],values?.max,detail,kind==='solar');if(keys[1])put(keys[1],values?.min,detail)}
 if(kind==='pressure'){const current=sensor.observation?.values.pressure_hpa,end=sensor.observation?.value_times?.pressure_hpa??sensor.observation?.measured_at;await Promise.all((hours===1?[hours]:[hours,1]).map(async comparisonHours=>{if(!Number.isFinite(end))return;const target=comparisonHours===hours&&calendarMode()?start:end-comparisonHours*3600,data=await series('pressure_hpa',target-180,target+180),base=data&&WeatherLiveCardData.baseline(data,target);const valid=Number.isFinite(current)&&Number.isFinite(base);put(comparisonHours===hours?'pressure24':'pressure1',valid?current-base:null,valid?'Änderung gegenüber '+new Date(target*1000).toLocaleString('de-CH')+' · Ausgangswert innerhalb ±3 Minuten.':'Noch kein passender Archivwert von vor '+comparisonHours+' Stunden vorhanden. Die Änderung erscheint automatisch, sobald ein Vergleichswert verfügbar ist.')}))}
 if(kind==='rain'&&catalog.capabilities?.includes('rain_increment_v1')){
  const meteo=sensor.provider==='meteoswiss';
  const fresh=now-(sensor.last_success_at||0)<180&&!sensor.error;
  const windows=[[hours*3600,'rain24'],...(hours===1?[]:[[3600,'rain1']]),[600,'rain10']];
  await Promise.all(windows.map(async([span,key])=>{
   const useRainTime=meteo&&(key!=='rain24'||Number(range.value)<720);
   const end=useRainTime?sensor.observation.measured_at:now;
   const data=await series('rain_total_mm',end-span,end,{aggregation:'rain_increment',bucket_seconds:Math.max(60,Math.ceil(span/48))});
   const total=data?WeatherLiveCardData.rainTotal(data):null;
   const detail=total===null?'Kein ausreichend gesicherter Ausgangswert im NAS-Archiv.':
    meteo?'Offizielle Niederschlagsmengen von MeteoSchweiz'+(useRainTime?' · bis '+stamp(end):'')+'.':
    fresh?'Gesicherte Zählerzunahmen aus dem NAS-Archiv.':'Archivstand · Der letzte erfolgreiche Sensorabruf liegt länger zurück oder der aktuelle Abruf ist fehlgeschlagen.';
   put(key,total,detail,total>50);
  }));
 }
 }catch(error){/* Keep unknown statistics empty; chart errors remain visible separately. */}}))}
 async function load(){if(!snapshot||location.hash!=='#live')return;const id=++revision;historyController?.abort();historyController=new AbortController();const signal=historyController.signal;cached.clear();clearPlotObservers();periodLabels(false);for(const el of grid.querySelectorAll('[data-live-stat^=storm]')){if(!el.closest('[data-sensor-key]').querySelector('.live-mini svg'))el.textContent='–';if(el.dataset.liveStat==='stormCount')el.previousElementSibling.textContent='Blitze · '+periodLabel()}shells();if(!snapshot.recording){for(const host of grid.querySelectorAll('.live-mini'))message(host,'NAS verbinden, um Verläufe zu sehen');return}
 try{const catalog=await sourceRequest('/catalog',null,{signal});if(id!==revision)return;const observedEnd=snapshot.station?snapshot.observed_end:Date.now()/1000,window=windowFor(observedEnd),start=window.start,end=window.end;await Promise.all([...grid.querySelectorAll('[data-sensor-key]')].map(async card=>{const cfg=config[card.dataset.sensorKind],host=card.querySelector('.live-mini');if(!cfg||!host)return;const key=card.dataset.sensorKey;try{const period=range.value==='720'?'day':range.value==='8760'?'month':null;if(period&&!catalog.capabilities?.includes('calendar_aggregation_v1'))throw Error('NAS-Recorder für Tages-/Monatswerte neu starten');if(cfg.type==='lightning'){if(!catalog.capabilities?.includes('lightning_events_v1'))throw Error('NAS-Recorder für Gewitterdiagramm neu starten');const spec=catalog.series.find(s=>s.sensor===key&&s.metric==='lightning_count');if(!spec){message(host,'Noch keine Blitzdaten aufgezeichnet');return}const hours=Number(range.value),bucket=hours>=8760?604800:hours>=720?21600:hours>=168?7200:hours>=24?1800:hours>=6?900:hours>=2?300:120;const data=await sourceRequest('/series',{provider:spec.provider,sensor:key,metric:'lightning_count',start,end:observedEnd,aggregation:'lightning_events',bucket_seconds:bucket,...(period?{period}:{})},{signal});if(id!==revision||!host.isConnected)return;const storm={...data,start,end,observed_end:observedEnd};cached.set(key,{storm});renderStorm(host,storm,card);return}if(cfg.type==='rain'&&!catalog.capabilities?.includes('rain_increment_v1'))throw Error('NAS-Sammler für Regenverlauf aktualisieren');const datasets=await Promise.all(cfg.metrics.map(async metric=>{const spec=catalog.series.find(s=>s.sensor===key&&s.metric===metric&&s.unit===cfg.unit);if(!spec)return {points:[],start,end,bucket_seconds:60};const q={provider:spec.provider,sensor:spec.sensor,metric,unit:spec.unit,start,end:observedEnd};if(cfg.type==='rain')Object.assign(q,{aggregation:'rain_increment',bucket_seconds:Math.max(60,Math.ceil((end-start)/48)),...(period?{period}:{})});else if(period)Object.assign(q,{aggregation:'calendar',period});const d=await sourceRequest('/series',q,{signal});if(cfg.type==='rain'&&d.aggregation!=='rain_increment')throw Error('NAS-Sammler für Regenverlauf aktualisieren');if(metric==='gust_kmh'){d.points=d.points.map(p=>({...p,value:p.maximum??p.value}));if(period)d.display_aggregation='maximum'}d.start=start;d.end=end;d.observed_end=observedEnd;return d}));if(id!==revision||!host.isConnected)return;cached.set(key,{cfg,datasets});render(host,cfg,datasets);await statistics(catalog,id,signal,observedEnd,card)}catch(error){if(id===revision&&host.isConnected)refreshError(host,error.name==='AbortError'?'NAS antwortet nicht':error.message)}}))}catch(error){if(id===revision)for(const host of grid.querySelectorAll('.live-mini'))refreshError(host,'Verlauf derzeit nicht erreichbar')}}
 range.onchange=()=>{syncRangeMode();try{localStorage.setItem('wetter.liveCardRange',range.value)}catch(e){}cached.clear();load()};
 mode.onchange=()=>{longModes[range.value]=mode.value;try{localStorage.setItem('wetter.liveLongModes',JSON.stringify(longModes))}catch(e){}cached.clear();load()};
 window.addEventListener('weather-live-source-changed',()=>{revision++;historyController?.abort();snapshot=null;cached.clear();clearPlotObservers()});
 window.addEventListener('weather-live-status-updated',event=>{snapshot=event.detail});
 window.addEventListener('weather-live-rendered',event=>{snapshot=event.detail;applyDisplay();load()});window.addEventListener('hashchange',()=>{if(location.hash!=='#live'){revision++;historyController?.abort();clearPlotObservers()}});
 const dialog=$('liveArchiveDialog');$('openLiveArchive').onclick=()=>{if(!dialog.open)dialog.showModal();$('liveArchive').open=true};$('closeLiveArchive').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{$('liveArchive').open=false});dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});
 // Explicit live-height mode neutralizes presentation-only zoom geometry in fullscreen.
 function fit(){if(!document.body.classList.contains('focus-mode'))return;if(arranging){arranging=false;$('liveArrange').setAttribute('aria-pressed','false');orderControls()}document.documentElement.style.setProperty('--live-screen-height',window.innerHeight+'px')}
 window.addEventListener('resize',fit);fit();snapshot=window.WeatherCurrentLiveState?.();if(snapshot){applyDisplay();load()};
})();
