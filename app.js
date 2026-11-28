const inviteQuery = new URLSearchParams(window.location.search);
const inviteHash = new URLSearchParams(window.location.hash.slice(1));
const inviteTokenHash = inviteQuery.get("token_hash") || inviteHash.get("token_hash");
const inviteType = inviteQuery.get("type") || inviteHash.get("type");
const SUPABASE_URL = window.FCP_CONFIG?.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = window.FCP_CONFIG?.SUPABASE_ANON_KEY || "";
const authReady = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase?.createClient);
const supabaseClient = authReady ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
}) : null;
let sessionToken = null;
let currentUser = null;
let currentRole = "standard";
let awaitingInvitePassword = false;
let inviteVerificationInProgress = Boolean(inviteTokenHash);
let activeSessionUserId = null;
let loginInProgress = false;
let installPrompt = null;
let indexManifest = null;
let dataMode = "archive";
let syncMetadata = null;
const tableCache = new Map();
const PAGE_SIZE = 50;
const state = { community: { rows: [], filtered: [], page: 0, loaded: false, view: "all" }, products: { rows: [], filtered: [], page: 0, loaded: false, dataset: "menu_items", view: "all" }, market: { rows: [], filtered: [], page: 0, loaded: false } };
const $ = id => document.getElementById(id);
function setConnection(connected, label) { const pill=$("connection-pill"); pill.className="pill "+(connected?"online":"offline"); pill.innerHTML="<i></i> "+(label||(connected?"ACCOUNT CONNECTED":"SIGNED OUT")); }
function showTab(name) { document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===name)); document.querySelectorAll(".panel").forEach(p=>p.classList.toggle("active-panel",p.id===name)); if(sessionToken){ if(name==="community") loadCommunity(); if(name==="products") loadProducts(); if(name==="market") loadMarket(); } }
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.tab)));
document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.go)));
function initDashboardLayout(){
 const overview=$("overview");if(!overview||$("dashboard-layout"))return;
 const layout=document.createElement("div");layout.id="dashboard-layout";layout.className="dashboard-layout";
 const nodes=[];
 const weekly=overview.querySelector(".weekly-pulse");if(weekly)nodes.push(weekly);
 overview.querySelectorAll(".overview-insights").forEach(group=>{[...group.children].forEach(node=>nodes.push(node));group.remove();});
 const reviews=overview.querySelector(".overview-review-panel");if(reviews)nodes.push(reviews);
 const features=overview.querySelector(".content-grid");if(features){[...features.children].forEach(node=>nodes.push(node));features.remove();}
 nodes.forEach((node,index)=>{
  node.dataset.dashboardSection="section-"+(index+1);
  const heading=node.querySelector("h2,h3"),controls=document.createElement("div");
  controls.className="section-reorder";
  const makeButton=(direction,label,symbol)=>{const button=document.createElement("button");button.type="button";button.className="section-move-button";button.textContent=symbol;button.title=label;button.setAttribute("aria-label",label+": "+(heading?.textContent||"Dashboard section"));button.addEventListener("click",()=>moveDashboardSection(node,direction,layout));return button;};
  controls.append(makeButton(-1,"Move section up","↑"),makeButton(1,"Move section down","↓"));
  const header=node.querySelector(".section-heading,.insight-heading");
  if(header){header.append(controls);header.classList.add("dashboard-section-heading");}else{controls.classList.add("section-reorder-corner");node.append(controls);}
  layout.append(node);
 });
 const metric=overview.querySelector(".metric-grid");metric?.after(layout);
 try{const saved=JSON.parse(localStorage.getItem("fcp-overview-order")||"[]");saved.forEach(key=>{const item=[...layout.children].find(n=>n.dataset.dashboardSection===key);if(item)layout.append(item);});}catch{}
 updateDashboardMoveButtons(layout);
}
function moveDashboardSection(node,direction,layout){
 const sibling=direction<0?node.previousElementSibling:node.nextElementSibling;if(!sibling)return;
 if(direction<0)layout.insertBefore(node,sibling);else layout.insertBefore(sibling,node);
 saveDashboardOrder(layout);updateDashboardMoveButtons(layout);
}
function updateDashboardMoveButtons(layout){
 [...layout.children].forEach((node,index)=>{const buttons=node.querySelectorAll(".section-move-button");if(buttons.length===2){buttons[0].disabled=index===0;buttons[1].disabled=index===layout.children.length-1;}});
}
function saveDashboardOrder(layout){try{localStorage.setItem("fcp-overview-order",JSON.stringify([...layout.children].map(n=>n.dataset.dashboardSection)));}catch{}}

initDashboardLayout();

function authError(message){$("auth-error").textContent=message||"";}
function showLogin(message=""){activeSessionUserId=null;awaitingInvitePassword=false;$("refresh-data").hidden=true;$("login-form").hidden=false;$("set-password-form").hidden=true;$("auth-screen").hidden=false;$("app-content").hidden=true;$("admin-open").hidden=true;$("signout-button").hidden=true;setConnection(false,"SIGNED OUT");authError(message);}
function showDashboard(){$("auth-screen").hidden=true;$("app-content").hidden=false;$("refresh-data").hidden=false;$("signout-button").hidden=false;$("admin-open").hidden=currentRole!=="admin";setConnection(true,currentRole==="admin"?"ADMIN ACCOUNT":"STANDARD ACCOUNT");}
async function invokeFunction(name,body){
 const {data:{session}}=await supabaseClient.auth.getSession();
 if(!session?.access_token)throw new Error("Your session has expired. Please sign in again.");
 const response=await fetch(SUPABASE_URL+"/functions/v1/"+name,{method:"POST",headers:{"Content-Type":"application/json","apikey":SUPABASE_ANON_KEY,"Authorization":"Bearer "+session.access_token},body:JSON.stringify(body)});
 const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||"Secure service request failed ("+response.status+").");return result;
}
function resetDashboardData(){
 tableCache.clear();indexManifest=null;dataMode="archive";syncMetadata=null;
 state.community={rows:[],filtered:[],page:0,loaded:false};
 state.products={rows:[],filtered:[],page:0,loaded:false,dataset:"menu_items"};
 state.market={rows:[],filtered:[],page:0,loaded:false};
 $("metric-mentions").textContent="--";$("metric-products").textContent="--";$("metric-stores").textContent="--";$("metric-market").textContent="--";
 $("last-refresh").textContent="Waiting for private data";
}
async function startAuthenticatedSession(session){
 if(inviteTokenHash && inviteVerificationInProgress)return;
 if(!session){sessionToken=null;currentUser=null;currentRole="standard";activeSessionUserId=null;resetDashboardData();showLogin();return;}
 if(activeSessionUserId && activeSessionUserId!==session.user.id)resetDashboardData();
 sessionToken=session.access_token;currentUser=session.user;
 if(awaitingInvitePassword){$("login-form").hidden=true;$("set-password-form").hidden=false;$("auth-screen").hidden=false;$("app-content").hidden=true;return;}
 if(activeSessionUserId===session.user.id && !$("app-content").hidden)return;
 activeSessionUserId=session.user.id;
 const {data:profile,error}=await supabaseClient.from("user_profiles").select("role,email").eq("user_id",session.user.id).single();
 if(error||!profile){await supabaseClient.auth.signOut();showLogin("Your account profile is not ready. Contact the dashboard administrator.");return;}
 currentRole=profile.role==="admin"?"admin":"standard";showDashboard();
 try{await loadPrivateCatalog();await loadCommunity();await preloadOverviewData();}
 catch(e){$("last-refresh").textContent="Private archive unavailable";$("community-results").innerHTML="<div class=\"empty-results\">Signed in successfully, but the private archive could not load: "+escapeHTML(e.message)+"</div>";}
}
$("login-form").addEventListener("submit",async event=>{
 event.preventDefault();authError("");loginInProgress=true;const button=$("login-submit");button.disabled=true;button.textContent="Signing in…";
 try{
  if(!authReady)throw new Error("Authentication is not configured yet. The dashboard administrator must finish the secure service setup.");
  const {data,error}=await supabaseClient.auth.signInWithPassword({email:$("login-email").value.trim(),password:$("login-password").value});
  if(error)throw error;
  await startAuthenticatedSession(data.session);
 }catch(e){authError(e.message||"Could not sign in.");}
 finally{loginInProgress=false;button.disabled=false;button.textContent="Sign in";}
});
$("google-login-button").addEventListener("click",async()=>{
 const button=$("google-login-button");authError("");button.disabled=true;button.textContent="Connecting to Google…";
 try{
  if(!authReady)throw new Error("Authentication is not configured yet.");
  const redirectTo=new URL("./",window.location.href).toString();
  const {error}=await supabaseClient.auth.signInWithOAuth({provider:"google",options:{redirectTo}});
  if(error)throw error;
 }catch(e){authError(e.message||"Could not start Google sign-in.");button.disabled=false;button.innerHTML='<span class="google-mark" aria-hidden="true">G</span> Continue with Google';}
});
$("set-password-form").addEventListener("submit",async event=>{event.preventDefault();authError("");try{const password=$("new-password").value;if(password.length<12)throw new Error("Use at least 12 characters.");const {error}=await supabaseClient.auth.updateUser({password});if(error)throw error;$("set-password-form").hidden=true;awaitingInvitePassword=false;activeSessionUserId=null;await startAuthenticatedSession((await supabaseClient.auth.getSession()).data.session);}catch(e){authError(e.message||"Could not set password.");}});
$("signout-button").addEventListener("click",async()=>{await supabaseClient?.auth.signOut();});
supabaseClient?.auth.onAuthStateChange((event,session)=>{
 // The initial empty session is handled by getSession() below. In particular,
 // do not let it clear a login error or reset the form during password sign-in.
 if(event==="INITIAL_SESSION")return;
 if(event==="SIGNED_OUT" && loginInProgress)return;
 if(event==="SIGNED_IN" || event==="TOKEN_REFRESHED" || event==="USER_UPDATED" || event==="SIGNED_OUT"){
  setTimeout(()=>startAuthenticatedSession(session),0);
 }
});
async function acceptInviteFromTokenHash(){
 if(!inviteTokenHash || inviteType!=="invite")return;
 const button=$("accept-invite-button");button.disabled=true;button.textContent="Verifying invitation…";authError("");
 try{
  const {data,error}=await supabaseClient.auth.verifyOtp({token_hash:inviteTokenHash,type:"invite"});
  if(error)throw error;
  history.replaceState(null,"",location.pathname);
  inviteVerificationInProgress=false;
  awaitingInvitePassword=true;
  $("accept-invite-panel").hidden=true;
  await startAuthenticatedSession(data.session);
 }catch(e){
  inviteVerificationInProgress=false;
  history.replaceState(null,"",location.pathname);
  $("accept-invite-panel").hidden=true;
  showLogin("Could not verify this invitation. It may have expired or already been used. Ask the administrator to generate a fresh link.");
 }
}
$("accept-invite-button").addEventListener("click",acceptInviteFromTokenHash);
async function completeOAuthCallback(){
 const params=new URLSearchParams(window.location.search);
 const code=params.get("code");
 const oauthError=params.get("error_description")||params.get("error");
 if(oauthError){history.replaceState(null,"",location.pathname+location.hash);showLogin(oauthError);return true;}
 if(!code)return false;
 const button=$("google-login-button");button.disabled=true;button.textContent="Finishing Google sign-in…";
 try{
  const {data,error}=await supabaseClient.auth.exchangeCodeForSession(code);
  if(error)throw error;
  history.replaceState(null,"",location.pathname);
  await startAuthenticatedSession(data.session);
 }catch(e){history.replaceState(null,"",location.pathname);showLogin(e.message||"Google sign-in could not be completed.");}
 return true;
}
if(!authReady){inviteVerificationInProgress=false;showLogin("Secure sign-in is being configured. Please check back after the administrator completes setup.");}
else if(inviteTokenHash){
 if(inviteType==="invite"){
  $("login-form").hidden=true;$("set-password-form").hidden=true;$("accept-invite-panel").hidden=false;$("auth-screen").hidden=false;$("app-content").hidden=true;
 }else{inviteVerificationInProgress=false;showLogin("This invitation link is incomplete. Ask the administrator to generate a fresh link.");}
}else if(new URLSearchParams(window.location.search).has("code")||new URLSearchParams(window.location.search).has("error")){completeOAuthCallback();}
else{supabaseClient.auth.getSession().then(({data})=>{if(data.session)startAuthenticatedSession(data.session);else showLogin();});}

const adminDialog=$("admin-dialog");
$("admin-open").addEventListener("click",()=>{if(currentRole!=="admin")return;adminDialog.showModal();loadAdminUsers();});
$("admin-close").addEventListener("click",()=>adminDialog.close());
$("users-refresh").addEventListener("click",loadAdminUsers);
$("invite-form").addEventListener("submit",async event=>{event.preventDefault();const email=$("invite-email").value.trim();const msg=$("admin-message");msg.textContent="Generating secure invitation link…";try{const result=await invokeFunction("admin-users",{action:"invite",email});msg.replaceChildren();const note=document.createElement("p");note.textContent="Invitation link created for "+email+". Copy it and send it directly to the recipient.";const link=document.createElement("input");link.type="text";link.readOnly=true;link.value=result.invitation_url;link.setAttribute("aria-label","Invitation link");link.className="invite-link-field";const copy=document.createElement("button");copy.type="button";copy.className="button button-primary";copy.textContent="Copy invitation link";copy.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(result.invitation_url);copy.textContent="Copied!";}catch(e){link.focus();link.select();msg.dataset.copyFallback="true";copy.textContent="Select and copy link";}});msg.append(note,link,copy);$("invite-email").value="";await loadAdminUsers();}catch(e){msg.textContent=e.message;}});
async function loadAdminUsers(){if(currentRole!=="admin")return;const target=$("admin-users");target.textContent="Loading accounts…";try{const result=await invokeFunction("admin-users",{action:"list"});target.replaceChildren();result.users.forEach(user=>{
 const row=document.createElement("div");row.className="admin-user-row";const info=document.createElement("div");const email=document.createElement("strong");email.textContent=user.email||"Pending invitation";const meta=document.createElement("small");meta.textContent=(user.role||"standard").toUpperCase()+" · "+(user.last_sign_in_at?"Last sign-in "+new Date(user.last_sign_in_at).toLocaleDateString():"Not signed in yet");info.append(email,meta);row.append(info);
 if(user.id!==currentUser?.id){const role=document.createElement("select");role.setAttribute("aria-label","Role for "+user.email);["standard","admin"].forEach(v=>{const o=document.createElement("option");o.value=v;o.textContent=v==="admin"?"Administrator":"Standard user";role.append(o);});role.value=user.role||"standard";role.addEventListener("change",async()=>{try{await invokeFunction("admin-users",{action:"role",userId:user.id,role:role.value});$("admin-message").textContent="Account role updated.";}catch(e){$("admin-message").textContent=e.message;loadAdminUsers();}});row.append(role);
 const status=document.createElement("button");status.className="button button-outline";status.textContent=user.banned_until?"Restore":"Suspend";status.addEventListener("click",async()=>{try{await invokeFunction("admin-users",{action:user.banned_until?"restore":"suspend",userId:user.id});$("admin-message").textContent="Account status updated.";loadAdminUsers();}catch(e){$("admin-message").textContent=e.message;}});row.append(status);}
 target.append(row);
 });if(!result.users.length)target.textContent="No accounts yet.";
 }catch(e){target.textContent=e.message;}}

async function refreshDashboardData(){
 if(!sessionToken)return;
 const button=$("refresh-data");button.disabled=true;button.textContent="Refreshing…";
 try{
  resetDashboardData();
  await loadPrivateCatalog();
  await loadCommunity();
  await preloadOverviewData();
  const active=document.querySelector(".tab.active")?.dataset.tab;
  if(active==="products")await loadProducts();
  if(active==="market")await loadMarket();
 }catch(e){$("last-refresh").textContent="Refresh failed · "+e.message;}
 finally{button.disabled=false;button.textContent="Refresh dashboard";}
}
$("refresh-data").addEventListener("click",refreshDashboardData);
let autoRefreshBusy=false;
async function checkForNewScraperSync(){if(!sessionToken||dataMode!=="live"||autoRefreshBusy||document.hidden||$("refresh-data").disabled)return;try{const {data,error}=await supabaseClient.from("pulse_sync_state").select("last_success_at").eq("id","scraper").maybeSingle();if(!error&&data?.last_success_at&&data.last_success_at!==syncMetadata?.last_success_at){autoRefreshBusy=true;try{await refreshDashboardData();}finally{autoRefreshBusy=false;}}}catch(e){/* A transient status check must not interrupt the current dashboard session. */}}
window.setInterval(checkForNewScraperSync,120000);

async function loadPrivateCatalog(){
 // Prefer the direct scraper-fed Supabase tables. The private GitHub archive remains a safe fallback.
 try{
  const {data,error}=await supabaseClient.from("pulse_sync_state").select("last_success_at,last_run_id,record_counts,last_batch_records").eq("id","scraper").maybeSingle();
  if(!error&&data){dataMode="live";syncMetadata=data;const counts=data.record_counts||{};
   $("metric-mentions").textContent=(counts.mentions??0).toLocaleString();$("metric-products").textContent=(counts.menu_items??0).toLocaleString();$("metric-stores").textContent=(counts.menu_stores??0).toLocaleString();$("metric-market").textContent=(counts.ommu_market??0).toLocaleString();
   const syncedAt=new Date(data.last_success_at),ageMinutes=Math.max(0,Math.round((Date.now()-syncedAt.getTime())/60000));
   $("last-refresh").textContent=(ageMinutes>45?"Sync may be delayed · ":"Live scraper sync · ")+syncedAt.toLocaleString()+" · "+ageMinutes+" min ago";
   setConnection(true,currentRole==="admin"?"ADMIN · LIVE DATA":"LIVE SCRAPER DATA");return;
  }
 }catch(e){/* A not-yet-deployed live schema is expected during local development. */}
 dataMode="archive";syncMetadata=null;
 const [catalogFile,indexFile]=await Promise.all([githubGet("archive/catalog.json"),githubGet("archive/app-index/manifest.json")]);
 const catalog=JSON.parse(decodeContent(catalogFile));indexManifest=JSON.parse(decodeContent(indexFile));const tables=catalog.tables||{};
 $("metric-mentions").textContent=(tables.mentions??0).toLocaleString();$("metric-products").textContent=(tables.menu_items??0).toLocaleString();$("metric-stores").textContent=(tables.menu_stores??0).toLocaleString();$("metric-market").textContent=(tables.ommu_market??0).toLocaleString();
 $("last-refresh").textContent="GitHub archive snapshot · "+new Date(indexManifest.generated_at).toLocaleString();setConnection(true,currentRole==="admin"?"ADMIN · ARCHIVE":"ARCHIVE SNAPSHOT");
}
function decodeContent(file){const decoded=atob(file.content.replace(/\s/g,""));const bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0));return new TextDecoder().decode(bytes);}
async function githubGet(path){return invokeFunction("archive-read",{path});}
async function loadIndexTable(table){
 if(tableCache.has(table))return tableCache.get(table);
 let rows=[];
 if(dataMode==="live"){
  const {count,error:countError}=await supabaseClient.from("pulse_records").select("record_id",{count:"exact",head:true}).eq("record_type",table);
  if(countError)throw countError;
  const total=count||0, pages=[];for(let start=0;start<total;start+=1000)pages.push([start,Math.min(start+999,total-1)]);
  const results=await Promise.all(pages.map(([start,end])=>supabaseClient.from("pulse_records").select("record_id,payload").eq("record_type",table).order("record_id").range(start,end)));
  for(const result of results){if(result.error)throw result.error;rows.push(...(result.data||[]).map(x=>({...x.payload,_record_id:x.record_id})));}
  const dateKey=r=>r.last_attempt||r.collected||r.published||r.first_seen||r.report_date||"";
  rows.sort((a,b)=>String(dateKey(b)).localeCompare(String(dateKey(a))));
 }else{
  if(!indexManifest)throw new Error("The private index has not been loaded.");
  const spec=indexManifest.tables?.[table];if(!spec)throw new Error("The private archive does not contain the "+table+" index.");
  const shards=await Promise.all(spec.shards.map(async shard=>JSON.parse(decodeContent(await githubGet("archive/app-index/"+shard.file)))));rows=shards.flat();
 }
 tableCache.set(table,rows);return rows;
}
async function preloadOverviewData(){
 const results=await Promise.allSettled([loadIndexTable("menu_items"),loadIndexTable("ommu_market"),...(dataMode==="live"?[loadIndexTable("sweed_menu_items"),loadIndexTable("weedmaps_products")]:[])]);
 if(results[0].status==="fulfilled"){const catalog=[results[0].value];if(results[2]?.status==="fulfilled")catalog.push(results[2].value);if(results[3]?.status==="fulfilled")catalog.push(results[3].value);state.products.rows=catalog.flat();state.products.loaded=true;state.products.table="menu_items";renderProductInsights();}
 if(results[1].status==="fulfilled"){state.market.rows=results[1].value;state.market.loaded=true;renderMarketInsights();renderWeeklyDispensations(state.market.rows);}
 if(dataMode==="live"){
  try{renderSourceStatus(await loadIndexTable("source_status"));}catch(e){renderSourceStatus([]);}
 }else{renderSourceStatus([]);}
}

function text(v){return v===null||v===undefined||v===""?"":String(v);}
function escapeHTML(v){return text(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function formatDate(v){if(!v)return "Date not supplied";const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"});}
function recordTitle(r,table){return text(r.title||r.product_name||r.store_name||r.operator||r.strain_name||r.id||"Untitled record");}
function recordDescription(r,table){if(table==="mentions"||table==="mention_comments"||table==="google_reviews_cache"||table==="meta_page_comments"||table==="weedmaps_reviews"||table==="meta_page_posts")return text(r.body||r.full_text||r.page_description||"No text preview is available for this record.");if(["menu_items","sweed_menu_items","weedmaps_products"].includes(table))return [r.brand_name,r.strain_name,r.product_format,r.product_type,r.store_name].filter(Boolean).join(" · ")||"Product catalog listing";if(table==="menu_stores"||table==="sweed_menu_stores")return text(r.store_slug||r.store_url||r.store_name||"Florida store listing");return [r.period,r.flower_oz!=null?Number(r.flower_oz).toLocaleString()+" oz flower":"",r.locations!=null?r.locations+" locations":""].filter(Boolean).join(" · ");}
function makeCard(r,table){const title=recordTitle(r,table);let meta=[];if(table==="mentions")meta=[r.source,r.feed,formatDate(r.published||r.collected),r.sentiment,r.rating?"★ "+r.rating:(r.star_rating?"★ "+r.star_rating:"")];else if(["menu_items","sweed_menu_items","weedmaps_products"].includes(table))meta=[r.brand_name,r.product_type,r.product_format,r.store_name].filter(Boolean);else if(table==="menu_stores"||table==="sweed_menu_stores")meta=[r.store_slug||r.store_name].filter(Boolean);else meta=[r.operator,formatDate(r.report_date)].filter(Boolean);
 const tags=r.entity_tags||{};const labels=[...(tags.brands||[]),...(tags.product_brands||[]),...(tags.products||[]),...(tags.product_types||[]),...(tags.strains||[]),...(tags.stores||[]),...(tags.batches||[])].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).slice(0,7);const chips=labels.length?'<div class="entity-chips">'+labels.map(v=>'<span class="entity-chip">'+escapeHTML(v)+'</span>').join('')+'</div>':'';
 const card=document.createElement("button");card.type="button";card.className="record-card";card.innerHTML='<div class="record-meta">'+meta.filter(Boolean).map(x=>'<span>'+escapeHTML(x)+'</span>').join(' · ')+'</div>'+chips+'<h3>'+escapeHTML(title)+'</h3><p class="record-snippet">'+escapeHTML(recordDescription(r,table))+'</p><span class="record-tag">Open record ↗</span>';card.addEventListener("click",()=>openRecord(r,table));return card;}
function renderList(key,table,containerId,moreId,countId){const s=state[key],container=$(containerId);container.replaceChildren();const end=(s.page+1)*PAGE_SIZE;const visible=s.filtered.slice(0,end);if(!visible.length){const empty=document.createElement("div");empty.className="empty-results";empty.textContent="No records match this search.";container.append(empty);}else visible.forEach(r=>container.append(makeCard(r,table)));$(moreId).hidden=visible.length>=s.filtered.length;$(countId).textContent=s.filtered.length.toLocaleString()+" matching records"+(s.filtered.length!==s.rows.length?" · "+s.rows.length.toLocaleString()+" total":"");}
function applyCommunityFilter(){const s=state.community,q=$("community-search").value.trim().toLowerCase(),sent=$("community-filter").value,brand=$("community-brand-filter").value,view=s.view||"all";s.filtered=s.rows.filter(r=>{const tags=r.entity_tags||{},entities=[...(tags.brands||[]),...(tags.product_brands||[]),...(tags.products||[]),...(tags.strains||[])],kind=(text(r.product_type)+" "+text(r.product_format)+" "+JSON.stringify(tags)).toLowerCase(),source=text(r.source).toLowerCase(),tone=text(r.sentiment).toLowerCase(),isFeedback=!/news|web|curaleaf facebook post/i.test(source)&&r.content_type!=="brand-owned post";let viewOK=true;if(view==="positive")viewOK=tone==="positive"&&isFeedback;else if(view==="negative")viewOK=tone==="negative"&&isFeedback;else if(view==="events")viewOK=/news|web|event/i.test(source)||/event/i.test(text(r.title)+" "+text(r.body));else if(view==="rosin")viewOK=/live rosin|\brosin\b/.test(kind);else if(view==="resin")viewOK=/live resin/.test(kind);else if(view==="hash")viewOK=/bubble|ice.water|hash/.test(kind);return viewOK&&(!sent||tone===sent)&&(!brand||entities.includes(brand))&&(!q||JSON.stringify(r).toLowerCase().includes(q));});s.page=0;renderList("community","mentions","community-results","community-more","community-count");}
function renderOverviewInsights(){const rows=state.community.rows;if(!rows.length)return;renderReputationInsights();renderOverviewReviewInsights();const reddit=rows.filter(r=>text(r.source).toLowerCase()==="reddit");const counts={positive:0,negative:0,neutral:0,mixed:0,unclassified:0};const sources={};rows.forEach(r=>{const source=text(r.source||"other");sources[source]=(sources[source]||0)+1;});reddit.forEach(r=>{const sentiment=text(r.sentiment).toLowerCase();counts[sentiment in counts?sentiment:"unclassified"]++;});const bars=$("sentiment-breakdown");bars.replaceChildren();if(!reddit.length){const p=document.createElement("p");p.className="insight-footnote";p.textContent="No Reddit customer-post sample is available yet. News and brand announcements are deliberately excluded from sentiment.";bars.append(p);}else{Object.entries(counts).forEach(([name,count])=>{const line=document.createElement("div");line.className="insight-bar-row";const label=document.createElement("span");label.textContent=name;const track=document.createElement("div");track.className="insight-track";const fill=document.createElement("i");fill.style.width=(count/reddit.length*100)+"%";track.append(fill);const value=document.createElement("strong");value.textContent=count.toLocaleString();line.append(label,track,value);bars.append(line);});}$("source-summary").textContent="Based on "+reddit.length.toLocaleString()+" Reddit search-index previews only. "+reddit.filter(r=>["positive","negative","neutral","mixed"].includes(text(r.sentiment).toLowerCase())).length.toLocaleString()+" have a classified sentiment; this small, incomplete sample is directional, not representative. Google and Weedmaps star ratings are shown separately when available; Facebook comments and Curaleaf-owned posts are not mixed into this Reddit sentiment sample. Source mix: "+Object.entries(sources).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+" "+v.toLocaleString()).join(" · ");const recent=$("overview-recent");recent.replaceChildren();rows.slice(0,5).forEach(r=>{const item=document.createElement("button");item.type="button";item.className="recent-item";const title=document.createElement("strong");title.textContent=recordTitle(r,"mentions");const meta=document.createElement("small");meta.textContent=[r.source,r.sentiment,formatDate(r.published||r.collected)].filter(Boolean).join(" · ");const snippet=document.createElement("span");snippet.textContent=recordDescription(r,"mentions");item.append(title,meta,snippet);item.addEventListener("click",()=>openRecord(r,"mentions"));recent.append(item);});const cutoff=Date.now()-7*86400000;const recentCount=rows.filter(r=>{const d=new Date(r.collected||r.published||0).getTime();return Number.isFinite(d)&&d>=cutoff;}).length;const activity=$("activity-summary");if(activity)activity.textContent=recentCount.toLocaleString()+" indexed records in the last 7 days · "+rows.length.toLocaleString()+" total";
 const preview=$("overview-voice-preview");if(preview){preview.replaceChildren();rows.slice(0,3).forEach(r=>{const item=document.createElement("button");item.type="button";item.className="recent-item";const title=document.createElement("strong");title.textContent=recordTitle(r,"mentions");const meta=document.createElement("small");meta.textContent=[r.source,r.sentiment,formatDate(r.published||r.collected)].filter(Boolean).join(" · ");const snippet=document.createElement("span");snippet.textContent=recordDescription(r,"mentions");item.append(title,meta,snippet);item.addEventListener("click",()=>openRecord(r,"mentions"));preview.append(item);});if(!rows.length)preview.textContent="No customer voice records are available.";}
}
function renderOverviewReviewInsights(){const target=$("overview-reviews");if(!target)return;const reviews=state.community.rows.filter(r=>["google business profile","weedmaps product review"].includes(text(r.source).toLowerCase())).sort((a,b)=>String(b.published||b.last_seen||"").localeCompare(String(a.published||a.last_seen||""))).slice(0,5);target.replaceChildren();if(!reviews.length){const p=document.createElement("p");p.className="muted";p.textContent="No Google or Weedmaps review records are available in the connected archive. Other public conversation previews remain available in Community.";target.append(p);$("overview-reviews-note").textContent="Review coverage depends on each connected source and is not a complete review census.";return;}reviews.forEach(r=>{const item=document.createElement("button");item.type="button";item.className="overview-review-item";const title=document.createElement("strong");title.textContent=recordTitle(r,"mentions");const rating=document.createElement("b");const score=Number(r.star_rating||r.rating);rating.textContent=Number.isFinite(score)&&score>0?"★ "+score.toFixed(1):text(r.sentiment||"Review");const meta=document.createElement("small");meta.textContent=[r.source,r.store_name||r.product_name,formatDate(r.published||r.last_seen)].filter(Boolean).join(" · ");const body=document.createElement("span");body.textContent=recordDescription(r,"mentions");item.append(title,rating,meta,body);item.addEventListener("click",()=>openRecord(r,"mentions"));target.append(item);});$("overview-reviews-note").textContent=reviews.length+" recent records shown from the connected Google / Weedmaps feeds. Coverage is source-dependent and not representative.";}
function renderProductInsights(){
 const rows=state.products.rows;if(!rows.length)return;
 const target=$("product-mix-bars"),note=$("product-mix-note");if(!target)return;
 const flower=rows.filter(r=>/\bflower\b/i.test(text(r.product_type)+" "+text(r.product_format))).length;
 const rosin=rows.filter(r=>/\brosin\b/i.test(text(r.product_type)+" "+text(r.product_format))).length;
 const total=flower+rosin,stores=new Set(rows.map(r=>text(r.store_name||r.location||r.store_slug)).filter(Boolean)).size;
 target.replaceChildren();
 [{label:"Flower",count:flower},{label:"Rosin",count:rosin}].forEach(item=>{
  const line=document.createElement("div");line.className="insight-bar-row product-compare-row";
  const label=document.createElement("span");label.textContent=item.label;
  const track=document.createElement("div");track.className="insight-track";
  const fill=document.createElement("i");fill.style.width=(total?item.count/total*100:0)+"%";track.append(fill);
  const value=document.createElement("strong");value.textContent=item.count.toLocaleString();
  line.append(label,track,value);target.append(line);
 });
 if(note)note.textContent=total?flower.toLocaleString()+" flower listings vs. "+rosin.toLocaleString()+" rosin listings"+(stores?" across "+stores.toLocaleString()+" identified store locations":"")+". Counts reflect catalog listings available in connected feeds, not units physically in stock." : "No flower or rosin listings are available in the connected catalog yet.";
 const preview=$("overview-product-preview");if(preview){preview.replaceChildren();const summary=document.createElement("p");summary.className="insight-footnote";summary.textContent=rows.length.toLocaleString()+" catalog listings · "+flower.toLocaleString()+" flower · "+rosin.toLocaleString()+" rosin · "+stores.toLocaleString()+" identified locations";preview.append(summary);rows.slice(0,3).forEach(r=>{const line=document.createElement("div");line.className="operator-product-row";const name=document.createElement("strong");name.textContent=text(r.product_name||r.strain_name||"Unnamed listing");const meta=document.createElement("span");meta.textContent=[r.product_type,r.product_format,r.store_name].filter(Boolean).join(" · ");line.append(name,meta);preview.append(line);});if(!rows.length)preview.textContent="No product listings are available.";}

}
function renderWeeklyDispensations(rows){
 const reports=[...new Set(rows.map(r=>r.report_date).filter(Boolean))].sort().slice(-52),latest=reports.at(-1);if(!latest)return;
 const current=rows.filter(r=>r.report_date===latest),select=$("ommu-operator-select"),prior=select.value||"Curaleaf",operators=[...new Set(rows.map(r=>r.operator).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
 $("ommu-latest-period").textContent=(current[0]?.period||"Latest report")+" · report "+formatDate(latest);
 select.replaceChildren();operators.forEach(name=>select.add(new Option(name,name)));select.value=operators.includes(prior)?prior:(operators.find(n=>/curaleaf/i.test(n))||operators[0]);
 drawOMMUHistory();
 $("ommu-trend-note").textContent="Official OMMU weekly reports · "+reports.length+" reporting weeks available. Dispensed amounts are not sales revenue.";
}
function drawOMMUHistory(){
 const rows=state.market.rows,select=$("ommu-operator-select"),metric=$("ommu-chart-metric"),target=$("ommu-history-chart"),tableTarget=$("ommu-history-table");if(!target||!rows.length)return;
 const dates=[...new Set(rows.map(r=>r.report_date).filter(Boolean))].sort().slice(-52),operator=select.value||"Curaleaf",key=metric.value||"thc_mg",latestDate=dates.at(-1),latestRows=rows.filter(r=>r.report_date===latestDate),selected=latestRows.find(r=>r.operator===operator),totalTHC=latestRows.reduce((n,r)=>n+(Number(r.thc_mg)||0),0);
 const ranked=latestRows.slice().sort((a,b)=>(Number(b.thc_mg)||0)-(Number(a.thc_mg)||0)),rank=ranked.findIndex(r=>r.operator===operator)+1,share=totalTHC&&selected?100*(Number(selected.thc_mg)||0)/totalTHC:0;
 $("ommu-thc-latest").textContent=selected?(Number(selected.thc_mg)||0).toLocaleString()+" mg":"No report";
 const context=$("ommu-operator-context");if(context)context.textContent=selected?"Ranked #"+rank+" of "+ranked.length+" operators · "+share.toFixed(1)+"% of statewide THC dispensed":"No record for this operator in the latest report";

 const fmt=v=>key==="thc_mg"?(v>=1e6?(v/1e6).toFixed(2)+"M":Math.round(v/1000).toLocaleString()+"K"):key==="flower_oz"?(v>=1000?(v/1000).toFixed(1)+"K":Math.round(v).toLocaleString()):v.toFixed(1)+"%";
 const values=dates.map(date=>{const week=rows.filter(r=>r.report_date===date),row=week.find(r=>r.operator===operator),total=week.reduce((n,r)=>n+(Number(r.thc_mg)||0),0);if(!row)return 0;return key==="share"?(total?100*(Number(row.thc_mg)||0)/total:0):Number(row[key])||0;});

 target.replaceChildren();const w=900,h=300,left=62,right=18,top=22,bottom=58,pw=w-left-right,ph=h-top-bottom,max=Math.max(1,...values),slot=pw/Math.max(1,dates.length),barWidth=Math.max(3,Math.min(24,slot*.62)),svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
 svg.setAttribute("viewBox","0 0 "+w+" "+h);svg.setAttribute("role","img");svg.setAttribute("aria-label",operator+" weekly OMMU bar chart");
 for(let i=0;i<5;i++){const v=max*(1-i/4),y=top+ph*i/4,line=document.createElementNS(svg.namespaceURI,"line");line.setAttribute("x1",left);line.setAttribute("x2",w-right);line.setAttribute("y1",y);line.setAttribute("y2",y);line.setAttribute("stroke","#e6ece6");svg.append(line);const label=document.createElementNS(svg.namespaceURI,"text");label.setAttribute("x",left-9);label.setAttribute("y",y+4);label.setAttribute("text-anchor","end");label.setAttribute("font-size","10");label.setAttribute("fill","#718076");label.textContent=fmt(v);svg.append(label);}
 values.forEach((v,i)=>{const x=left+slot*i+(slot-barWidth)/2,y=top+ph*(1-v/max),bar=document.createElementNS(svg.namespaceURI,"rect");bar.setAttribute("x",x);bar.setAttribute("y",y);bar.setAttribute("width",barWidth);bar.setAttribute("height",Math.max(0,top+ph-y));bar.setAttribute("rx","3");bar.setAttribute("fill","#34764b");const title=document.createElementNS(svg.namespaceURI,"title");title.textContent=(rows.find(r=>r.report_date===dates[i]&&r.operator===operator)?.period||formatDate(dates[i]))+": "+fmt(v);bar.append(title);svg.append(bar);if(i===0||i===dates.length-1||i%Math.max(1,Math.floor(dates.length/6))===0){const t=document.createElementNS(svg.namespaceURI,"text");t.setAttribute("x",x+barWidth/2);t.setAttribute("y",h-20);t.setAttribute("text-anchor","middle");t.setAttribute("font-size","10");t.setAttribute("fill","#718076");t.textContent=dates[i].slice(5);svg.append(t);}});
 target.append(svg);tableTarget.replaceChildren();
}

function openOperatorGraphDetail(){const operator=$("ommu-operator-select")?.value||"Curaleaf",dialog=$("operator-graph-dialog"),chart=$("ommu-history-chart"),expanded=$("operator-graph-expanded"),company=$("operator-graph-company");if(!dialog||!chart)return;$("operator-graph-title").textContent=operator+" · performance detail";expanded.replaceChildren();const chartTitle=document.createElement("h3");chartTitle.textContent="Weekly OMMU trend";const chartNote=document.createElement("p");chartNote.className="insight-footnote";chartNote.textContent="Same measure and reporting window as the overview chart. Select a different measure on the dashboard to change the graph.";expanded.append(chartTitle,chartNote);const svg=chart.querySelector("svg");if(svg)expanded.append(svg.cloneNode(true));company.replaceChildren();renderOperatorDetail(operator,company);dialog.showModal();}
function renderMarketInsights(){const rows=state.market.rows;if(!rows.length)return;const latest=rows.map(r=>r.report_date).filter(Boolean).sort().at(-1);const current=rows.filter(r=>r.report_date===latest).sort((a,b)=>(Number(b.flower_oz)||0)-(Number(a.flower_oz)||0));const target=$("ommu-summary");if(target){target.replaceChildren();const intro=document.createElement("p");intro.className="insight-footnote";intro.textContent="Latest official OMMU reporting period: "+(latest||"not supplied")+". Dispensation volume is not customer sentiment.";target.append(intro);current.slice(0,6).forEach((r,i)=>{const line=document.createElement("div");line.className="market-rank-row";const name=document.createElement("strong");name.textContent=(i+1)+". "+text(r.operator);const value=document.createElement("span");value.textContent=(Number(r.flower_oz)||0).toLocaleString(undefined,{maximumFractionDigits:0})+" oz";line.append(name,value);target.append(line);});const cur=current.find(r=>/curaleaf/i.test(text(r.operator)));const note=document.createElement("p");note.className="insight-footnote";note.textContent=cur?"Curaleaf: "+Number(cur.flower_oz||0).toLocaleString(undefined,{maximumFractionDigits:0})+" oz flower · "+(current.findIndex(r=>r===cur)+1)+" of "+current.length+" operators.":"Curaleaf is not present in the latest report.";target.append(note);}const period=$("operator-ranking-period");if(period)period.textContent="Report "+formatDate(latest);renderOperatorRanking();}
function renderOperatorRanking(){const target=$("operator-ranking-results");if(!target||!state.market.rows.length)return;const rows=state.market.rows,latest=rows.map(r=>r.report_date).filter(Boolean).sort().at(-1),metric=$("operator-ranking-metric")?.value||"thc_mg",current=rows.filter(r=>r.report_date===latest).slice().sort((a,b)=>metric==="share"?Number(b.thc_mg||0)-Number(a.thc_mg||0):Number(b[metric]||0)-Number(a[metric]||0)),total=current.reduce((n,r)=>n+(Number(r.thc_mg)||0),0);target.replaceChildren();if(!current.length){target.textContent="No operator rows in the latest OMMU report.";return;}const table=document.createElement("table");table.className="operator-table";const head=document.createElement("thead");head.innerHTML='<tr><th>Rank / operator</th><th>Weekly amount</th><th>THC share</th></tr>';table.append(head);const body=document.createElement("tbody");current.forEach((r,i)=>{const tr=document.createElement("tr");tr.tabIndex=0;tr.setAttribute("role","button");const amount=metric==="flower_oz"?(Number(r.flower_oz)||0).toLocaleString(undefined,{maximumFractionDigits:2})+" oz":(Number(r.thc_mg)||0).toLocaleString()+" mg";const share=total?100*(Number(r.thc_mg)||0)/total:0;tr.innerHTML='<td><strong>#'+(i+1)+' '+escapeHTML(r.operator)+'</strong></td><td>'+amount+'</td><td>'+share.toFixed(2)+'%</td>';const open=()=>renderOperatorDetail(r.operator);tr.addEventListener("click",open);tr.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open();}});body.append(tr);});table.append(body);target.append(table);}
function renderOperatorDetail(operator,targetOverride){const target=targetOverride||$("operator-detail");if(!target)return;const rows=state.market.rows.filter(r=>r.operator===operator).sort((a,b)=>String(a.report_date).localeCompare(String(b.report_date))).slice(-12),latest=rows.at(-1),menu=operator.toLowerCase()==="curaleaf"?state.products.rows.filter(r=>r.first_seen):[],cutoff=latest?new Date(latest.report_date).getTime()-8*7*86400000:0,recent=menu.filter(r=>new Date(r.first_seen).getTime()>=cutoff).sort((a,b)=>String(b.first_seen).localeCompare(String(a.first_seen))).slice(0,12);target.hidden=false;target.replaceChildren();const heading=document.createElement("div");heading.className="operator-detail-head";const title=document.createElement("h4");title.textContent=operator+" · weekly performance";const close=document.createElement("button");close.type="button";close.className="text-button";close.textContent="Close";close.addEventListener("click",()=>{const dialog=target.closest("dialog");if(dialog)dialog.close();else target.hidden=true;});heading.append(title,close);target.append(heading);const note=document.createElement("p");note.className="insight-footnote";note.textContent="Showing "+rows.length+" available OMMU reports. THC and flower are separate medical-market dispensation measures.";target.append(note);const history=document.createElement("div");history.className="operator-history";rows.slice(-8).reverse().forEach(r=>{const line=document.createElement("div");line.className="operator-history-row";const label=document.createElement("span");label.textContent=text(r.period||formatDate(r.report_date));const value=document.createElement("strong");value.textContent=(Number(r.thc_mg)||0).toLocaleString()+" mg THC · "+(Number(r.flower_oz)||0).toLocaleString(undefined,{maximumFractionDigits:1})+" oz flower";line.append(label,value);history.append(line);});target.append(history);const trendTitle=document.createElement("h4");trendTitle.textContent="Recent product trends vs. dispensations";target.append(trendTitle);const trendNote=document.createElement("p");trendNote.className="insight-footnote";trendNote.textContent=operator.toLowerCase()==="curaleaf"?"For each OMMU report, compare THC dispensed with Curaleaf menu listings first observed in the preceding 7 days. This is timing context, not proof of a launch, stock, sales, or causation.":"No comparable competitor menu feed is currently available in the connected catalog. This operator's official OMMU history is shown above; competitor product trends are not inferred.";target.append(trendNote);if(operator.toLowerCase()==="curaleaf"){const timeline=document.createElement("div");timeline.className="operator-history";rows.slice(-8).reverse().forEach(report=>{const end=new Date(report.report_date+"T23:59:59").getTime(),begin=end-7*86400000,newCount=menu.filter(item=>{const t=new Date(item.first_seen||0).getTime();return Number.isFinite(t)&&t>begin&&t<=end;}).length,line=document.createElement("div");line.className="operator-history-row";const label=document.createElement("span");label.textContent=text(report.period||formatDate(report.report_date));const value=document.createElement("strong");value.textContent=(Number(report.thc_mg)||0).toLocaleString()+" mg THC · "+newCount+" new menu listings observed";line.append(label,value);timeline.append(line);});target.append(timeline);if(!recent.length){const empty=document.createElement("p");empty.className="muted";empty.textContent="No recent first-seen Curaleaf menu records in the current catalog.";target.append(empty);}else recent.forEach(r=>{const item=document.createElement("div");item.className="operator-product-row";const name=document.createElement("strong");name.textContent=text(r.product_name||r.strain_name||"Unnamed listing");const meta=document.createElement("span");meta.textContent=[r.product_type,r.product_format,r.strain_name,r.store_name,"First seen "+formatDate(r.first_seen)].filter(Boolean).join(" · ");item.append(name,meta);target.append(item);});}const disclaimer=document.createElement("p");disclaimer.className="insight-footnote";disclaimer.textContent="Interpretation: compare timing and direction only. Menu coverage is Curaleaf-only today, and no causal or sales relationship is claimed.";target.append(disclaimer);}
function renderReputationInsights(){const target=$("reputation-results");if(!target)return;const rows=state.community.rows.filter(r=>!(/news|web|curaleaf facebook post/i.test(text(r.source)))&&r.content_type!=="brand-owned post"),brands=new Map();rows.forEach(r=>{const t=r.entity_tags||{},names=[...(t.brands||[]),...(t.product_brands||[])];[...new Set(names)].forEach(name=>{if(!brands.has(name))brands.set(name,{name,total:0,positive:0,negative:0,mixed:0,neutral:0,unclassified:0,sources:new Set()});const b=brands.get(name);b.total++;const sentiment=text(r.sentiment).toLowerCase();b[sentiment in b?sentiment:"unclassified"]++;b.sources.add(text(r.source||"Unknown source"));});});const ranked=[...brands.values()].sort((a,b)=>(b.positive+b.negative+b.mixed)-(a.positive+a.negative+a.mixed));target.replaceChildren();$("reputation-count").textContent=ranked.length+" tagged brands · "+rows.length+" feedback records";const brandSelect=$("reputation-brand-select"),prior=brandSelect.value||"Curaleaf";brandSelect.replaceChildren(new Option("Curaleaf","Curaleaf"),new Option("All tagged brands","__all__"));ranked.forEach(b=>brandSelect.add(new Option(b.name,b.name)));brandSelect.value=ranked.some(b=>b.name===prior)||prior==="__all__"?prior:(ranked.some(b=>b.name==="Curaleaf")?"Curaleaf":"__all__");renderReputationTimeline();if(!ranked.length){target.innerHTML='<div class="empty-results">No brand-tagged customer-feedback records are available in the current sample.</div>';return;}ranked.slice(0,40).forEach(b=>{const classified=b.positive+b.negative+b.mixed,share=classified?100*b.positive/classified:null,card=document.createElement("article");card.className="surface reputation-card";const h=document.createElement("h3");h.textContent=b.name;const score=document.createElement("strong");score.className="reputation-score";score.textContent=share===null?"Insufficient sample":share.toFixed(1)+"% positive";const counts=document.createElement("p");counts.textContent="Positive "+b.positive+" · Negative "+b.negative+" · Mixed "+b.mixed+" · Neutral "+b.neutral;const sample=document.createElement("small");sample.textContent="Classified sample n="+classified+" · Tagged records "+b.total+" · Sources: "+[...b.sources].join(", ");const caveat=document.createElement("small");caveat.textContent=classified<10?"Directional only: fewer than 10 classified feedback records.":"Directional sample, not a representative survey.";card.append(h,score,counts,sample,caveat);target.append(card);});}

function renderReputationTimeline(){const target=$("reputation-timeline"),select=$("reputation-brand-select");if(!target||!select)return;const brand=select.value||"Curaleaf",rows=state.community.rows.filter(r=>{const t=r.entity_tags||{},names=[...(t.brands||[]),...(t.product_brands||[])],source=text(r.source).toLowerCase();return (brand==="__all__"||names.includes(brand))&&!/news|web|curaleaf facebook post/i.test(source)&&r.content_type!=="brand-owned post";});const months=new Map();rows.forEach(r=>{const date=new Date(r.published||r.created_at||r.collected||r.last_seen||0);if(!Number.isFinite(date.getTime()))return;const key=date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0");if(!months.has(key))months.set(key,{positive:0,negative:0,mixed:0,neutral:0,unclassified:0});const bucket=months.get(key),sent=text(r.sentiment).toLowerCase();bucket[sent in bucket?sent:"unclassified"]++;});target.replaceChildren();const series=[...months.entries()].sort((a,b)=>a[0].localeCompare(b[0])).slice(-8);if(!series.length){target.textContent="No dated feedback is available for this brand in the current sample.";return;}series.forEach(([month,c])=>{const classified=c.positive+c.negative+c.mixed,share=classified?100*c.positive/classified:null,line=document.createElement("div");line.className="reputation-month";const label=document.createElement("strong");label.textContent=month;const counts=document.createElement("span");counts.textContent="+"+c.positive+" / −"+c.negative+" / ±"+c.mixed+" · n="+classified;const score=document.createElement("b");score.textContent=share===null?"No classified sample":share.toFixed(0)+"% positive";line.append(label,counts,score);target.append(line);});}
function renderSourceStatus(rows){const target=$("source-list-live"),summary=$("source-status-summary");if(!target||!summary)return;target.replaceChildren();if(!rows.length){summary.textContent="Live source telemetry will appear after the direct scraper connection is enabled. Known source restrictions remain in effect.";return;}const sorted=rows.slice().sort((a,b)=>String(a.name).localeCompare(String(b.name)));const healthy=rows.filter(r=>String(r.status).toLowerCase()==="ok").length;summary.textContent=healthy+" of "+rows.length+" source checks currently report OK. A successful fetch with zero results is not the same as customer coverage.";sorted.forEach(r=>{const card=document.createElement("article");card.className="surface source-row";const dot=document.createElement("span");dot.className="source-dot "+(String(r.status).toLowerCase()==="ok"?"green":"amber");const body=document.createElement("div");const title=document.createElement("strong");title.textContent=text(r.name);const desc=document.createElement("p");desc.textContent=[text(r.kind),text(r.items)+" items",text(r.message),r.last_attempt?"Checked "+new Date(r.last_attempt).toLocaleString():""].filter(Boolean).join(" · ");body.append(title,desc);const tag=document.createElement("span");tag.className="tag";tag.textContent=text(r.status)||"UNKNOWN";card.append(dot,body,tag);target.append(card);});}
async function loadCommunity(){if(!sessionToken)return;const s=state.community;if(s.loaded){renderOverviewInsights();applyCommunityFilter();return;}$("community-results").innerHTML='<div class="loading-state">Loading customer voice and brand conversations…</div>';try{const tables=["mentions","mention_comments","google_reviews_cache","meta_page_comments","weedmaps_reviews","meta_page_posts"];const results=await Promise.allSettled(tables.map(t=>loadIndexTable(t)));const rows=[];results.forEach((result,i)=>{if(result.status!=="fulfilled")return;const table=tables[i];for(const r of result.value){let x={...r};if(table==="mention_comments"){x.source="Reddit comment";x.title="Reddit comment";x.body=x.body||"";x.url=x.permalink||"";x.published=x.published||x.checked_at;x.sentiment=x.sentiment||"unclassified";}else if(table==="google_reviews_cache"){x.source="Google Business Profile";x.title="Google review · "+(x.star_rating||"rating not supplied")+" stars";x.body=x.comment||"";x.published=x.created_at||x.updated_at;x.sentiment=x.sentiment||ratingSentiment(x.star_rating);x.sentiment_basis="Google star rating";x.url="";}else if(table==="meta_page_comments"){x.source="Facebook Page comment";x.title="Facebook comment";x.body=x.body||"";x.url=x.permalink||"";x.sentiment=x.sentiment||"unclassified";}else if(table==="weedmaps_reviews"){x.source="Weedmaps product review";x.title=x.title||x.product_name||"Weedmaps review";x.body=x.body||"";x.published=x.published||x.last_seen;x.sentiment=x.sentiment||ratingSentiment(x.rating);x.sentiment_basis="Weedmaps star rating";}else if(table==="meta_page_posts"){x.source="Curaleaf Facebook post";x.title=(x.message||"Curaleaf Facebook post").slice(0,140);x.body=x.message||"";x.url=x.permalink||"";x.published=x.published||x.first_seen;x.sentiment="unclassified";x.content_type="brand-owned post";}if(x.body||x.title)rows.push(x);}});s.rows=rows.sort((a,b)=>String(b.published||b.collected||b.last_seen||"").localeCompare(String(a.published||a.collected||a.last_seen||"")));s.loaded=true;const brandSelect=$("community-brand-filter");const brandValues=[...new Set(s.rows.flatMap(r=>{const t=r.entity_tags||{};return [...(t.brands||[]),...(t.product_brands||[]),...(t.products||[]),...(t.strains||[])];}))].sort((a,b)=>a.localeCompare(b));brandSelect.replaceChildren(new Option("All brands & products",""));brandValues.forEach(v=>brandSelect.add(new Option(v,v)));renderOverviewInsights();applyCommunityFilter();}catch(e){$("community-results").innerHTML='<div class="empty-results">'+escapeHTML(e.message)+'</div>';}}
function ratingSentiment(value){const n=Number(String(value??"").replace(/[^0-9.]/g,""));return !Number.isFinite(n)||!n?"unclassified":n>=4?"positive":n<=2?"negative":"neutral";}
async function loadProducts(){if(!sessionToken)return;const s=state.products,table=s.dataset;if(s.loaded&&s.table===table){applyProductFilter();return;}$("products-results").innerHTML='<div class="loading-state">Loading '+(table==="menu_stores"?"store":"product")+' catalog…</div>';try{s.rows=await loadIndexTable(table);s.table=table;s.loaded=true;const select=$("products-filter"),storeSelect=$("products-store-filter");select.innerHTML=table==="menu_stores"||table==="sweed_menu_stores"?'':'<option value="">All product types</option>';if(!["menu_stores","sweed_menu_stores"].includes(table)){[...new Set(s.rows.map(r=>r.product_type).filter(Boolean))].sort().forEach(v=>{const o=document.createElement("option");o.value=v;o.textContent=v;select.append(o);});select.hidden=false;}else select.hidden=true;storeSelect.replaceChildren(new Option("All stores / locations",""));[...new Set(s.rows.map(r=>text(r.store_name||r.location||r.store_slug)).filter(Boolean))].sort().forEach(v=>storeSelect.add(new Option(v,v)));storeSelect.hidden=["menu_stores","sweed_menu_stores"].includes(table);$("products-min-price").hidden=["menu_stores","sweed_menu_stores"].includes(table);$("products-max-price").hidden=["menu_stores","sweed_menu_stores"].includes(table);applyProductFilter();}catch(e){$("products-results").innerHTML='<div class="empty-results">'+escapeHTML(e.message)+'</div>';}}
function applyProductFilter(){const s=state.products,q=$("products-search").value.trim().toLowerCase(),type=$("products-filter").value,store=$("products-store-filter").value,min=Number($("products-min-price").value),max=Number($("products-max-price").value),hasMin=$("products-min-price").value!=="",hasMax=$("products-max-price").value!=="",view=s.view||"all";s.filtered=s.rows.filter(r=>{const price=Number(r.price),kind=(text(r.product_type)+" "+text(r.product_format)).toLowerCase();let viewOK=true;if(view==="rosin")viewOK=/live rosin|\brosin\b/.test(kind);else if(view==="resin")viewOK=/live resin/.test(kind);else if(view==="hash")viewOK=/bubble|ice.water|hash/.test(kind);else if(view==="flower")viewOK=/flower/.test(kind);return viewOK&&(!type||r.product_type===type)&&(!store||text(r.store_name||r.location||r.store_slug)===store)&&(!hasMin||(Number.isFinite(price)&&price>=min))&&(!hasMax||(Number.isFinite(price)&&price<=max))&&(!q||JSON.stringify(r).toLowerCase().includes(q));});s.page=0;renderList("products",s.dataset,"products-results","products-more","products-count");}
async function loadMarket(){if(!sessionToken)return;const s=state.market;if(s.loaded){applyMarketFilter();return;}$("market-results").innerHTML='<div class="loading-state">Loading private OMMU market index…</div>';try{s.rows=await loadIndexTable("ommu_market");s.loaded=true;applyMarketFilter();}catch(e){$("market-results").innerHTML='<div class="empty-results">'+escapeHTML(e.message)+'</div>';}}
function applyMarketFilter(){const s=state.market,q=$("market-search").value.trim().toLowerCase();s.filtered=s.rows.filter(r=>!q||JSON.stringify(r).toLowerCase().includes(q));s.page=0;renderList("market","ommu_market","market-results","market-more","market-count");}
function exportCSV(rows,filename){if(!rows?.length){alert("There are no matching records to export.");return;}const columns=[...new Set(rows.flatMap(row=>Object.keys(row).filter(k=>!k.startsWith("_")&&k!=="path")))];const cell=value=>{let v=value===null||value===undefined?"":typeof value==="object"?JSON.stringify(value):String(value);if(/^[=+\-@\t\r]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"';};const csv=[columns.map(cell).join(","),...rows.map(row=>columns.map(k=>cell(row[k])).join(","))].join("\r\n");const blob=new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);}
$("community-export").addEventListener("click",()=>exportCSV(state.community.filtered,"florida-customer-voice.csv"));
$("products-export").addEventListener("click",()=>exportCSV(state.products.filtered,"florida-product-catalog.csv"));
$("market-export").addEventListener("click",()=>exportCSV(state.market.filtered,"florida-ommu-market-data.csv"));
document.querySelectorAll("[data-community-view]").forEach(b=>b.addEventListener("click",()=>{state.community.view=b.dataset.communityView;document.querySelectorAll("[data-community-view]").forEach(x=>x.classList.toggle("active",x===b));applyCommunityFilter();}));
document.querySelectorAll("[data-product-view]").forEach(b=>b.addEventListener("click",()=>{state.products.view=b.dataset.productView;document.querySelectorAll("[data-product-view]").forEach(x=>x.classList.toggle("active",x===b));applyProductFilter();}));
$("reputation-brand-select")?.addEventListener("change",renderReputationTimeline);
$("operator-ranking-metric")?.addEventListener("change",renderOperatorRanking);$("ommu-operator-select")?.addEventListener("change",drawOMMUHistory);$("ommu-chart-metric")?.addEventListener("change",drawOMMUHistory);$("ommu-history-chart")?.addEventListener("click",openOperatorGraphDetail);$("ommu-history-chart")?.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openOperatorGraphDetail();}});$("operator-graph-close")?.addEventListener("click",()=>$("operator-graph-dialog").close());$("operator-graph-dialog")?.addEventListener("click",e=>{if(e.target.id==="operator-graph-dialog")e.currentTarget.close();});
$("community-search").addEventListener("input",applyCommunityFilter);$("community-brand-filter").addEventListener("change",applyCommunityFilter);$("community-filter").addEventListener("change",applyCommunityFilter);$("products-search").addEventListener("input",applyProductFilter);$("products-filter").addEventListener("change",applyProductFilter);$("products-store-filter").addEventListener("change",applyProductFilter);$("products-min-price").addEventListener("input",applyProductFilter);$("products-max-price").addEventListener("input",applyProductFilter);$("market-search").addEventListener("input",applyMarketFilter);
$("community-more").addEventListener("click",()=>{state.community.page++;renderList("community","mentions","community-results","community-more","community-count");});$("products-more").addEventListener("click",()=>{state.products.page++;renderList("products",state.products.dataset,"products-results","products-more","products-count");});$("market-more").addEventListener("click",()=>{state.market.page++;renderList("market","ommu_market","market-results","market-more","market-count");});
document.querySelectorAll("[data-dataset]").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll("[data-dataset]").forEach(x=>x.classList.toggle("active",x===b));state.products.dataset=b.dataset.dataset;state.products.loaded=false;state.products.rows=[];state.products.page=0;$("products-search").value="";$("products-filter").value="";$("products-store-filter").value="";$("products-min-price").value="";$("products-max-price").value="";loadProducts();}));
async function openRecord(row,table){if(!sessionToken)return;const modal=$("record-dialog"),detail=$("record-detail");$("record-title").textContent=recordTitle(row,table);$("record-kicker").textContent=table.replaceAll("_"," ").toUpperCase()+(dataMode==="live"?" · LIVE DATA":" · PRIVATE ARCHIVE SNAPSHOT");detail.innerHTML='<div class="loading-state">Fetching full private record…</div>';modal.showModal();try{const record=dataMode==="live"?row:JSON.parse(decodeContent(await githubGet(row.path)));detail.replaceChildren();Object.entries(record).forEach(([key,value])=>{if(value===null||value==="")return;const wrap=document.createElement("div");wrap.className="detail-field";const label=document.createElement("strong");label.textContent=key.replaceAll("_"," ");const p=document.createElement("p");if(typeof value==="string"&&/^https?:\/\//i.test(value)){const a=document.createElement("a");a.href=value;a.target="_blank";a.rel="noopener noreferrer";a.textContent=value;p.append(a);}else p.textContent=typeof value==="object"?JSON.stringify(value,null,2):String(value);wrap.append(label,p);detail.append(wrap);});const author=text(record.author||record.username||record.author_name||record.public_author),authorKey=text(record.author_id||record.author||record.username||record.author_name||record.public_author),source=text(record.source||row.source);if(authorKey&&source){const related=state.community.rows.filter(item=>item!==row&&text(item.source)===source&&text(item.author_id||item.author||item.username||item.author_name||item.public_author)===authorKey).slice(0,8);if(related.length){const section=document.createElement("section");section.className="related-feedback";const heading=document.createElement("h3");heading.textContent="Other public feedback from this source author";const note=document.createElement("p");note.textContent="Matched only on the exact public author identifier supplied by the same source. No cross-platform identity matching is performed.";section.append(heading,note);related.forEach(item=>{const button=document.createElement("button");button.type="button";button.className="related-feedback-item";const title=document.createElement("strong");title.textContent=recordTitle(item,"mentions");const meta=document.createElement("small");meta.textContent=[formatDate(item.published||item.collected),item.sentiment].filter(Boolean).join(" · ");button.append(title,meta);button.addEventListener("click",()=>openRecord(item,"mentions"));section.append(button);});detail.append(section);}}}catch(e){detail.innerHTML='<div class="empty-results">Could not load this record: '+escapeHTML(e.message)+'</div>';}}
$("record-close").addEventListener("click",()=>$("record-dialog").close());$("record-dialog").addEventListener("click",e=>{if(e.target.id==="record-dialog")e.currentTarget.close();});
window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();installPrompt=event;$("install-button").hidden=false;});$("install-button").addEventListener("click",async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$("install-button").hidden=true;});
if("serviceWorker"in navigator&&location.protocol.startsWith("http"))window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
