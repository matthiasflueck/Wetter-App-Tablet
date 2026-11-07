/* Pure compact-chart preparation, shared by Mac and tablet. */
(function(root){
 function binBars(data,count=48){
  const span=(data.end-data.start)/count,bins=new Map();for(const p of data.points||[]){if(!Number.isFinite(p.value))continue;const t=(p.first+p.last)/2,index=Math.min(count-1,Math.max(0,Math.floor((t-data.start)/span)));let b=bins.get(index);if(!b){b={first:data.start+index*span,last:data.start+(index+1)*span,total:0,count:0,minimum:Infinity,maximum:-Infinity};bins.set(index,b)}const weight=p.count||1;b.total+=p.value*weight;b.count+=weight;b.minimum=Math.min(b.minimum,p.minimum??p.value);b.maximum=Math.max(b.maximum,p.maximum??p.value)}return [...bins.values()].map(b=>({...b,value:b.total/b.count}));
 }
 function segments(points,gap=900){const result=[];let group=[],previous=null;for(const p of points||[]){if(!Number.isFinite(p.value)){if(group.length)result.push(group);group=[];previous=null;continue}if(previous!==null&&p.first-previous>gap){if(group.length)result.push(group);group=[]}group.push(p);previous=p.last}if(group.length)result.push(group);return result}
 const api={binBars,segments};if(typeof module!=='undefined')module.exports=api;else root.WeatherLiveCardData=api;
})(typeof window==='undefined'?this:window);
