/* Stacked station charts share one calendar range and one inspection cursor. */
(() => {
  const root = document.getElementById('view-timeline');
  const DAY = 86400000;
  const panels = [
    {id:'temperature', title:'Temperaturen', lines:[['temperature','mean','Mittel','#efad36'],['temperature','maximum','Maximum','#ed7773'],['temperature','minimum','Minimum','#77a9ef']], unit:'°C'},
    {id:'rain', title:'Niederschlag', lines:[['rain','sum','Tagessumme','#75b9e6']], unit:'mm', bars:true},
    {id:'solar', title:'Solarstrahlung & UV', lines:[['solar','mean','Solar Mittel','#efad36'],['uv','maximum','UV Maximum','#84d599']], unit:'W/m²', secondUnit:'UV-Index', bars:true},
    {id:'wind', title:'Windstärke', lines:[['gust','maximum','Böen Maximum','#84d599'],['wind','mean','Wind Mittel','#39c19a']], unit:'km/h'},
    {id:'humidity', title:'Luftfeuchtigkeit', lines:[['humidity','mean','Mittel','#77a9ef']], unit:'%'}
  ];
  let mode='year', year, month=0, firstYear, lastYear, sequence=0;
  let datasets={}, charts=[], snapshot=null,zoomRange=null;
  const axisAPI=window.WeatherAxisScales;
  let customAxes={},defaultAxes={},editingAxes=false;
  try{const saved=JSON.parse(localStorage.getItem('wetter.yAxes')||'{}');for(const [key,value] of Object.entries(saved||{}))if(axisAPI.valid(value))customAxes[key]=value}catch(e){}
  function axisRange(key){return customAxes[key]||defaultAxes[key]||{min:0,max:1}}
  function prepareDefaultAxes(){
    for(const panel of panels){
      defaultAxes[panel.id]=axisAPI.extent(panel.lines.filter(([metric])=>metric!=='uv').map(([metric,kind])=>(snapshot.metrics[metric]||[]).map(row=>row[kind])),{baseline:true,headroom:panel.id==='solar'?.25:.08});
    }
    defaultAxes.uv=axisAPI.extent([(snapshot.metrics.uv||[]).map(row=>row.maximum)],{baseline:true});
    refreshAxisEditors();
  }
  const valueToggle=document.getElementById('timelineValues');
  try{valueToggle.checked=localStorage.getItem('wetter.timelineValues')==='true'}catch(e){}
  valueToggle.onchange=()=>{try{localStorage.setItem('wetter.timelineValues',String(valueToggle.checked))}catch(e){}if(snapshot&&year!==undefined)load()};
  async function fetchSnapshot(){const response=await fetch('/api/timeline');const data=await response.json();if(!response.ok)throw Error(data.message);return data}
  // Load every calendar year once. Period switches below need no network requests.
  let snapshotPromise=fetchSnapshot();
  snapshotPromise.catch(()=>{});
  const status=root.querySelector('[data-status]');
  const container=root.querySelector('[data-panels]');
  const format=n=>n===null||n===undefined?'keine Werte':n.toLocaleString('de-CH',{maximumFractionDigits:1});
  const iso=d=>d.toISOString().slice(0,10);
  function range(){
    const calendarStart=new Date(Date.UTC(year,mode==='year'?0:month,1)),calendarEnd=new Date(Date.UTC(year,mode==='year'?12:month+1,1));
    const start=zoomRange?new Date(zoomRange.start):calendarStart,end=zoomRange?new Date(zoomRange.end):calendarEnd;
    const calendarLabel=mode==='year'?String(year):calendarStart.toLocaleDateString('de-CH',{month:'long',year:'numeric',timeZone:'UTC'});
    return {start,end,label:calendarLabel+(zoomRange?' · Zoom: '+iso(start)+' – '+iso(new Date(+end-DAY)):'')};
  }

  function updateControls(){
    valueToggle.closest('label').hidden=mode==='year';
    root.querySelectorAll('[data-year-label]').forEach(e=>e.textContent=year??'–');
    root.querySelectorAll('[data-month-label]').forEach(e=>e.textContent=new Date(Date.UTC(2000,month,1)).toLocaleDateString('de-CH',{month:'short',timeZone:'UTC'}));
    root.querySelectorAll('[data-month-controls]').forEach(e=>e.hidden=mode!=='month');
    root.querySelectorAll('[data-mode]').forEach(e=>e.setAttribute('aria-pressed',String(e.dataset.mode===mode)));
    root.querySelectorAll('[data-year-step]').forEach(e=>e.disabled=year===undefined||(Number(e.dataset.yearStep)<0?year<=firstYear:year>=lastYear));
    root.querySelectorAll('[data-month-step]').forEach(e=>e.disabled=year===undefined||(Number(e.dataset.monthStep)<0?year===firstYear&&month===0:year===lastYear&&month===11));
  }
  function step(delta,unit){
    if(year===undefined)return;
    let nextYear=year,nextMonth=month;
    if(unit==='year')nextYear+=delta;
    else {const next=new Date(Date.UTC(year,month+delta,1));nextYear=next.getUTCFullYear();nextMonth=next.getUTCMonth()}
    if(nextYear<firstYear||nextYear>lastYear)return;
    year=nextYear;month=nextMonth;zoomRange=null;updateControls();load();
  }
  function makeButton(label,stepValue,unit){const b=document.createElement('button');b.type='button';b.textContent=stepValue<0?'◀':'▶';b.setAttribute('aria-label',label);b.dataset[unit+'Step']=stepValue;return b}
  for(const panel of panels){
    const section=document.createElement('section');section.className='chart timeline-chart';section.dataset.chartId=panel.id;
    const head=document.createElement('div');head.className='timeline-heading';
    const yearNav=document.createElement('div');yearNav.className='period-controls year-controls';yearNav.setAttribute('role','group');yearNav.setAttribute('aria-label',panel.title+' – Jahr');
    const yearLabel=document.createElement('strong');yearLabel.dataset.yearLabel='';yearNav.append(makeButton('Vorheriges Jahr – '+panel.title,-1,'year'),yearLabel,makeButton('Nächstes Jahr – '+panel.title,1,'year'));
    const monthNav=document.createElement('div');monthNav.className='period-controls month-controls';monthNav.dataset.monthControls='';monthNav.setAttribute('role','group');monthNav.setAttribute('aria-label',panel.title+' – Monat');
    const monthLabel=document.createElement('strong');monthLabel.dataset.monthLabel='';monthNav.append(makeButton('Vorheriger Monat – '+panel.title,-1,'month'),monthLabel,makeButton('Nächster Monat – '+panel.title,1,'month'));
    const calendarControls=document.createElement('div');calendarControls.className='diagram-calendar-controls';calendarControls.append(yearNav,monthNav);
    const title=document.createElement('h3');title.textContent=panel.title;head.append(calendarControls,title);section.append(head);
    const legend=document.createElement('p');legend.className='timeline-legend';
    panel.lines.forEach(([metric,kind,text,color])=>{const entry=document.createElement('span');entry.style.color=color;entry.textContent='━ '+text+(metric==='uv'?' (rechte Achse)':'');legend.append(entry)});section.append(legend);
    if(panel.id==='temperature')for(const definition of window.WeatherDays.definitions){
      const entry=document.createElement('span');entry.textContent=definition.label;entry.title=definition.rule;
      entry.style.cssText='background:'+definition.color+';color:#172a36;padding:2px 7px;border-radius:5px';legend.append(entry);
    }
    let thunderStrip=null;
    if(panel.id==='temperature'){thunderStrip=document.createElement('div');thunderStrip.setAttribute('role','group');thunderStrip.setAttribute('aria-label','Gewitter');section.append(thunderStrip)}
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 1000 310');svg.setAttribute('role','img');svg.setAttribute('aria-label',panel.title+' – synchronisierte Zeitachse');svg.setAttribute('tabindex','0');section.append(svg);
    const tooltip=document.createElement('div');tooltip.className='chart-tooltip';tooltip.id='tooltip-'+panel.id;tooltip.setAttribute('role','tooltip');tooltip.hidden=true;section.append(tooltip);
    svg.setAttribute('aria-describedby',tooltip.id);
    container.append(section);charts.push({panel,svg,tooltip,thunderStrip,legend});
  }
  const editAxesButton=document.getElementById('editYAxes');
  const defaultAxesButton=document.getElementById('defaultYAxes');
  const axisForms=[];
  for(const chart of charts){
    const section=chart.svg.closest('section');const editors=document.createElement('div');editors.className='axis-editors';editors.hidden=true;
    for(const [key,title] of [[chart.panel.id,chart.panel.unit],...(chart.panel.secondUnit?[['uv','UV-Index (Jahresansicht)']]:[])]){
      const form=document.createElement('form');form.className='axis-form';
      const fieldset=document.createElement('fieldset');fieldset.className='axis-editor';const legend=document.createElement('legend');legend.textContent='Y-Achse · '+title;fieldset.append(legend);
      const fields={};
      for(const [bound,label] of [['min','Min'],['max','Max']]){
        const wrapper=document.createElement('label');wrapper.textContent=label+' ';
        const input=document.createElement('input');input.type='number';input.step='any';input.required=true;input.setAttribute('aria-label',chart.panel.title+' '+title+' '+label);wrapper.append(input);fieldset.append(wrapper);fields[bound]=input;
        input.oninput=()=>fields.max.setCustomValidity('');
      }
      const save=document.createElement('button');save.type='submit';save.textContent='Speichern';fieldset.append(save);
      const message=document.createElement('span');message.className='axis-message';message.setAttribute('role','status');fieldset.append(message);form.append(fieldset);editors.append(form);axisForms.push({key,fields,message});
      form.onsubmit=e=>{
        e.preventDefault();const range={min:fields.min.valueAsNumber,max:fields.max.valueAsNumber};
        if(!axisAPI.valid(range)){fields.max.setCustomValidity('Max muss grösser als Min sein.');fields.max.reportValidity();return}
        customAxes[key]=range;
        try{localStorage.setItem('wetter.yAxes',JSON.stringify(customAxes));message.textContent='Gespeichert'}catch(e){message.textContent='Nur für diese Sitzung gespeichert'}
        if(snapshot&&year!==undefined)load();
      };
    }
    section.querySelector('.timeline-heading').after(editors);
  }
  function refreshAxisEditors(){for(const {key,fields,message} of axisForms){const range=axisRange(key);fields.min.value=range.min;fields.max.value=range.max;fields.max.setCustomValidity('');message.textContent=''}}
  function updateAxesButtons(){const disabled=location.hash!=='#timeline';editAxesButton.disabled=disabled;defaultAxesButton.disabled=disabled;if(disabled)editingAxes=false;editAxesButton.setAttribute('aria-pressed',String(editingAxes));root.querySelectorAll('.axis-editors').forEach(e=>e.hidden=!editingAxes)}
  editAxesButton.onclick=()=>{editingAxes=!editingAxes;refreshAxisEditors();updateAxesButtons()};
  defaultAxesButton.onclick=()=>{customAxes={};try{localStorage.removeItem('wetter.yAxes')}catch(e){}refreshAxisEditors();if(snapshot&&year!==undefined)load()};
  window.addEventListener('hashchange',updateAxesButtons);updateAxesButtons();
  // Reorder existing panels without fetching or redrawing their data.
  const arrangeButton=document.getElementById('arrangeCharts');
  let arranging=false;
  try{
    const saved=JSON.parse(localStorage.getItem('wetter.chartOrder')||'[]');
    if(Array.isArray(saved)){
      const known=new Map([...container.children].map(section=>[section.dataset.chartId,section]));
      for(const id of saved){const section=known.get(id);if(section){container.append(section);known.delete(id)}}
      for(const section of known.values())container.append(section);
    }
  }catch(e){}
  function refreshOrderControls(){
    const sections=[...container.children];
    sections.forEach((section,index)=>{
      const controls=section.querySelector('.chart-order-controls');
      controls.hidden=!arranging;
      controls.children[0].disabled=index===0;
      controls.children[1].disabled=index===sections.length-1;
    });
  }
  for(const section of container.children){
    const controls=document.createElement('div');controls.className='chart-order-controls';
    controls.setAttribute('role','group');controls.setAttribute('aria-label','Reihenfolge – '+section.querySelector('h3').textContent);
    for(const [direction,symbol,label] of [[-1,'↑','nach oben'],[1,'↓','nach unten']]){
      const button=document.createElement('button');button.type='button';button.textContent=symbol;
      button.setAttribute('aria-label',section.querySelector('h3').textContent+' '+label);button.title=label;
      button.onclick=()=>{
        const neighbor=direction<0?section.previousElementSibling:section.nextElementSibling;
        if(!neighbor)return;
        if(direction<0)container.insertBefore(section,neighbor);else container.insertBefore(neighbor,section);
        try{localStorage.setItem('wetter.chartOrder',JSON.stringify([...container.children].map(item=>item.dataset.chartId)))}catch(e){}
        refreshOrderControls();
        if(button.disabled)controls.children[direction<0?1:0].focus();else button.focus();
      };
      controls.append(button);
    }
    section.querySelector('.timeline-heading').prepend(controls);
  }
  function updateArrangeButton(){
    arrangeButton.disabled=location.hash!=='#timeline';
    if(arrangeButton.disabled){arranging=false;arrangeButton.setAttribute('aria-pressed','false')}
    arrangeButton.title=arrangeButton.disabled?'Im Zeitverlauf können Diagramme angeordnet werden':'Diagrammreihenfolge ändern';
    refreshOrderControls();
  }
  arrangeButton.onclick=()=>{arranging=!arranging;arrangeButton.setAttribute('aria-pressed',String(arranging));refreshOrderControls()};
  window.addEventListener('hashchange',updateArrangeButton);updateArrangeButton();
  root.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.yearStep)step(Number(b.dataset.yearStep),'year');if(b.dataset.monthStep)step(Number(b.dataset.monthStep),'month');if(b.dataset.mode&&year!==undefined){mode=b.dataset.mode;zoomRange=null;updateControls();load()}});
  function element(svg,name,attrs,text){const node=document.createElementNS(svg.namespaceURI,name);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);if(text!==undefined)node.textContent=text;svg.append(node);return node}
  let cursor=0;
  function hideTooltips(){for(const chart of charts){chart.tooltip.hidden=true;if(chart.cursor)chart.cursor.setAttribute('visibility','hidden');if(chart.point)chart.point.setAttribute('visibility','hidden')}}
  function inspect(index,activeChart){
    const {start,end}=range();const count=Math.round((end-start)/DAY);cursor=Math.max(0,Math.min(count-1,index));
    const day=iso(new Date(+start+cursor*DAY));
    for(const chart of charts){
      if(!chart.cursor)continue;
      const x=65+(cursor+.5)/count*870;chart.cursor.setAttribute('x1',x);chart.cursor.setAttribute('x2',x);chart.cursor.setAttribute('visibility','visible');
      chart.tooltip.hidden=true;chart.point.setAttribute('visibility','hidden');
      if(chart!==activeChart)continue;
      const heading=document.createElement('strong');heading.textContent=new Date(day+'T00:00:00Z').toLocaleDateString('de-CH',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'});chart.tooltip.replaceChildren(heading);
      const entries=chart.panel.lines.map(([metric,kind,label,color])=>[label.replace('Maximum','Max').replace('Minimum','Min'),datasets[metric]?.daily[cursor]?.[kind],metric==='uv'?'':chart.panel.unit,color]);
      if(chart.panel.id==='solar'){
        entries.splice(1,0,['Solar Max',datasets.solar.daily[cursor]?.maximum,'W/m²','#ff4545']);
        if(mode==='year')entries.push(['UV-Trend (7 Tage)',chart.uvTrend?.[cursor]?.maximum,'',chart.panel.lines[1][3]]);
      }
      if(chart.panel.id==='temperature'){
        const dayValues=datasets.temperature.daily[cursor];
        for(const definition of window.WeatherDays.classify(dayValues.minimum,dayValues.maximum))entries.push([definition.label,'', '',definition.color]);
      }
      for(const [label,value,unit,color] of entries){const row=document.createElement('div');row.style.color=color;row.textContent=value===''?label:label+': '+format(value)+(value!==null&&value!==undefined&&unit?' '+unit:'');chart.tooltip.append(row)}
      const primary=datasets[chart.panel.lines[0][0]]?.daily[cursor]?.[chart.panel.lines[0][1]];
      const y=primary===null||primary===undefined?137.5:Math.max(30,Math.min(245,chart.scaleY(primary)));
      if(primary!==null&&primary!==undefined){chart.point.setAttribute('cx',x);chart.point.setAttribute('cy',y);chart.point.setAttribute('visibility','visible')}
      chart.tooltip.hidden=false;
      const section=chart.svg.closest('section'),width=chart.tooltip.offsetWidth,height=chart.tooltip.offsetHeight;
      const sectionBox=section.getBoundingClientRect(),svgBox=chart.svg.getBoundingClientRect(),zoom=sectionBox.width/section.offsetWidth;
      const svgTop=(svgBox.top-sectionBox.top)/zoom;
      const anchorX=(svgBox.left-sectionBox.left+x/1000*svgBox.width)/zoom;
      const anchorY=svgTop+y/1000*svgBox.width/zoom;
      let left=anchorX+12;if(left+width>section.clientWidth-8)left=anchorX-width-12;
      chart.tooltip.style.left=Math.max(8,Math.min(section.clientWidth-width-8,left))+'px';
      chart.tooltip.style.top=Math.max(svgTop,anchorY-height-12)+'px';
    }
  }
  function renderThunder(chart){
    const strip=chart.thunderStrip;if(!strip)return;
    const {start,end}=range(),count=Math.round((end-start)/DAY);
    strip.replaceChildren();strip.className='thunder-strip is-'+mode;
    if(mode==='month')strip.style.gridTemplateColumns=`repeat(${count},minmax(0,1fr))`;else strip.style.gridTemplateColumns='';
    const days=new Map((snapshot.thunder||[]).map(d=>[d.day,d]));
    const settings=window.WeatherThunder.getSettings();
    let total=0;
    for(let i=0;i<count;i++){
      const day=iso(new Date(+start+i*DAY)),storm=days.get(day);
      total+=storm?.count??0;
      const strength=window.WeatherThunder.classify(storm?.count,storm?.min_km,settings);
      const cell=document.createElement('div');cell.className='thunder-cell';
      if(mode==='month')strip.append(cell);
      if(strength==='none')continue;
      const icon=document.createElement('span');icon.className='thunder-icon is-'+strength;icon.textContent='⚡';
      const detail=day+' · '+Math.round(storm.count)+' Blitze'+(storm.min_km!==null?' · Mindestdistanz '+Math.round(storm.min_km)+' km':' · Distanz unbekannt')+' · '+(strength==='strong'?'stark':'normal');
      icon.title=detail;icon.setAttribute('role','img');icon.setAttribute('aria-label',detail);icon.dataset.thunderDay=day;icon.dataset.strength=strength;
      if(mode==='month'){
        cell.append(icon);
        const amount=document.createElement('div');amount.className='thunder-count';amount.textContent=Math.round(storm.count);cell.append(amount);
        const distance=document.createElement('div');distance.className='thunder-km';distance.textContent=storm.min_km!==null?Math.round(storm.min_km)+' km':'';cell.append(distance);
      }else{icon.style.left=((i+.5)/count*100)+'%';strip.append(icon)}
    }
    chart.thunderTotal=total;
  }
  function draw(chart){
    const {panel,svg}=chart;renderThunder(chart);svg.replaceChildren();
    if(panel.id==='solar'){
      chart.legend.children[1].hidden=mode==='month';
      chart.legend.children[1].textContent='━ UV-Trend (7-Tage-Mittel, rechte Achse)';
    }
    const {start,end}=range();const count=Math.round((end-start)/DAY);
    const {min:low,max:high}=axisRange(panel.id);
    const x=i=>65+(i+.5)/count*870,y=v=>245-(v-low)/(high-low)*215;chart.scaleY=y;
    for(let i=0;i<=4;i++){const value=low+(high-low)*i/4;element(svg,'line',{x1:65,x2:935,y1:y(value),y2:y(value),stroke:'var(--line)'});element(svg,'text',{x:55,y:y(value)+4,'text-anchor':'end',fill:'var(--muted)','font-size':12},format(value))}
    element(svg,'text',{x:14,y:137.5,transform:'rotate(-90 14 137.5)',fill:'var(--muted)','font-size':13,'text-anchor':'middle','data-axis-title':'left'},panel.id==='temperature'?'° Celsius':panel.unit);
    const ticks=[];
    if(zoomRange){const stride=Math.max(1,Math.ceil(count/31));for(let i=0;i<count;i+=stride)ticks.push(i)}
    else if(mode==='year'){for(let m=0;m<12;m++)ticks.push(Math.round((Date.UTC(year,m,1)-start)/DAY))}
    else {for(let i=0;i<count;i++)ticks.push(i)}
    for(const i of ticks){element(svg,'line',{x1:x(i),x2:x(i),y1:30,y2:245,stroke:'var(--line)',opacity:.5});element(svg,'text',{x:x(i),y:264,fill:'var(--muted)','font-size':12,'text-anchor':mode==='month'||zoomRange?'end':'middle',transform:mode==='month'||zoomRange?`rotate(-45 ${x(i)} 264)`:'', 'data-axis-day':mode==='month'?iso(new Date(+start+i*DAY)):''},new Date(+start+i*DAY).toLocaleDateString('de-CH',mode==='year'&&!zoomRange?{month:'short',timeZone:'UTC'}:{day:'2-digit',month:'2-digit',timeZone:'UTC'}))}
    const showUVAxis=panel.secondUnit&&mode==='year';
    const {min:uvMin,max:uvMax}=axisRange('uv');
    const uvY=v=>245-(v-uvMin)/(uvMax-uvMin)*215;
    if(showUVAxis){element(svg,'text',{x:986,y:137.5,transform:'rotate(-90 986 137.5)',fill:'var(--muted)','font-size':13,'text-anchor':'middle','data-axis-title':'right'},'UV-Index');for(let i=0;i<=4;i++)element(svg,'text',{x:945,y:245-215*i/4+4,fill:'var(--muted)','font-size':12},format(uvMin+(uvMax-uvMin)*i/4))}
    const clipId='plot-clip-'+panel.id;
    const defs=element(svg,'defs',{});const clip=document.createElementNS(svg.namespaceURI,'clipPath');clip.id=clipId;
    const clipRect=document.createElementNS(svg.namespaceURI,'rect');for(const [key,value] of Object.entries({x:65,y:1,width:870,height:244}))clipRect.setAttribute(key,value);clip.append(clipRect);defs.append(clip);
    if(panel.id==='temperature')datasets.temperature.daily.forEach((row,i)=>{
      const days=window.WeatherDays.classify(row.minimum,row.maximum);
      const warm=days.find(d=>d.id==='heat')||days.find(d=>d.id==='summer');
      const cold=days.find(d=>d.id==='ice')||days.find(d=>d.id==='frost');
      const markers=[warm,cold].filter(Boolean),width=870/count*.8;
      markers.forEach((definition,lane)=>element(svg,'rect',{
        x:x(i)-width/2+lane*width/markers.length,y:229,width:width/markers.length,height:16,
        fill:definition.color,opacity:.8,'data-weather-day':definition.id,'data-weather-date':row.day,
        'pointer-events':'none'
      }));
    });
    // Filled temperature range and gust envelope, split at missing days.
    if(panel.id==='temperature'||panel.id==='wind'){
      const source=datasets[panel.id==='temperature'?'temperature':'gust'].daily;
      let segment=[];
      const flush=()=>{if(segment.length>1){
        const band=(upper,lower,color,name)=>element(svg,'polygon',{points:segment.map(([r,i])=>x(i)+','+y(upper(r))).concat(segment.slice().reverse().map(([r,i])=>x(i)+','+y(lower(r)))).join(' '),fill:color,opacity:panel.id==='temperature'?.3:.16,'data-band':name});
        if(panel.id==='temperature'){
          band(r=>r.maximum,r=>r.mean,'#ffb347','mean-max');
          band(r=>r.mean,r=>r.minimum,'#8199ed','min-mean');
        }else band(r=>r.maximum,()=>0,'#84d599','gust');
      }segment=[]};
      source.forEach((r,i)=>{if(r.maximum===null){flush();return}segment.push([r,i])});flush();
    }
    panel.lines.forEach(([metric,kind,label,color],lineIndex)=>{
      if(panel.id==='solar'&&metric==='uv'&&mode==='month')return;
      let rows=datasets[metric].daily;
      if(panel.id==='solar'&&metric==='uv'&&mode==='year'){
        // Reference website: centered seven-day moving mean. Keep missing days empty.
        const uvByDay=new Map(snapshot.metrics.uv.map(row=>[row.day,row[kind]]));
        rows=rows.map(row=>{
          const values=[];for(let offset=-3;offset<=3;offset++){const stamp=Date.parse(row.day)+offset*DAY,day=iso(new Date(stamp));if(day.slice(0,4)!==String(year))continue;const value=uvByDay.get(day);if(Number.isFinite(value))values.push(value)}
          return {...row,[kind]:row[kind]===null||!values.length?null:values.reduce((a,b)=>a+b,0)/values.length};
        });
      }
      if(metric==='uv')chart.uvTrend=rows;
      const scale=metric==='uv'?uvY:y;
      if(panel.bars&&lineIndex===0){rows.forEach((r,i)=>{if(r[kind]===null)return;const yy=scale(r[kind]);element(svg,'rect',{x:x(i)-870/count*.34,y:yy,width:Math.max(.7,870/count*.68),height:Math.max(0,y(Math.max(low,0))-yy),fill:color,opacity:.85})});return}
      let path='';let previous=false;
      rows.forEach((r,i)=>{const v=r[kind];if(v===null){previous=false;return}path+=(previous?'L':'M')+x(i)+','+scale(v);previous=true});
      element(svg,'path',{d:path,fill:'none',stroke:color,'stroke-width':lineIndex===0?2:1.4,'data-series':metric,'data-smoothing':metric==='uv'&&mode==='year'?'7-day-mean':'none'});
      if(rows.filter(r=>r[kind]!==null).length===1){rows.forEach((r,i)=>{if(r[kind]!==null)element(svg,'circle',{cx:x(i),cy:scale(r[kind]),r:3,fill:color})})}
    });
    if(mode==='month'&&valueToggle.checked&&panel.id==='solar'){
      datasets.solar.daily.forEach((row,i)=>{
        const uv=datasets.uv.daily[i].maximum;
        if(row.mean===null&&row.maximum===null&&uv===null)return;
        const labels=[[row.mean,'','#efad36','solar'],[row.maximum,'max: ','#ff4545','solar-maximum'],[uv,'UV: ','#c568d8','uv']];
        const available=labels.filter(([value])=>value!==null);
        available.forEach(([value,prefix,color,metric],line)=>element(svg,'text',{
          x:x(i),y:y(row.mean??0)-9-(available.length-1-line)*9,fill:color,'font-size':7,
          'text-anchor':'middle','data-value-label':metric,'pointer-events':'none'
        },prefix+Math.round(value)));
      });
    }
    if(mode==='month'&&valueToggle.checked&&panel.id!=='solar'){
      panel.lines.forEach(([metric,kind,label,color],lineIndex)=>{
        // Match the reference: label the temperature envelope, keeping the mean clear.
        if(panel.id==='temperature'&&kind==='mean')return;
        if(metric==='uv')chart.uvTrend=rows;
      const scale=metric==='uv'?uvY:y;
        datasets[metric].daily.forEach((row,i)=>{
          const value=row[kind];if(value===null)return;
          const below=kind==='minimum'||(panel.lines.length>1&&lineIndex===1&&panel.id!=='temperature');
          const yy=scale(value)+(below?16:-9);
          element(svg,'text',{x:x(i),y:yy,fill:color,'font-size':10,'text-anchor':'middle',
            'data-value-label':metric,'pointer-events':'none'},format(value));
        });
      });
    }
    svg.querySelectorAll('polygon,path,rect,[data-value-label],circle').forEach(node=>{if(!node.closest('defs'))node.setAttribute('clip-path','url(#'+clipId+')')});
    chart.cursor=element(svg,'line',{x1:65,x2:65,y1:25,y2:245,stroke:'var(--text)','stroke-dasharray':'4 3',visibility:'hidden','pointer-events':'none'});
    chart.point=element(svg,'circle',{r:4,fill:panel.lines[0][3],stroke:'var(--panel)','stroke-width':1.5,visibility:'hidden','pointer-events':'none'});
    let drag=null,suppressClick=false;
    const selection=element(svg,'rect',{x:65,y:30,width:0,height:215,fill:'var(--accent)',opacity:.22,stroke:'var(--accent)',visibility:'hidden','pointer-events':'none'});
    const pointerPosition=e=>{const box=svg.getBoundingClientRect();return {x:(e.clientX-box.left)/box.width*1000,y:(e.clientY-box.top)/box.width*1000}};
    const inspectPointer=e=>{const {x:px,y:py}=pointerPosition(e);if(px<65||px>935||py<30||py>245){hideTooltips();return}inspect(Math.floor((px-65)/870*count),chart)};
    svg.onpointerdown=e=>{
      if(e.button!==0||e.pointerType==='touch')return;
      const p=pointerPosition(e);if(p.x<65||p.x>935||p.y<30||p.y>245)return;
      drag={x:p.x,clientX:e.clientX,pointerId:e.pointerId};suppressClick=false;svg.setPointerCapture(e.pointerId);hideTooltips();
    };
    svg.onpointermove=e=>{
      if(!drag){inspectPointer(e);return}
      const x=Math.max(65,Math.min(935,pointerPosition(e).x));
      if(Math.abs(e.clientX-drag.clientX)<5)return;
      selection.setAttribute('x',Math.min(drag.x,x));selection.setAttribute('width',Math.abs(x-drag.x));selection.setAttribute('visibility','visible');
    };
    svg.onpointerup=e=>{
      if(!drag)return;
      const origin=drag;drag=null;selection.setAttribute('visibility','hidden');
      if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);
      if(Math.abs(e.clientX-origin.clientX)<5)return;
      suppressClick=true;
      const x=Math.max(65,Math.min(935,pointerPosition(e).x));
      const first=Math.max(0,Math.min(count-1,Math.floor((Math.min(origin.x,x)-65)/870*count)));
      const last=Math.max(first,Math.min(count-1,Math.floor((Math.max(origin.x,x)-65)/870*count)));
      if(first===0&&last===count-1)return;
      zoomRange={start:+start+first*DAY,end:+start+(last+1)*DAY};hideTooltips();load();
    };
    const cancelDrag=()=>{if(drag&&svg.hasPointerCapture(drag.pointerId))svg.releasePointerCapture(drag.pointerId);drag=null;selection.setAttribute('visibility','hidden')};
    svg.onpointercancel=cancelDrag;svg.onlostpointercapture=()=>{drag=null;selection.setAttribute('visibility','hidden')};
    svg.onclick=e=>{if(suppressClick){suppressClick=false;return}inspectPointer(e)};
    svg.ondblclick=e=>{e.preventDefault();cancelDrag();zoomRange=null;hideTooltips();load()};
    svg.onpointerleave=()=>{if(!drag)hideTooltips()};svg.onblur=()=>{cancelDrag();hideTooltips()};
    svg.onkeydown=e=>{if(e.key==='Escape'){cancelDrag();hideTooltips();return}if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();inspect(e.key==='Home'?0:e.key==='End'?count-1:cursor+(e.key==='ArrowRight'?1:-1),chart)}};
    chart.tooltip.hidden=true;
  }
  async function load(){
    const id=++sequence;
    const begin=performance.now();
    try{
      if(!snapshot){status.textContent='Tagesauswertungen werden einmalig geladen …';snapshot=await snapshotPromise}
      if(id!==sequence)return;
      const {start,end,label}=range();
      datasets={};
      for(const [metric,source] of Object.entries(snapshot.metrics)){
        const byDay=new Map(source.filter(r=>r.day>=iso(start)&&r.day<iso(end)).map(r=>[r.day,r]));
        const daily=[];
        for(let t=+start;t<+end;t+=DAY){const day=iso(new Date(t));daily.push(byDay.get(day)||{day,samples:0,valid_samples:0,mean:null,minimum:null,maximum:null,sum:null})}
        datasets[metric]={daily,summary:{days_with_values:daily.filter(r=>r.valid_samples>0).length,days_requested:daily.length}};
      }
      charts.forEach(draw);cursor=0;
      root.dataset.renderMs=(performance.now()-begin).toFixed(1);
      requestAnimationFrame(()=>requestAnimationFrame(()=>{if(id===sequence)root.dataset.paintMs=(performance.now()-begin).toFixed(1)}));
      root.dataset.period=label;
      status.textContent=label+' · Alle Diagramme zeigen denselben Zeitraum. Zum Zoomen einen Bereich aufziehen, mit Doppelklick zurücksetzen.';
    }catch(e){if(id===sequence){status.textContent='Zeitverlauf konnte nicht geladen werden: '+e.message;window.dispatchEvent(new CustomEvent('weather-timeline-error',{detail:e.message}))}}
  }
  window.addEventListener('weather-thunder-changed',()=>{if(snapshot&&year!==undefined)load()});
  let initializing=false, initRevision=0;
  async function initialize(){
    if((location.hash!=='#timeline'&&!root.hasAttribute('data-standalone'))||initializing)return;
    if(year!==undefined)return;
    initializing=true;const revision=++initRevision;
    try{const loaded=await snapshotPromise;if(revision!==initRevision)return;snapshot=loaded;prepareDefaultAxes();const days=snapshot.metrics.temperature;if(!Array.isArray(days)||!days.length)throw Error('Keine Temperatur-Tagesdaten im gespeicherten Stand.');firstYear=Number(days[0].day.slice(0,4));lastYear=Number(days[days.length-1].day.slice(0,4));const latest=new Date(snapshot.last_utc*1000);year=Number(latest.toLocaleDateString('en-US',{year:'numeric',timeZone:'Europe/Zurich'}));month=Number(latest.toLocaleDateString('en-US',{month:'numeric',timeZone:'Europe/Zurich'}))-1;updateControls();await load()}
    catch(e){status.textContent=e.message;window.dispatchEvent(new CustomEvent('weather-timeline-error',{detail:e.message}))}finally{if(revision===initRevision)initializing=false}
  }
  window.addEventListener('hashchange',initialize);
  // Invalidate cached charts after a completed import or restore.
  window.addEventListener('weather-data-changed',()=>{sequence++;initRevision++;initializing=false;snapshot=null;snapshotPromise=fetchSnapshot();snapshotPromise.catch(()=>{});year=undefined;zoomRange=null;initialize()});
  updateControls();initialize();
})();
