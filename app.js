const inviteLinkDetected = (() => {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.slice(1));
  return query.get("type") === "invite" || hash.get("type") === "invite";
})();
const SUPABASE_URL = window.FCP_CONFIG?.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = window.FCP_CONFIG?.SUPABASE_ANON_KEY || "";
const authReady = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase?.createClient);
const supabase = authReady ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null;
let sessionToken = null;
let currentUser = null;
let currentRole = "standard";
let awaitingInvitePassword = false;
let activeSessionUserId = null;
let installPrompt = null;
let indexManifest = null;
const tableCache = new Map();
const PAGE_SIZE = 50;
const state = { community: { rows: [], filtered: [], page: 0, loaded: false }, products: { rows: [], filtered: [], page: 0, loaded: false, dataset: "menu_items" }, market: { rows: [], filtered: [], page: 0, loaded: false } };
const $ = id => document.getElementById(id);
function setConnection(connected, label) { const pill=$("connection-pill"); pill.className="pill "+(connected?"online":"offline"); pill.innerHTML="<i></i> "+(label||(connected?"ACCOUNT CONNECTED":"SIGNED OUT")); }
function showTab(name) { document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===name)); document.querySelectorAll(".panel").forEach(p=>p.classList.toggle("active-panel",p.id===name)); if(sessionToken){ if(name==="community") loadCommunity(); if(name==="products") loadProducts(); if(name==="market") loadMarket(); } }
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.tab)));
document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.go)));
function authError(message){$("auth-error").textContent=message||"";}
function showLogin(message=""){activeSessionUserId=null;awaitingInvitePassword=false;$("login-form").hidden=false;$("set-password-form").hidden=true;$("auth-screen").hidden=false;$("app-content").hidden=true;$("admin-open").hidden=true;$("signout-button").hidden=true;setConnection(false,"SIGNED OUT");authError(message);}
function showDashboard(){$("auth-screen").hidden=true;$("app-content").hidden=false;$("signout-button").hidden=false;$("admin-open").hidden=currentRole!=="admin";setConnection(true,currentRole==="admin"?"ADMIN ACCOUNT":"STANDARD ACCOUNT");}
async function invokeFunction(name,body){
 const {data:{session}}=await supabase.auth.getSession();
 if(!session?.access_token)throw new Error("Your session has expired. Please sign in again.");
 const response=await fetch(SUPABASE_URL+"/functions/v1/"+name,{method:"POST",headers:{"Content-Type":"application/json","apikey":SUPABASE_ANON_KEY,"Authorization":"Bearer "+session.access_token},body:JSON.stringify(body)});
 const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||"Secure service request failed ("+response.status+").");return result;
}
async function startAuthenticatedSession(session){
 if(!session){sessionToken=null;currentUser=null;currentRole="standard";activeSessionUserId=null;indexManifest=null;tableCache.clear();showLogin();return;}
 sessionToken=session.access_token;currentUser=session.user;
 if(inviteLinkDetected){history.replaceState(null,"",location.pathname);awaitingInvitePassword=true;}
 if(awaitingInvitePassword){$("login-form").hidden=true;$("set-password-form").hidden=false;$("auth-screen").hidden=false;$("app-content").hidden=true;return;}
 if(activeSessionUserId===session.user.id && !$("app-content").hidden)return;
 activeSessionUserId=session.user.id;
 const {data:profile,error}=await supabase.from("user_profiles").select("role,email").eq("user_id",session.user.id).single();
 if(error||!profile){await supabase.auth.signOut();showLogin("Your account profile is not ready. Contact the dashboard administrator.");return;}
 currentRole=profile.role==="admin"?"admin":"standard";showDashboard();
 try{await loadPrivateCatalog();await loadCommunity();}
 catch(e){$("last-refresh").textContent="Private archive unavailable";$("community-results").innerHTML="<div class=\"empty-results\">Signed in successfully, but the private archive could not load: "+escapeHTML(e.message)+"</div>";}
}
$("login-form").addEventListener("submit",async event=>{
 event.preventDefault();authError("");const button=$("login-submit");button.disabled=true;button.textContent="Signing in…";
 try{if(!authReady)throw new Error("Authentication is not configured yet. The dashboard administrator must finish the secure service setup.");const {data,error}=await supabase.auth.signInWithPassword({email:$("login-email").value.trim(),password:$("login-password").value});if(error)throw error;await startAuthenticatedSession(data.session);}
 catch(e){authError(e.message||"Could not sign in.");}finally{button.disabled=false;button.textContent="Sign in";}
});
$("set-password-form").addEventListener("submit",async event=>{event.preventDefault();authError("");try{const password=$("new-password").value;if(password.length<12)throw new Error("Use at least 12 characters.");const {error}=await supabase.auth.updateUser({password});if(error)throw error;$("set-password-form").hidden=true;awaitingInvitePassword=false;activeSessionUserId=null;await startAuthenticatedSession((await supabase.auth.getSession()).data.session);}catch(e){authError(e.message||"Could not set password.");}});
$("signout-button").addEventListener("click",async()=>{await supabase?.auth.signOut();});
supabase?.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>startAuthenticatedSession(session),0);});
if(!authReady){showLogin("Secure sign-in is being configured. Please check back after the administrator completes setup.");}
else{supabase.auth.getSession().then(({data})=>{if(data.session)startAuthenticatedSession(data.session);else showLogin();});}

const adminDialog=$("admin-dialog");
$("admin-open").addEventListener("click",()=>{if(currentRole!=="admin")return;adminDialog.showModal();loadAdminUsers();});
$("admin-close").addEventListener("click",()=>adminDialog.close());
$("users-refresh").addEventListener("click",loadAdminUsers);
$("invite-form").addEventListener("submit",async event=>{event.preventDefault();const email=$("invite-email").value.trim();const msg=$("admin-message");msg.textContent="Sending invitation…";try{await invokeFunction("admin-users",{action:"invite",email});msg.textContent="Invitation sent to "+email+".";$("invite-email").value="";await loadAdminUsers();}catch(e){msg.textContent=e.message;}});
async function loadAdminUsers(){if(currentRole!=="admin")return;const target=$("admin-users");target.textContent="Loading accounts…";try{const result=await invokeFunction("admin-users",{action:"list"});target.replaceChildren();result.users.forEach(user=>{
 const row=document.createElement("div");row.className="admin-user-row";const info=document.createElement("div");const email=document.createElement("strong");email.textContent=user.email||"Pending invitation";const meta=document.createElement("small");meta.textContent=(user.role||"standard").toUpperCase()+" · "+(user.last_sign_in_at?"Last sign-in "+new Date(user.last_sign_in_at).toLocaleDateString():"Not signed in yet");info.append(email,meta);row.append(info);
 if(user.id!==currentUser?.id){const role=document.createElement("select");role.setAttribute("aria-label","Role for "+user.email);["standard","admin"].forEach(v=>{const o=document.createElement("option");o.value=v;o.textContent=v==="admin"?"Administrator":"Standard user";role.append(o);});role.value=user.role||"standard";role.addEventListener("change",async()=>{try{await invokeFunction("admin-users",{action:"role",userId:user.id,role:role.value});$("admin-message").textContent="Account role updated.";}catch(e){$("admin-message").textContent=e.message;loadAdminUsers();}});row.append(role);
 const status=document.createElement("button");status.className="button button-outline";status.textContent=user.banned_until?"Restore":"Suspend";status.addEventListener("click",async()=>{try{await invokeFunction("admin-users",{action:user.banned_until?"restore":"suspend",userId:user.id});$("admin-message").textContent="Account status updated.";loadAdminUsers();}catch(e){$("admin-message").textContent=e.message;}});row.append(status);}
 target.append(row);
 });if(!result.users.length)target.textContent="No accounts yet.";
 }catch(e){target.textContent=e.message;}}

async function loadPrivateCatalog(){
 const [catalogFile,indexFile]=await Promise.all([githubGet("archive/catalog.json"),githubGet("archive/app-index/manifest.json")]);
 const catalog=JSON.parse(decodeContent(catalogFile));indexManifest=JSON.parse(decodeContent(indexFile));const tables=catalog.tables||{};
 $("metric-mentions").textContent=(tables.mentions??0).toLocaleString();$("metric-products").textContent=(tables.menu_items??0).toLocaleString();$("metric-stores").textContent=(tables.menu_stores??0).toLocaleString();$("metric-market").textContent=(tables.ommu_market??0).toLocaleString();
 $("last-refresh").textContent="Private archive · "+new Date(indexManifest.generated_at).toLocaleString();
}
function decodeContent(file){const decoded=atob(file.content.replace(/\s/g,""));const bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0));return new TextDecoder().decode(bytes);}
async function githubGet(path){return invokeFunction("archive-read",{path});}
async function loadIndexTable(table){if(tableCache.has(table))return tableCache.get(table);if(!indexManifest)throw new Error("The private index has not been loaded.");const spec=indexManifest.tables?.[table];if(!spec)throw new Error("The private archive does not contain the "+table+" index.");const shards=await Promise.all(spec.shards.map(async shard=>JSON.parse(decodeContent(await githubGet("archive/app-index/"+shard.file)))));const rows=shards.flat();tableCache.set(table,rows);return rows;}
function text(v){return v===null||v===undefined||v===""?"":String(v);}
function escapeHTML(v){return text(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function formatDate(v){if(!v)return "Date not supplied";const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"});}
function recordTitle(r,table){return text(r.title||r.product_name||r.store_name||r.operator||r.strain_name||r.id||"Untitled record");}
function recordDescription(r,table){if(table==="mentions")return text(r.body||r.full_text||r.page_description||"No text preview is available for this record.");if(table==="menu_items")return [r.strain_name,r.product_format,r.store_name].filter(Boolean).join(" · ")||"Menu listing";if(table==="menu_stores")return text(r.store_slug||r.store_url||"Florida store listing");return [r.period,r.flower_oz!=null?Number(r.flower_oz).toLocaleString()+" oz flower":"",r.locations!=null?r.locations+" locations":""].filter(Boolean).join(" · ");}
function makeCard(r,table){const title=recordTitle(r,table);let meta=[];if(table==="mentions")meta=[r.source,r.feed,formatDate(r.published||r.collected),r.sentiment].filter(Boolean);else if(table==="menu_items")meta=[r.product_type,r.product_format,r.store_name].filter(Boolean);else if(table==="menu_stores")meta=[r.store_slug].filter(Boolean);else meta=[r.operator,formatDate(r.report_date)].filter(Boolean);
 const card=document.createElement("button");card.type="button";card.className="record-card";card.innerHTML='<div class="record-meta">'+meta.map(x=>'<span>'+escapeHTML(x)+'</span>').join(' · ')+'</div><h3>'+escapeHTML(title)+'</h3><p class="record-snippet">'+escapeHTML(recordDescription(r,table))+'</p><span class="record-tag">Open record ↗</span>';
 card.addEventListener("click",()=>openRecord(r,table));return card;}
function renderList(key,table,containerId,moreId,countId){const s=state[key],container=$(containerId);container.replaceChildren();const end=(s.page+1)*PAGE_SIZE;const visible=s.filtered.slice(0,end);if(!visible.length){const empty=document.createElement("div");empty.className="empty-results";empty.textContent="No records match this search.";container.append(empty);}else visible.forEach(r=>container.append(makeCard(r,table)));$(moreId).hidden=visible.length>=s.filtered.length;$(countId).textContent=s.filtered.length.toLocaleString()+" matching records"+(s.filtered.length!==s.rows.length?" · "+s.rows.length.toLocaleString()+" total":"");}
function applyCommunityFilter(){const s=state.community,q=$("community-search").value.trim().toLowerCase(),sent=$("community-filter").value;s.filtered=s.rows.filter(r=>(!sent||text(r.sentiment).toLowerCase()===sent)&&(!q||JSON.stringify(r).toLowerCase().includes(q)));s.page=0;renderList("community","mentions","community-results","community-more","community-count");}
function renderOverviewInsights(){const rows=state.community.rows;if(!rows.length)return;const counts={positive:0,negative:0,neutral:0,unclassified:0};const sources={};rows.forEach(r=>{const sentiment=text(r.sentiment).toLowerCase();counts[sentiment in counts?sentiment:"unclassified"]++;const source=text(r.source||"other");sources[source]=(sources[source]||0)+1;});const total=rows.length;const bars=$("sentiment-breakdown");bars.replaceChildren();Object.entries(counts).forEach(([name,count])=>{const line=document.createElement("div");line.className="insight-bar-row";const label=document.createElement("span");label.textContent=name;const track=document.createElement("div");track.className="insight-track";const fill=document.createElement("i");fill.style.width=(count/total*100)+"%";track.append(fill);const value=document.createElement("strong");value.textContent=count.toLocaleString();line.append(label,track,value);bars.append(line);});$("source-summary").textContent="Sources: "+Object.entries(sources).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+" "+v.toLocaleString()).join(" · ");const recent=$("overview-recent");recent.replaceChildren();rows.slice(0,5).forEach(r=>{const item=document.createElement("button");item.type="button";item.className="recent-item";const title=document.createElement("strong");title.textContent=recordTitle(r,"mentions");const meta=document.createElement("small");meta.textContent=[r.source,r.sentiment,formatDate(r.published||r.collected)].filter(Boolean).join(" · ");const snippet=document.createElement("span");snippet.textContent=recordDescription(r,"mentions");item.append(title,meta,snippet);item.addEventListener("click",()=>openRecord(r,"mentions"));recent.append(item);});}
async function loadCommunity(){if(!sessionToken)return;const s=state.community;if(s.loaded){renderOverviewInsights();applyCommunityFilter();return;}$("community-results").innerHTML='<div class="loading-state">Loading private community index…</div>';try{s.rows=await loadIndexTable("mentions");s.loaded=true;renderOverviewInsights();applyCommunityFilter();}catch(e){$("community-results").innerHTML='<div class="empty-results">'+escapeHTML(e.message)+'</div>';}}
async function loadProducts(){if(!sessionToken)return;const s=state.products,table=s.dataset;if(s.loaded&&s.table===table){applyProductFilter();return;}$("products-results").innerHTML='<div class="loading-state">Loading private '+(table==="menu_items"?"product":"store")+' index…</div>';try{s.rows=await loadIndexTable(table);s.table=table;s.loaded=true;const select=$("products-filter");select.innerHTML=table==="menu_items"?'<option value="">All product types</option>':'';if(table==="menu_items"){[...new Set(s.rows.map(r=>r.product_type).filter(Boolean))].sort().forEach(v=>{const o=document.createElement("option");o.value=v;o.textContent=v;select.append(o);});select.hidden=false;}else select.hidden=true;applyProductFilter();}catch(e){$("products-results").innerHTML='<div class="empty-results">'+escapeHTML(e.message)+'</div>';}}
function applyProductFilter(){const s=state.products,q=$("products-search").value.trim().toLowerCase(),type=$("products-filter").value;s.filtered=s.rows.filter(r=>(!type||r.product_type===type)&&(!q||JSON.stringify(r).toLowerCase().includes(q)));s.page=0;renderList("products",s.dataset,"products-results","products-more","products-count");}
async function loadMarket(){if(!sessionToken)return;const s=state.market;if(s.loaded){applyMarketFilter();return;}$("market-results").innerHTML='<div class="loading-state">Loading private OMMU market index…</div>';try{s.rows=await loadIndexTable("ommu_market");s.loaded=true;applyMarketFilter();}catch(e){$("market-results").innerHTML='<div class="empty-results">'+escapeHTML(e.message)+'</div>';}}
function applyMarketFilter(){const s=state.market,q=$("market-search").value.trim().toLowerCase();s.filtered=s.rows.filter(r=>!q||JSON.stringify(r).toLowerCase().includes(q));s.page=0;renderList("market","ommu_market","market-results","market-more","market-count");}
$("community-search").addEventListener("input",applyCommunityFilter);$("community-filter").addEventListener("change",applyCommunityFilter);$("products-search").addEventListener("input",applyProductFilter);$("products-filter").addEventListener("change",applyProductFilter);$("market-search").addEventListener("input",applyMarketFilter);
$("community-more").addEventListener("click",()=>{state.community.page++;renderList("community","mentions","community-results","community-more","community-count");});$("products-more").addEventListener("click",()=>{state.products.page++;renderList("products",state.products.dataset,"products-results","products-more","products-count");});$("market-more").addEventListener("click",()=>{state.market.page++;renderList("market","ommu_market","market-results","market-more","market-count");});
document.querySelectorAll("[data-dataset]").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll("[data-dataset]").forEach(x=>x.classList.toggle("active",x===b));state.products.dataset=b.dataset.dataset;state.products.loaded=false;state.products.rows=[];state.products.page=0;$("products-search").value="";$("products-filter").value="";loadProducts();}));
async function openRecord(row,table){if(!sessionToken)return;const modal=$("record-dialog"),detail=$("record-detail");$("record-title").textContent=recordTitle(row,table);$("record-kicker").textContent=table.replaceAll("_"," ").toUpperCase()+" · PRIVATE ARCHIVE";detail.innerHTML='<div class="loading-state">Fetching full private record…</div>';modal.showModal();try{const file=await githubGet(row.path);const record=JSON.parse(decodeContent(file));detail.replaceChildren();Object.entries(record).forEach(([key,value])=>{if(value===null||value==="")return;const wrap=document.createElement("div");wrap.className="detail-field";const label=document.createElement("strong");label.textContent=key.replaceAll("_"," ");const p=document.createElement("p");if(typeof value==="string"&&/^https?:\/\//i.test(value)){const a=document.createElement("a");a.href=value;a.target="_blank";a.rel="noopener noreferrer";a.textContent=value;p.append(a);}else p.textContent=typeof value==="object"?JSON.stringify(value,null,2):String(value);wrap.append(label,p);detail.append(wrap);});}catch(e){detail.innerHTML='<div class="empty-results">Could not load this record: '+escapeHTML(e.message)+'</div>';}}
$("record-close").addEventListener("click",()=>$("record-dialog").close());$("record-dialog").addEventListener("click",e=>{if(e.target.id==="record-dialog")e.currentTarget.close();});
window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();installPrompt=event;$("install-button").hidden=false;});$("install-button").addEventListener("click",async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$("install-button").hidden=true;});
if("serviceWorker"in navigator&&location.protocol.startsWith("http"))window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
