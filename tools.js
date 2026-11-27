(()=>{
 const $=id=>document.getElementById(id);
 const number=id=>Math.max(0,Math.floor(Number($(id)?.value)||0));
 const fmt=n=>Number(n).toLocaleString(undefined,{maximumFractionDigits:2});
 function set(id,html){const el=$(id);if(el)el.innerHTML=html;}
 function calculateTime(){
  const tables=number('time-tables'),start=$('time-start')?.value,end=$('time-end')?.value;
  if(!tables||!start||!end){set('time-results','<p class="tool-error">Enter the number of tables, a start time and a target end time.</p>');return;}
  const [sh,sm]=start.split(':').map(Number),[eh,em]=end.split(':').map(Number);
  let minutes=eh*60+em-(sh*60+sm);if(minutes<=0)minutes+=1440;
  const firstBreak=20+10,secondBreak=40+10,totalBreak=firstBreak+secondBreak,productiveMinutes=minutes-totalBreak,sections=tables*2;
  if(productiveMinutes<=0){set('time-results','<p class="tool-error">The shift is '+fmt(minutes)+' minutes, but the two breaks and room travel use '+totalBreak+' minutes. Choose a longer workday.</p>');return;}
  const perSection=productiveMinutes/sections;
  set('time-results','<div><span>Minutes per table side (same target for every employee)</span><strong>'+fmt(perSection)+' min</strong></div><div><span>Productive time after breaks</span><strong>'+fmt(productiveMinutes)+' min</strong></div><div><span>Breaks + room travel deducted</span><strong>'+totalBreak+' min (30 + 50)</strong></div><div><span>Total work sections</span><strong>'+sections.toLocaleString()+'</strong></div><div><span>Calculation</span><strong>'+fmt(productiveMinutes)+' ÷ '+tables+' tables ÷ 2 sides</strong></div>');
 }
 function calculatePeople(){
  const people=number('plants-employees'),perTable=number('plants-per-table');
  if(!people){set('person-results','<p class="tool-error">Enter at least 1 employee.</p>');return;}
  const base=Math.floor(perTable/people),extra=perTable%people;
  set('person-results',`<div><span>Plants per table</span><strong>${perTable.toLocaleString()}</strong></div><div><span>Plants per person per timed section</span><strong>${fmt(perTable/people)}</strong></div><div><span>Whole-plant assignment</span><strong>${extra?extra+' people × '+(base+1)+' · '+(people-extra)+' × '+base:people+' people × '+base}</strong></div>`);
 }
 function calculateSections(){
  const total=number('section-total'),count=number('section-count');
  if(!count){set('section-results','<p class="tool-error">Enter at least 1 section.</p>');set('section-breakdown','');return;}
  const base=Math.floor(total/count),extra=total%count,lower=count-extra;
  set('section-results',`<div><span>Base plants per section</span><strong>${base}</strong></div><div><span>Extra plants to distribute</span><strong>${extra}</strong></div><div><span>Distribution</span><strong>${extra?extra+' sections × '+(base+1)+' · '+lower+' × '+base:count+' sections × '+base}</strong></div>`);
  const target=$('section-breakdown');target.replaceChildren();
  const summary=document.createElement('p');summary.className='section-summary';summary.textContent=total.toLocaleString()+' plants balanced across '+count+' sections';target.append(summary);
  const chips=document.createElement('div');chips.className='section-chips';
  const groups=[...(extra?[{n:base+1,c:extra}]:[]),...(lower?[{n:base,c:lower}]:[])];
  groups.forEach(g=>{const chip=document.createElement('span');chip.className='section-chip';chip.innerHTML='<strong>'+g.c.toLocaleString()+'</strong><span>sections · '+g.n+' plants each</span>';chips.append(chip);});
  target.append(chips);
 }
 function init(){
  const now=new Date(),start=$('time-start'),end=$('time-end');
  if(start&&!start.value)start.value=now.toTimeString().slice(0,5);
  if(end&&!end.value){const later=new Date(now.getTime()+8*60*60*1000);end.value=later.toTimeString().slice(0,5);}
  ['time-tables','time-start','time-end'].forEach(id=>$(id)?.addEventListener('input',calculateTime));
  ['plants-employees','plants-per-table'].forEach(id=>$(id)?.addEventListener('input',calculatePeople));
  ['section-total','section-count'].forEach(id=>$(id)?.addEventListener('input',calculateSections));
  calculateTime();calculatePeople();calculateSections();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
