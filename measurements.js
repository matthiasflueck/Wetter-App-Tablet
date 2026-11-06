/* Mac-only raw-data explorer; preview and download share the exact selection. */
(()=>{
 const $=id=>document.getElementById(id),view=$('view-measurements');if(!view)return;
 const make=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e};
 let filters={},filterTimer=null;
 let fields=[],selected=[],page=1,pages=1,loaded=false,generation=0,request=null,downloadBusy=false;
 const status=$('measurementStatus'),download=$('measurementDownload');
 const defaults=['DatumUhrzeit','Temperatur_Celsius','Feuchtigkeit_Prozent','Niederschlag_mm','Windstaerke_kmh','Boee_kmh','Luftdruck_QFE_hPa','SolarRadiation_Wm2','UV_Index'];
 function save(){try{localStorage.setItem('wetter.measurementExport',JSON.stringify({columns:selected,filters,start:$('measurementStart').value,end:$('measurementEnd').value}))}catch(e){}}
 function query(){return new URLSearchParams({columns:JSON.stringify(selected),filters:JSON.stringify(Object.fromEntries(selected.filter(id=>filters[id]?.trim()).map(id=>[id,filters[id]]))),start:$('measurementStart').value,end:$('measurementEnd').value,page})}
 function valid(){return !$('measurementStart').value||!$('measurementEnd').value||$('measurementStart').value<=$('measurementEnd').value}
 function renderColumns(){
  const available=$('measurementAvailable'),order=$('measurementOrder');available.replaceChildren();order.replaceChildren();
  for(const f of fields){const label=make('label'),input=make('input'),text=make('span',f.label),code=make('small',f.name+(f.group==='Datenbank'?' · Datenbank':''));input.type='checkbox';input.checked=selected.includes(f.id);text.title=f.name;label.append(input,text,code);input.onchange=()=>{if(input.checked)selected.push(f.id);else{selected=selected.filter(c=>c!==f.id);delete filters[f.id]}page=1;renderColumns();save();refresh()};available.append(label)}
  selected.forEach((id,index)=>{const f=fields.find(f=>f.id===id),li=make('li'),name=make('span',(index+1)+'. '+f.label);name.title=f.name;li.append(name);for(const [step,symbol,label] of [[-1,'↑','Nach oben'],[1,'↓','Nach unten']]){const button=make('button',symbol);button.type='button';button.disabled=index+step<0||index+step>=selected.length;button.setAttribute('aria-label',label+' – '+f.label);button.onclick=()=>{[selected[index],selected[index+step]]=[selected[index+step],selected[index]];renderColumns();save();refresh()};li.append(button)}order.append(li)});
  $('measurementSelectionCount').textContent=selected.length+' von '+fields.length+' Spalten';
  buildHeader();download.disabled=!selected.length||downloadBusy;
 }
 function filterSummary(){const active=selected.filter(id=>filters[id]?.trim()).length;$('measurementResetFilters').disabled=!active;return active}
 function buildHeader(){
  const head=make('thead'),row=make('tr');for(const id of selected){const f=fields.find(f=>f.id===id),th=make('th'),title=make('span',f.label),input=make('input');th.scope='col';title.title=f.name;input.type='search';input.className='measurement-column-filter';input.placeholder='Suchen / >= 20';input.maxLength=200;input.value=filters[id]||'';input.setAttribute('aria-label','Filter – '+f.label);input.oninput=()=>{filters[id]=input.value;page=1;save();filterSummary();request?.abort();generation++;clearTimeout(filterTimer);filterTimer=setTimeout(refresh,350)};input.onkeydown=e=>{if(e.key==='Enter'){clearTimeout(filterTimer);refresh()}};th.append(title,input);row.append(th)}head.append(row);$('measurementTable').replaceChildren(head,make('tbody'));filterSummary();
 }
 async function refresh(){
  clearTimeout(filterTimer);request?.abort();const current=++generation;request=new AbortController();$('measurementTable').querySelector('tbody')?.replaceChildren();$('measurementCount').textContent='';$('measurementPage').textContent='';$('measurementPrev').disabled=true;$('measurementNext').disabled=true;
  download.disabled=!selected.length||downloadBusy||!valid();
  if(!selected.length){status.textContent='Bitte mindestens eine Spalte auswählen.';return}
  if(!valid()){status.textContent='Das Startdatum muss vor dem Enddatum liegen.';return}
  $('measurementDateRange').textContent=($('measurementStart').value||'Beginn')+' – '+($('measurementEnd').value||'Heute');if(!$('measurementStart').value&&!$('measurementEnd').value)$('measurementDateRange').textContent='Gesamte Messperiode';
  status.textContent='Messdaten werden geladen …';
  try{const response=await fetch('/api/measurements?'+query(),{signal:request.signal});const data=await response.json();if(!response.ok)throw Error(data.message);if(current!==generation)return;
   page=data.page;pages=data.pages;const body=make('tbody');
   for(const row of data.rows){const tr=make('tr');for(const value of row){const td=make('td',value===null||value===''?'–':String(value));td.title=value===null?'Kein Messwert':String(value);tr.append(td)}body.append(tr)}$('measurementTable').querySelector('tbody')?.replaceWith(body);
   $('measurementCount').textContent=data.total.toLocaleString('de-CH')+' Messungen'+(filterSummary()?' · '+filterSummary()+' Filter':'');$('measurementPage').textContent='Seite '+page+' von '+pages;$('measurementPrev').disabled=page<=1;$('measurementNext').disabled=page>=pages;download.disabled=!data.total||downloadBusy;
   status.textContent=data.total?'Vorschau: bis zu 50 Messungen pro Seite. Excel übernimmt den Zeitraum und alle Spaltenfilter.':'Keine Messungen für diesen Zeitraum und diese Filter.';
  }catch(e){if(e.name!=='AbortError'&&current===generation){status.textContent='Messdaten konnten nicht geladen werden. '+e.message;download.disabled=true}}
 }
 async function initialize(){if(loaded||location.hash!=='#measurements')return;loaded=true;status.textContent='Verfügbare Datenbankfelder werden geladen …';try{const response=await fetch('/api/measurements/fields');const data=await response.json();if(!response.ok)throw Error(data.message);fields=data.fields;let saved={};try{saved=JSON.parse(localStorage.getItem('wetter.measurementExport')||'{}')}catch(e){}
  selected=Array.isArray(saved.columns)?[...new Set(saved.columns)].filter(id=>fields.some(f=>f.id===id)):defaults.map(name=>'source:'+name).filter(id=>fields.some(f=>f.id===id));
  if(saved.filters&&typeof saved.filters==='object')for(const id of selected)if(typeof saved.filters[id]==='string'&&saved.filters[id].length<=200)filters[id]=saved.filters[id];
  for(const [id,key] of [['measurementStart','start'],['measurementEnd','end']]){if(/^\d{4}-\d{2}-\d{2}$/.test(saved[key]||''))$(id).value=saved[key];$(id).min=data.first||'';$(id).max=data.last||''}
  renderColumns();await refresh();
 }catch(e){loaded=false;status.textContent=e.message}}
 $('measurementApply').onclick=()=>{page=1;save();refresh()};$('measurementAllDates').onclick=()=>{$('measurementStart').value='';$('measurementEnd').value='';page=1;save();refresh()};
 for(const id of ['measurementStart','measurementEnd'])$(id).onchange=()=>{page=1;save();refresh()};
 $('measurementSelectAll').onclick=()=>{selected=[...selected,...fields.map(f=>f.id).filter(id=>!selected.includes(id))];page=1;renderColumns();save();refresh()};$('measurementClear').onclick=()=>{selected=[];filters={};page=1;renderColumns();save();refresh()};
 $('measurementResetFilters').onclick=()=>{filters={};page=1;clearTimeout(filterTimer);buildHeader();save();refresh()};
 $('measurementPrev').onclick=()=>{page--;refresh()};$('measurementNext').onclick=()=>{page++;refresh()};
 download.onclick=async()=>{if(downloadBusy||!selected.length||!valid())return;downloadBusy=true;download.disabled=true;download.textContent='Excel wird erstellt …';status.textContent='Alle gewählten Messungen werden als Excel-Datei vorbereitet …';try{const response=await fetch('/api/measurements.xlsx?'+query());if(!response.ok)throw Error((await response.json()).message);const blob=await response.blob(),url=URL.createObjectURL(blob),a=make('a');a.href=url;a.download='Wetter-Messdaten.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);status.textContent='Excel-Datei wurde erstellt. Der Download enthält alle passenden Messungen inklusive Spaltenfilter.'}catch(e){status.textContent='Excel-Download fehlgeschlagen. '+e.message}finally{downloadBusy=false;download.disabled=!selected.length||!valid();download.textContent='Excel herunterladen'}};
 window.addEventListener('hashchange',initialize);window.addEventListener('weather-data-changed',()=>{loaded=false;initialize()});initialize();
})();
