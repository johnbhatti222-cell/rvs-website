
(function(){
const LOGO="logo.png";
const BOOT=JSON.parse(document.getElementById("site-data").textContent);
const SHEETS_URL=(window.RVS_CONFIG||{}).SHEETS_URL||"";
// Last settings loaded from the Google Sheet, so repeat visitors see current prices straight away.
let PUBLISHED=(()=>{try{const c=JSON.parse(localStorage.getItem("rv-site")||"null");if(c&&c.plans)return c;}catch(e){}return BOOT.site;})();
const AI_ON=false;
const app=document.getElementById("app");
const clone=o=>JSON.parse(JSON.stringify(o));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const inr=n=>"₹"+Math.round(n).toLocaleString("en-IN");
const ss={get(k){try{return sessionStorage.getItem(k)}catch(e){return null}},set(k,v){try{sessionStorage.setItem(k,v)}catch(e){}},del(k){try{sessionStorage.removeItem(k)}catch(e){}}};

function norm(o){o.contact=o.contact||{};if(o.contact.waOn===undefined)o.contact.waOn=true;if(o.contact.waGreeting===undefined)o.contact.waGreeting="Hello! How can we help you today?";o.bot=o.bot||{};if(!o.bot.issues)o.bot.issues=["Net not working","Slow browsing","Frequent disconnections","Router / Wi-Fi problem","Other"];if(!o.bot.tvNeeds)o.bot.tvNeeds=["New cable TV connection","HD set-top box","SD set-top box","Change channel pack","Add another TV"];return o;}
norm(PUBLISHED);
const waNum=s=>{let n=String(s.contact.whatsapp||s.contact.phone||"").replace(/\D/g,"");if(n.length===10)n="91"+n;return n;};
const waLink=(s,text)=>"https://wa.me/"+waNum(s)+(text?"?text="+encodeURIComponent(text):"");
const WA_ICON='<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.2A9.7 9.7 0 0 0 3.6 16.8L2.3 21.7l5-1.3A9.7 9.7 0 1 0 12 2.2Zm0 17.7a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 19.9Zm4.4-6c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.8 1c-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2.1 4.9 4.9 0 0 0 1 2.6 11.2 11.2 0 0 0 4.3 3.8c1.6.7 2.2.7 3 .6a2.5 2.5 0 0 0 1.7-1.2 2 2 0 0 0 .1-1.2c0-.1-.2-.2-.4-.3Z"/></svg>';
let waOpen=false;
let draft=clone(PUBLISHED);
try{const d=JSON.parse(ss.get("rv-draft")||"null");if(d&&d.plans&&!same(norm(d),PUBLISHED))draft=d;else ss.del("rv-draft");}catch(e){}
let token=ss.get("rv-token")||"";
let authed=!!token;
// The Google Sheet's Apps Script is the website's backend. Calls go as plain text so browsers send them directly.
async function gas(action,payload={},signal){
  if(!SHEETS_URL)return {error:"not_configured",message:"The website isn't connected to the Google Sheet yet (config.js)."};
  const r=await fetch(SHEETS_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action,...payload}),redirect:"follow",signal});
  return r.json();
}
const ERR_STATUS={unauthorized:401,rate_limited:429,locked:429,not_found:404};
// Admin panel calls, answered by the sheet script in the shape the panel expects.
async function api(path,opt={}){
  const method=opt.method||"GET",body=opt.body?JSON.parse(opt.body):{};
  let d;
  if(path==="/api/site"&&method==="PUT")d=await gas("saveSettings",{token,data:body});
  else if(path.startsWith("/api/requests?")){const u=new URLSearchParams(path.split("?")[1]);d=await gas("listRequests",{token,status:u.get("status"),q:u.get("q")});}
  else if(path.startsWith("/api/requests/")&&method==="PATCH")d=await gas("updateRequest",{token,id:+path.split("/").pop(),...body});
  else d={ok:true};
  const status=d.error?(ERR_STATUS[d.error]||400):200;
  return {ok:!d.error,status,json:async()=>d.error?{error:d.message}:d};
}
const clientId=()=>{try{let c=localStorage.getItem("rv-client");if(!c){c=Math.random().toString(36).slice(2,10)+Date.now().toString(36);localStorage.setItem("rv-client",c);}return c;}catch(e){return "";}};
let sheetEmpty=false;
function signOut(msg){authed=false;token="";ss.del("rv-token");pubMsg=msg||null;}
let previewing=false, cycle=1, discardArmed=false, pubMsg=null, publishing=false, view="", anim=0;
let adminTab=ss.get("rv-tab")==="requests"?"requests":"site", reqs=null, reqFilter="new", reqQuery="", reqError="", newCount=0;

function saveDraft(){same(draft,PUBLISHED)?ss.del("rv-draft"):ss.set("rv-draft",JSON.stringify(draft));updateStatus();}
const dirty=()=>sheetEmpty||!same(draft,PUBLISHED);
const fmtSpeed=m=>m>=1000?[+(m/1000).toFixed(1)+"","Gbps"]:[m+"","Mbps"];
const routeIsAdmin=()=>location.hash==="#admin";

/* ---------- Public site ---------- */
function siteHTML(s){
  const plans=s.plans.filter(p=>p.visible&&p.name&&p.price>0);
  const star=plans.find(p=>p.popular)||plans[0];
  const live=s.areas.filter(a=>a.status==="live").length;
  const disc={1:0,6:+s.billing.d6||0,12:+s.billing.d12||0};
  const cycBtn=(c,l)=>`<button type="button" data-act="cycle" data-c="${c}" aria-pressed="${cycle===c}">${l}${disc[c]>0?` <span class="save">−${disc[c]}%</span>`:""}</button>`;
  const c=s.contact;
  const meter=`
    <div class="meter fibre">
      <div class="meter-top"><span class="live"><i></i>FTTH · Fibre to the home</span><span class="mono">Light, not copper</span></div>
      <div class="r-scene" aria-hidden="true">
        <div class="r-waves"><i></i><i></i><i></i></div>
        <div class="r-shadow"></div>
        <div class="r-float"><div class="r3d">
          <div class="rf r-top"><span class="r-brand">RV<em>FIBRE</em></span>
            <span class="r-leds"><span><i class="g"></i>PWR</span><span><i class="g"></i>PON</span><span><i class="g blink"></i>LAN</span><span><i class="g blink2"></i>Wi-Fi</span></span></div>
          <div class="rf r-bottom"></div>
          <div class="rf r-front"><b></b></div>
          <div class="rf r-back"></div>
          <div class="rf r-left"></div>
          <div class="rf r-right"></div>
          <div class="r-ant" style="--x:42px"><i></i><i></i></div>
          <div class="r-ant" style="--x:115px"><i></i><i></i></div>
          <div class="r-ant" style="--x:188px"><i></i><i></i></div>
        </div></div>
      </div>
      <p class="r-caption">Fibre ONT + Wi-Fi router, installed and set up at your home</p>
      <div class="stats">
        <div><small>Technology</small><b>FTTH</b></div>
        <div><small>Data</small><b>Unlimited</b></div>
        <div><small>Support</small><b>Local team</b></div>
      </div>
      <p class="meter-note">Fibre carries your internet as pulses of light through thin glass strands. It isn't affected by electrical interference, so speeds stay steady.</p>
    </div>`;
  return `
<header class="top"><div class="wrap nav">
  <a class="brand" href="#top"><img src="${LOGO}" alt="" width="48" height="44"><span>${esc(s.brand.name)}</span></a>
  <nav class="links" aria-label="Main"><a href="#plans">Plans</a><a href="#coverage">Coverage</a><a href="#why">Why us</a><a href="#faq">FAQ</a><a href="#contact">Contact</a></nav>
  <a class="btn btn-primary" href="#contact">Get connected</a>
  <button class="menu-btn" type="button" data-act="menu" aria-expanded="false" aria-controls="mnav" aria-label="Open menu"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
</div>
<nav class="mnav" id="mnav" aria-label="Main" hidden><div class="wrap">
  <a href="#plans">Plans</a><a href="#coverage">Coverage</a><a href="#why">Why us</a><a href="#faq">FAQ</a><a href="#contact">Contact</a>
  <a class="btn btn-primary" href="#contact">Get connected</a>
</div></nav></header>
<main id="top">
<section class="hero">
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <span class="eyebrow">${esc(s.brand.tagline)}</span>
      <h1>${esc(s.brand.headline)}</h1>
      <p>${esc(s.brand.intro)}</p>
      <div class="hero-cta"><a class="btn btn-primary" href="#plans">See plans</a><a class="btn btn-ghost" href="#coverage">Check my area</a></div>
      <div class="hero-facts">
        ${plans.length?`<span><b>${inr(Math.min(...plans.map(p=>p.price)))}</b>plans from, per month</span>`:""}
        ${plans.length?`<span><b>${fmtSpeed(Math.max(...plans.map(p=>p.mbps))).join(" ")}</b>top speed</span>`:""}
        <span><b>${live}</b>areas live in Mumbai</span>
      </div>
    </div>
    ${meter}
  </div>
</section>

<section id="plans"><div class="wrap">
  <div class="sec-head"><span class="eyebrow">Plans</span><h2>Pick a speed. Data is always unlimited.</h2>
  <p>Rates below are per month. Pay for 6 or 12 months together and save.</p></div>
  ${plans.length?`<div class="toggle" role="group" aria-label="Billing period">${cycBtn(1,"Monthly")}${cycBtn(6,"6 months")}${cycBtn(12,"12 months")}</div>
  <div class="plans">${plans.map(p=>{
    const m=p.price*(1-disc[cycle]/100), sp=fmtSpeed(p.mbps);
    const sub=cycle===1?"Billed monthly":`${inr(m*cycle)} billed every ${cycle} months`;
    return `<article class="plan${p.popular?" pop":""}">${p.popular?'<span class="tag">Most popular</span>':""}
      <div><div class="plan-name">${esc(p.name)}</div><div class="speed"><b>${sp[0]}</b><span>${sp[1]}</span></div></div>
      <div class="price"><b>${inr(m)}</b><span>/month</span></div>
      <div class="price-sub">${sub}</div>
      <ul>${p.features.map(f=>`<li>${esc(f)}</li>`).join("")}</ul>
      <a class="btn" href="#contact" data-act="choose" data-plan="${esc(p.name)}">Choose ${esc(p.name)}</a></article>`;}).join("")}</div>`
  :`<p class="empty">New plans are being updated. Call us for current rates.</p>`}
  <p class="fine">${esc(s.billing.note)}</p>
</div></section>

<section id="coverage" class="alt"><div class="wrap cov-grid">
  <div>
    <div class="sec-head" style="margin-bottom:24px"><span class="eyebrow">Coverage</span><h2>Do we serve your building?</h2>
    <p>Enter your 6-digit PIN code to see if your area is live or coming soon.</p></div>
    <form class="check" id="cov-form" novalidate>
      <div class="field"><label for="pin">PIN code</label><input id="pin" inputmode="numeric" maxlength="6" placeholder="e.g. ${esc((s.areas[0]||{}).pin||"400058")}" autocomplete="postal-code"></div>
      <button class="btn btn-primary" type="submit">Check</button>
    </form>
    <div class="result" id="cov-result" aria-live="polite"><span class="dot"></span><span>Your result appears here.</span></div>
    <p class="hint">Area not listed? Request a callback below and we will check your building.</p>
  </div>
  <div><h3 style="margin-bottom:14px">Service areas</h3>
    <div class="areas">${s.areas.filter(a=>a.name).map(a=>`<div><span>${esc(a.name)} <span class="mono" style="color:var(--muted);font-size:13px">${esc(a.pin)}</span></span><span class="pill ${a.status==="live"?"live-p":"soon-p"}">${a.status==="live"?"Live":"Coming soon"}</span></div>`).join("")}</div>
  </div>
</div></section>

<section id="why"><div class="wrap">
  <div class="sec-head"><span class="eyebrow">Why us</span><h2>A neighbourhood provider you can actually call.</h2></div>
  <div class="why">
    <div><span class="k">Local team</span><h3>Engineers nearby</h3><p>Our field staff work in your area, so service visits happen the same day in most cases.</p></div>
    <div><span class="k">No caps</span><h3>Unlimited data</h3><p>Stream, work and game as much as you like. Every plan comes with unlimited data.</p></div>
    <div><span class="k">Fibre</span><h3>Fibre to the home</h3><p>A fibre line to your building gives steady speeds through the evening rush.</p></div>
    <div><span class="k">Cable TV</span><h3>Internet and TV together</h3><p>Get broadband and cable TV from one provider, with one point of contact.</p></div>
    <div><span class="k">Easy pay</span><h3>Pay your way</h3><p>Pay by UPI, online transfer or cash. Save more with 6 or 12-month billing.</p></div>
    <div><span class="k">Support</span><h3>Phone and WhatsApp help</h3><p>${esc(c.hours)}. Reach us on ${esc(c.phone)}.</p></div>
  </div>
</div></section>

<section class="steps-band"><div class="wrap">
  <div class="sec-head"><span class="eyebrow">Getting connected</span><h2>From enquiry to online in a few days.</h2></div>
  <div class="steps">
    <div><h3>Check your area</h3><p>Enter your PIN code or call us. We confirm we can reach your building.</p></div>
    <div><h3>Choose a plan</h3><p>Pick your speed and billing period.</p></div>
    <div><h3>KYC &amp; installation</h3><p>Share ID and address proof. Our engineer lays the line and sets up the router.</p></div>
    <div><h3>Go online</h3><p>We test the speed with you and set your Wi-Fi name and password.</p></div>
  </div>
</div></section>

<section id="faq"><div class="wrap">
  <div class="sec-head"><span class="eyebrow">FAQ</span><h2>Common questions</h2></div>
  <div class="faq">
    <details open><summary>Is the data really unlimited?</summary><p>Yes. All our broadband plans include unlimited data.</p></details>
    <details><summary>What documents do I need?</summary><p>One photo ID (Aadhaar, PAN, passport or driving licence) and one address proof. Our engineer completes KYC at installation.</p></details>
    <details><summary>Can I change my plan later?</summary><p>Yes. Call or WhatsApp us to upgrade. Downgrades apply from your next billing cycle.</p></details>
    <details><summary>How do I report a problem?</summary><p>Call or WhatsApp ${esc(c.phone)}. ${esc(c.hours)}.</p></details>
    <details><summary>Do you offer connections for shops and offices?</summary><p>Yes. Contact us for business plans and static IP options.</p></details>
  </div>
</div></section>

<section id="contact" class="alt"><div class="wrap contact-grid">
  <div class="cinfo">
    <div class="sec-head" style="margin-bottom:4px"><span class="eyebrow">Contact</span><h2>Talk to us.</h2><p>New connection, billing or a fault: call, WhatsApp or email.</p></div>
    <div class="row"><small>Phone</small><span><b id="c-ph">${esc(c.phone)}</b><button class="copy" type="button" data-act="copy" data-t="c-ph">Copy</button></span></div>
    <div class="row"><small>WhatsApp</small><span><b id="c-wa">${esc(c.whatsapp)}</b><button class="copy" type="button" data-act="copy" data-t="c-wa">Copy</button>${c.waOn!==false?`<a class="wa-row-link" href="${waLink(s,"")}" target="_blank" rel="noopener">Chat now</a>`:""}</span></div>
    <div class="row"><small>Email</small><span><b id="c-em">${esc(c.email)}</b><button class="copy" type="button" data-act="copy" data-t="c-em">Copy</button></span></div>
    <div class="row"><small>Office</small><b>${esc(c.address)}</b></div>
    <div class="row"><small>Hours</small><b>${esc(c.hours)}</b></div>
  </div>
  <form class="lead" id="lead-form" novalidate>
    <h3>Request a callback</h3>
    <div class="two">
      <div class="field"><label for="l-name">Full name</label><input id="l-name" autocomplete="name" placeholder="Your name"></div>
      <div class="field"><label for="l-phone">Mobile number</label><input id="l-phone" inputmode="tel" autocomplete="tel" placeholder="10-digit number"></div>
    </div>
    <div class="two">
      <div class="field"><label for="l-pin">PIN code</label><input id="l-pin" inputmode="numeric" maxlength="6" placeholder="400058"></div>
      <div class="field"><label for="l-plan">Interested in</label><select id="l-plan">${plans.map(p=>`<option${p.popular?" selected":""}>${esc(p.name)}</option>`).join("")}<option>Cable TV</option><option>Business connection</option></select></div>
    </div>
    <div class="field"><label for="l-msg">Building or society name (optional)</label><input id="l-msg" placeholder="e.g. Sai Krupa CHS, Wing B"></div>
    <p class="err" id="l-err" aria-live="polite"></p>
    <button class="btn btn-primary" type="submit">Continue</button>
  </form>
</div></section>
</main>
<footer><div class="wrap foot">
  <div style="display:grid;gap:6px"><b>${esc(s.brand.name)}</b><span>${esc(c.address)}</span><span>© ${new Date().getFullYear()} ${esc(s.brand.name)}</span></div>
  <nav aria-label="Footer"><a href="#plans">Plans</a><a href="#coverage">Coverage</a><a href="#faq">FAQ</a><a href="#contact">Contact</a><a href="#admin">Admin login</a></nav>
</div></footer>`;
}

function siteAfter(){
  const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
  const c=document.getElementById("lines");if(!c)return;
  const x=c.getContext("2d"),my=++anim;let w,h,lines=[];
  function size(){const r=c.getBoundingClientRect(),d=devicePixelRatio||1;w=r.width;h=r.height;c.width=w*d;c.height=h*d;x.setTransform(d,0,0,d,0,0);
    lines=Array.from({length:8},(_,i)=>({y:h*(.15+i*.1),a:10+Math.random()*28,f:.002+Math.random()*.003,p:Math.random()*6,s:.3+Math.random()*.6,o:Math.random()}));}
  function draw(t){
    if(my!==anim||!c.isConnected)return;
    x.clearRect(0,0,w,h);
    lines.forEach((l,i)=>{
      x.beginPath();for(let px=0;px<=w;px+=12){const py=l.y+Math.sin(px*l.f+l.p)*l.a;px?x.lineTo(px,py):x.moveTo(px,py);}
      x.strokeStyle=i%3===0?"rgba(255,74,79,.22)":"rgba(255,255,255,.08)";x.lineWidth=1.2;x.stroke();
      const pos=((t*.00006*l.s+l.o)%1)*w,py=l.y+Math.sin(pos*l.f+l.p)*l.a,g=x.createRadialGradient(pos,py,0,pos,py,20);
      g.addColorStop(0,i%3===0?"rgba(255,90,95,.9)":"rgba(255,255,255,.55)");g.addColorStop(1,"rgba(0,0,0,0)");
      x.fillStyle=g;x.beginPath();x.arc(pos,py,20,0,7);x.fill();
    });
    if(!reduce)requestAnimationFrame(draw);
  }
  size();requestAnimationFrame(draw);
  window.onresize=()=>{if(my===anim&&c.isConnected)size();};
}

/* ---------- WhatsApp chatbot ---------- */
const waRoot=document.createElement("div");waRoot.className="wa";document.body.appendChild(waRoot);
let chat=[],waStep=null,waTimer=0;
const src=()=>view==="preview"?draft:PUBLISHED;
const clock=()=>new Date().toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"});
const reduceMo=()=>matchMedia("(prefers-reduced-motion: reduce)").matches;
const TOPICS=[["conn","New connection"],["plans","Plan prices"],["issue","Report a problem"],["tv","Cable TV"],["bill","Bill payment"]];
let aiFn=AI_ON,aiCtl=null,aiTurns=[];
function forms(s){
  const plans=s.plans.filter(p=>p.visible&&p.name&&p.price>0).map(p=>p.name);
  return {
    conn:{title:"New Connection Request",intro:"Great! Share a few details and our team will check your building and confirm installation.",fields:[
      {k:"name",l:"Full name",req:1},{k:"mobile",l:"Mobile number",t:"tel",req:1},
      {k:"pin",l:"PIN code",t:"pin",req:1,half:1},{k:"plan",l:"Plan",t:"select",o:[...plans,"Not sure yet"],half:1},
      {k:"address",l:"Address (flat, building, street)",req:1},
      {k:"time",l:"Best time to visit",t:"select",o:["Morning (9 am – 12 pm)","Afternoon (12 – 4 pm)","Evening (4 – 8 pm)"]}]},
    tv:{title:"Cable TV Enquiry",intro:"Happy to help with cable TV. Tell us what you need.",fields:[
      {k:"name",l:"Full name",req:1},{k:"mobile",l:"Mobile number",t:"tel",req:1},
      {k:"need",l:"Requirement",t:"select",o:s.bot.tvNeeds,req:1},
      {k:"tvs",l:"Number of TVs",t:"select",o:["1","2","3","4 or more"],half:1},{k:"lang",l:"Preferred language",t:"select",o:["Hindi","Marathi","English","Gujarati","South Indian","Mixed"],half:1},
      {k:"pin",l:"PIN code",t:"pin",req:1,half:1},{k:"address",l:"Address",half:1},
      {k:"remarks",l:"Remarks",t:"area",ph:"Any channels or packs you want"}]},
    issue:{title:"Complaint",intro:"Sorry about the trouble. Tell us what's wrong and we'll get it fixed.",fields:[
      {k:"uid",l:"User ID or registered mobile",req:1},{k:"issue",l:"Issue",t:"select",o:s.bot.issues,req:1},
      {k:"remarks",l:"Remarks",t:"area",ph:"Since when? Any red or blinking lights on the router?"},
      {k:"alt",l:"Contact number (if different)",t:"tel"}]},
    bill:{title:"Bill Payment Request",intro:"Please enter your User ID or registered mobile number. We'll reply on WhatsApp with your due amount and payment options.",fields:[
      {k:"uid",l:"User ID or registered mobile",req:1},
      {k:"mode",l:"How would you like to pay?",t:"select",o:["UPI / payment link","Cash collection at home","Bank transfer"]}]}
  };
}
const stripActs=t=>t.replace(/\[\[\s*ACTIONS?\s*:[^\]]*\]\]\s*$/i,"").replace(/\[\[[^\]]*$/,"").trim();
const fmtAI=t=>esc(stripActs(t)).replace(/\*\*(.+?)\*\*/g,"<b>$1</b>").replace(/\n/g,"<br>");
async function askAI(q){
  q=q.trim();if(!q||aiCtl)return;
  if(!aiFn)return freeAsk(q);
  clearTimeout(waTimer);
  chat.push({from:"user",html:esc(q)});aiTurns.push({role:"user",content:q});
  const msg={from:"bot",ai:true,live:true,html:'<span class="thinking">Thinking…</span>',time:""};chat.push(msg);waStep=null;
  aiCtl=new AbortController();mountWa();
  const paint=t=>{const el=document.querySelector("#wa-body [data-live]");if(el)el.innerHTML=fmtAI(t);};
  let text="";
  try{
    const res=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:aiTurns.slice(-12)}),signal:aiCtl.signal});
    if(!res.ok){const err=await res.json().catch(()=>({}));throw {status:res.status,message:err.error};}
    const reader=res.body.getReader(),dec=new TextDecoder();
    for(;;){const {done,value}=await reader.read();if(done)break;text+=dec.decode(value,{stream:true});paint(text.replace(/\u0000ERR[\s\S]*$/,""));}
    const errAt=text.indexOf("\u0000ERR");
    if(errAt>=0){const partial=text.slice(0,errAt);throw {status:502,partial};}
    if(!text.trim())throw {status:502};
    aiTurns.push({role:"assistant",content:text});
    const m=text.match(/\[\[\s*ACTIONS?\s*:([^\]]*)\]\]/i);
    const acts=m?[...new Set(m[1].split(/[\s,]+/).map(x=>x.toLowerCase()).filter(x=>["conn","plans","issue","tv","bill"].includes(x)))].slice(0,2):[];
    msg.html=fmtAI(text);waStep={type:"ai",actions:acts};
  }catch(e){
    aiTurns.pop();
    if(e&&e.name==="AbortError"){msg.html=text?fmtAI(text)+" <i>(stopped)</i>":"<i>Stopped.</i>";waStep={type:"ai",actions:[]};}
    else if(e&&e.status===429){msg.html=esc(e.message||"Too many questions in a short time. Wait a few minutes, then ask again.");waStep={type:"ai",actions:[]};}
    else if(e&&e.status===503){aiFn=false;msg.html="The AI assistant is switched off right now. Choose an option below and our team will help on WhatsApp.";waStep={type:"menu"};}
    else if(e&&e.status===400){msg.html=esc(e.message||"Please shorten your question and try again.");waStep={type:"ai",actions:[]};}
    else{msg.html=(e&&e.partial?fmtAI(e.partial)+"<br>":"")+"I couldn't finish that answer. Please ask again, or choose an option below.";waStep={type:"ai",actions:[]};}
  }
  msg.live=false;msg.time=clock();aiCtl=null;mountWa();speak(msg.html,optionsText(waStep));
}

/* ---------- Voice: speak to the chatbot and hear replies (browser speech, no cost) ---------- */
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
const MIC_SVG='<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1a7 7 0 0 0 6-6.9h-2Z"/></svg>';
let rec=null,listening=false,voiceMode=false,voiceNote="";
function voiceStatus(t){voiceNote=t;const el=document.getElementById("wa-voice");if(el){el.textContent=t;el.hidden=!t;}}
function setMicUI(){const b=document.getElementById("wa-mic");if(b){b.classList.toggle("on",listening);b.setAttribute("aria-pressed",String(listening));b.setAttribute("aria-label",listening?"Stop listening":"Speak your question");}}
function optionsText(st){
  if(!st)return "";
  if(st.type==="form")return " Please fill in the form on screen.";
  const labels=st.type==="menu"?[...TOPICS.map(t=>t[1]),"Help and troubleshooting"]:st.type==="tree"?st.opts.map(o=>o[0]):st.type==="help"?HELP_OPTS.map(o=>o[0]):st.type==="quiz"?QUIZ_OPTS[st.q]:st.type==="after"?["Main menu"]:[];
  if(!labels.length)return "";
  return " You can say: "+(labels.length>1?labels.slice(0,-1).join(", ")+", or ":"")+labels[labels.length-1]+".";
}
function speak(html,extra){
  if(!voiceMode||!window.speechSynthesis)return;
  const d=document.createElement("div");
  d.innerHTML=String(html).replace(/<br\s*\/?>/gi,". ").replace(/<\/(li|p|div|span)>/gi,". ");
  d.querySelectorAll("time,.wa-ai-tag,button,a").forEach(x=>x.remove());
  const text=(d.textContent+(extra||"")).replace(/\s+/g," ").replace(/:\s*\./g,":").replace(/(\s*\.\s*){2,}/g,". ").replace(/^\.\s*/,"").trim();
  if(!text)return;
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text.slice(0,700)),voices=speechSynthesis.getVoices();
  const v=voices.find(x=>/en[-_]IN/i.test(x.lang))||voices.find(x=>/^hi/i.test(x.lang));
  u.lang=v?v.lang:"en-IN";if(v)u.voice=v;
  speechSynthesis.speak(u);
}
function stopVoice(){if(rec&&listening)rec.abort();if(window.speechSynthesis)speechSynthesis.cancel();}
function toggleMic(){
  if(!SR)return;
  if(listening){rec.stop();return;}
  if(window.speechSynthesis)speechSynthesis.cancel();
  rec=new SR();rec.lang="en-IN";rec.interimResults=true;rec.maxAlternatives=1;
  let heard="";
  rec.onstart=()=>{listening=true;setMicUI();voiceStatus("Listening… speak now. Tap the mic again when you're done.");};
  rec.onresult=e=>{let t="";for(const r of e.results)t+=r[0].transcript;heard=t;const q=document.getElementById("wa-q");if(q)q.value=t;};
  rec.onerror=e=>{voiceStatus(e.error==="not-allowed"||e.error==="service-not-allowed"?"Microphone access is blocked. Allow the microphone for this site in your browser settings, or type your question."
    :e.error==="no-speech"?"I didn't hear anything. Tap the mic and try again."
    :e.error==="network"?"Voice needs an internet connection. Please type your question.":"");};
  rec.onend=()=>{
    listening=false;setMicUI();
    if(voiceNote.startsWith("Listening"))voiceStatus("");
    const q=document.getElementById("wa-q"),t=heard.trim();
    if(t){if(q)q.value="";voiceMode=true;askAI(t);}
  };
  try{rec.start();}catch(e){voiceStatus("Couldn't start the microphone. Please type your question.");}
}
function quizPick(q,v,bubble){
  waStep=null;if(bubble)chat.push({from:"user",html:esc(QUIZ_OPTS[q][v])});
  if(q===1){quiz.p=v;botSay("What do you mostly use the internet for?",{type:"quiz",q:2});}else{quiz.u=v;recommendPlan();}
}
// Lets a spoken or typed reply pick one of the buttons currently on screen.
function matchOption(prev,q){
  if(!prev)return false;
  const t=" "+q.toLowerCase().replace(/-/g,"").replace(/[^a-z0-9ऀ-ॿ]+/g," ").trim()+" ";
  if(prev.type==="quiz"){
    let v=-1;
    if(prev.q===1){
      const nums={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,ek:1,do:2,teen:3,char:4,chaar:4,paanch:5,panch:5};
      let n=+((t.match(/\d+/)||[])[0]||0);
      if(!n)for(const w of t.trim().split(" "))if(nums[w]){n=nums[w];break;}
      if(n)v=n<=2?0:n<=4?1:2;
    }else{
      if(/4k|gaming|game|work|office|wfh/.test(t))v=2;
      else if(/stream|video|hd|netflix|youtube|movie|hotstar/.test(t))v=1;
      else if(/brows|social|whatsapp|facebook|instagram|basic|light|call/.test(t))v=0;
    }
    if(v<0)return false;
    quizPick(prev.q,v,false);return true;
  }
  const opts=prev.type==="tree"?prev.opts.map(o=>({l:o[0],go:o[1]})):prev.type==="help"?HELP_OPTS.map(o=>({l:o[0],go:o[1]}))
    :prev.type==="menu"?[...TOPICS,["ask","Help troubleshooting"]].map(o=>({l:o[1],topic:o[0]})):null;
  if(!opts)return false;
  const words=t.trim().split(" "),yes=/ (yes|yeah|yup|haan|han|ha|ji|ho gaya|hogaya) /.test(t),no=/ (no|nope|nahi|nahin|na|not) /.test(t);
  let hit=opts.find(o=>t.includes(" "+o.l.toLowerCase().replace(/-/g,"").replace(/[^a-z0-9]+/g," ").trim()+" "))||null;
  // On menus, anything short of a full button name goes to the keyword matcher instead.
  if(!hit&&prev.type!=="tree")return false;
  if(!hit&&opts.length===2&&words.length<=4&&yes!==no)hit=yes?opts[0]:opts[1];
  if(!hit){
    let best=0;
    for(const o of opts){const lw=o.l.toLowerCase().replace(/-/g,"").replace(/[^a-z0-9]+/g," ").trim().split(" ").filter(w=>w.length>2);
      const sc=lw.filter(w=>t.includes(" "+w+" ")).length;if(sc>best){best=sc;hit=o;}}
  }
  if(!hit)return false;
  if(hit.topic)openTopic(hit.topic);else goNode(hit.go);
  return true;
}
function mountWa(){
  const qOld=document.getElementById("wa-q"),qVal=qOld?qOld.value:"";
  const s=src(),show=(view==="site"||view==="preview")&&s.contact.waOn;
  if(!show){waRoot.innerHTML="";return;}
  waRoot.innerHTML=(waOpen?`<div class="wa-panel" role="dialog" aria-label="Chat assistant">
    <div class="wa-head"><img src="${LOGO}" alt=""><div><b>${esc(s.brand.name)}</b><small>${esc(s.contact.hours)}</small></div>
      <button class="wa-x" type="button" data-w="restart" aria-label="Start over" title="Start over">↺</button>
      <button class="wa-x" type="button" data-w="toggle" aria-label="Close chat">×</button></div>
    <div class="wa-body" id="wa-body" aria-live="polite"></div>
    <p class="wa-voice" id="wa-voice" aria-live="polite" ${voiceNote?"":"hidden"}>${esc(voiceNote)}</p>
    <form class="wa-ask" id="wa-ask"><label for="wa-q" class="sr-only">Ask a question</label>
      <textarea id="wa-q" rows="1" placeholder="${aiFn?"Ask about plans, slow internet, Wi-Fi…":"Type your question…"}" maxlength="600"></textarea>
      ${SR?`<button type="button" class="wa-mic" id="wa-mic" data-w="mic" aria-pressed="false" aria-label="Speak your question">${MIC_SVG}</button>`:""}
      <button type="submit" id="wa-qbtn" class="${aiCtl?"stop":""}" aria-label="${aiCtl?"Stop answer":"Send question"}">${aiCtl?'<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect width="14" height="14" rx="2" fill="currentColor"/></svg>':'<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 20.5 21.5 12 3 3.5l.01 6.6L16 12 3.01 13.9z"/></svg>'}</button></form>
    <p class="wa-note">Your details are sent to us through WhatsApp on ${esc(s.contact.whatsapp)}.</p>
  </div>`:"")+`<button class="wa-fab" type="button" data-w="toggle" aria-expanded="${waOpen}">${WA_ICON}<span>${waOpen?"Close":"Chat with us"}</span></button>`;
  const qNew=document.getElementById("wa-q");if(qNew&&qVal)qNew.value=qVal;
  if(waOpen){if(!chat.length)startChat();else paintChat();}
  setMicUI();
}
function fieldHTML(f,preset){
  const id="wf-"+f.k,lab=`<label for="${id}">${esc(f.l)}${f.req?' <span class="req">*</span>':""}</label>`;
  let inp;
  if(f.t==="select")inp=`<select id="${id}" name="${f.k}">${f.req?'<option value="">Select…</option>':""}${f.o.map(o=>`<option${preset&&preset[f.k]===o?" selected":""}>${esc(o)}</option>`).join("")}</select>`;
  else if(f.t==="area")inp=`<textarea id="${id}" name="${f.k}" rows="2" placeholder="${esc(f.ph||"")}"></textarea>`;
  else inp=`<input id="${id}" name="${f.k}" ${f.t==="tel"?'inputmode="tel" autocomplete="tel" placeholder="10-digit number"':f.t==="pin"?'inputmode="numeric" maxlength="6" placeholder="400058"':""} ${f.k==="name"?'autocomplete="name"':""}>`;
  return `<div class="field">${lab}${inp}</div>`;
}
function stepHTML(st){
  if(st.type==="menu"||st.type==="after"){
    const items=st.type==="menu"?[...TOPICS,["ask","Help & troubleshooting"]]:[...(st.extra==="conn"?[["conn","Book a new connection"]]:[]),["menu","Main menu"]];
    return `<div class="wa-quick">${items.map(t=>`<button type="button" data-w="${t[0]==="menu"?"menu":"topic"}" data-t="${t[0]}">${esc(t[1])}</button>`).join("")}</div>`;
  }
  if(st.type==="ai"){
    const labels={conn:"Book a new connection",plans:"See plan prices",issue:"Report a problem",tv:"Cable TV enquiry",bill:"Pay my bill"};
    return `<div class="wa-quick">${st.actions.map(a=>`<button type="button" data-w="topic" data-t="${a}">${labels[a]}</button>`).join("")}<button type="button" data-w="menu">Main menu</button></div>`;
  }
  if(st.type==="tree"||st.type==="help"){
    const opts=st.type==="help"?HELP_OPTS:st.opts;
    return `<div class="wa-quick">${opts.map(o=>`<button type="button" data-w="node" data-n="${esc(o[1])}" data-l="${esc(o[0])}">${esc(o[0])}</button>`).join("")}</div>`;
  }
  if(st.type==="quiz"){
    return `<div class="wa-quick">${QUIZ_OPTS[st.q].map((o,i)=>`<button type="button" data-w="quiz" data-q="${st.q}" data-v="${i}">${esc(o)}</button>`).join("")}</div>`;
  }
  if(st.type==="examples"){
    return `<div class="wa-quick">${st.q.map(q=>`<button type="button" data-w="askq" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>`;
  }
  if(st.type==="form"){
    const F=forms(src())[st.kind];let html="",buf=[];
    F.fields.forEach(f=>{if(f.half){buf.push(fieldHTML(f,st.preset));if(buf.length===2){html+=`<div class="row2">${buf.join("")}</div>`;buf=[];}}else{if(buf.length){html+=buf.join("");buf=[];}html+=fieldHTML(f,st.preset);}});
    html+=buf.join("");
    return `<form class="wa-form" id="wa-form" data-kind="${st.kind}" novalidate>${html}<p class="err" id="wa-err" aria-live="polite"></p>
      <button class="wa-go" type="submit">Submit details</button></form>`;
  }
  return "";
}
function paintChat(){
  const body=document.getElementById("wa-body");if(!body)return;
  body.innerHTML=chat.map(m=>m.from==="typing"?`<div class="wa-bubble wa-typing" data-m><i></i><i></i><i></i></div>`
    :m.from==="bot"?`<div class="wa-bubble${m.wide?" wide":""}" data-m>${m.ai?'<span class="wa-ai-tag">AI assistant</span><br>':""}<span ${m.live?"data-live":""}>${m.html}</span>${m.live?"":`<time>${m.time}</time>`}</div>`
    :`<div class="wa-user">${m.html}</div>`).join("")+(waStep?stepHTML(waStep):"");
  const bots=body.querySelectorAll("[data-m]"),last=bots[bots.length-1];
  body.scrollTop=last?Math.max(0,last.offsetTop-8):0;
  const first=body.querySelector("#wa-form input,#wa-form select");if(first&&matchMedia("(min-width:700px)").matches)first.focus({preventScroll:true});
  updateDots();
}
function botSay(html,next,wide){
  clearTimeout(waTimer);waStep=null;chat.push({from:"typing"});paintChat();
  waTimer=setTimeout(()=>{chat.pop();chat.push({from:"bot",html,wide,time:clock()});waStep=next;paintChat();speak(html,optionsText(next));},reduceMo()?0:550);
}
function startChat(){chat=[];const s=src();botSay(esc(s.contact.waGreeting).replace(/\n/g,"<br>")+"<br><br>Choose an option below.",{type:"menu"});}
function sliderHTML(s){
  const plans=s.plans.filter(p=>p.visible&&p.name&&p.price>0);
  if(!plans.length)return "Our plans are being updated. Please call "+esc(s.contact.phone)+" for current rates.";
  return `Here are our current plans. Swipe to see them all.<div class="wa-slider"><div class="wa-track" id="wa-track">${plans.map(p=>{const sp=fmtSpeed(p.mbps);return `<div class="wa-card${p.popular?" pop":""}">
    ${p.popular?'<span class="tg">Popular</span>':""}<span class="pn">${esc(p.name)}</span>
    <span class="sp">${sp[0]}<small>${sp[1]}</small></span><span class="pr">${inr(p.price)} <small>/month</small></span>
    <ul>${p.features.slice(0,3).map(x=>`<li>${esc(x)}</li>`).join("")}</ul>
    <button class="wa-go" type="button" data-w="choose" data-plan="${esc(p.name)}">Book this plan</button></div>`;}).join("")}</div>
    <div class="wa-snav"><button type="button" data-w="prev" aria-label="Previous plan">‹</button><span class="wa-dots">${plans.map((_,i)=>`<i${i?"":' class="on"'}></i>`).join("")}</span><button type="button" data-w="next" aria-label="Next plan">›</button></div></div>
    <span style="font-size:12px;color:var(--muted)">${esc(s.billing.note)}</span>`;
}
function updateDots(){const t=document.getElementById("wa-track");if(!t)return;const cards=t.children,dots=waRoot.querySelectorAll(".wa-dots i");
  const i=Math.round(t.scrollLeft/((cards[1]?cards[1].offsetLeft-cards[0].offsetLeft:t.clientWidth)||1));dots.forEach((d,j)=>d.classList.toggle("on",j===i));}
function pickTopic(t,preset){
  const lab=t==="ask"?"Help & troubleshooting":(TOPICS.find(x=>x[0]===t)||[t,"Book a new connection"])[1];
  chat.push({from:"user",html:esc(preset&&preset.plan?`I want to book ${preset.plan}`:lab)});
  openTopic(t,preset);
}
function openTopic(t,preset){
  const s=src();
  if(t==="plans")return botSay(sliderHTML(s),{type:"after",extra:"conn"},true);
  if(t==="ask")return aiFn?botSay("Sure. Type your question in the box below, or tap one of these. I can help with slow or no internet, Wi-Fi problems, and choosing the right plan.",{type:"examples",q:["My internet is not working","Wi-Fi is slow in my bedroom","Which plan suits a family of 4?","Best plan for work from home and gaming"]})
    :botSay("Sure! What do you need help with? Tap a topic, or type your question in the box below.",{type:"help"});
  const F=forms(s)[t];botSay(esc(F.intro),{type:"form",kind:t,preset});
}

/* ---------- Free assistant: runs in the browser, no AI service or API cost ---------- */
const INTENTS=[
  ["down",["not working","no internet","net nahi","internet nahi","nahi chal","nahi chalta","band hai","net band","internet band"," down ","disconnect"," los ","red light","no connection","not connecting","kaam nahi","नहीं चल","बंद"]],
  ["slow",["slow","speed","buffer"," lag","dheema","dhima","dheere"," ping","latency","धीमा"]],
  ["wifi",["wifi","wi fi","signal","range","router","password","network name","ssid"]],
  ["suggest",["which plan","best plan","suggest","recommend","family","gaming","work from home"," wfh","kaunsa plan","konsa plan","plan batao","konsa","kaunsa"]],
  ["price",["price","rate","cost","charges","kitna","kitne","tariff","plans","plan list","monthly"," plan "]],
  ["conn",["new connection","install","connection chahiye","new line","lagwana","lagana","shift","relocat"]],
  ["bill",["bill"," pay","payment","recharge"," due","renew","invoice"]],
  ["tv",["cable"," tv","set top","settop","channel"," dth"]],
  ["area",["area","available","service in","coverage","pincode","pin code","do you serve","milega"]],
  ["contact",["contact","phone","number"," call","timing","hours","office","address","email","whatsapp"]],
  ["hello",[" hi "," hii "," hello "," hey ","namaste","namaskar","good morning","good evening"]],
  ["thanks",["thank","dhanyavad","shukriya"]],
  ["menu",["main menu","start over","shuru se"]],
];
function detectIntent(q){
  const t=" "+q.toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g," ").trim()+" ";
  let best=null,score=0;
  for(const [k,words] of INTENTS){let sc=0;for(const w of words)if(t.includes(w))sc+=w.trim().length;if(sc>score){score=sc;best=k;}}
  return best;
}
const TREE={
  down1:{say:"Let's fix it. First, look at the lights on your router or fibre box (ONT).<br><br>Is any light <b>red</b>, or is the <b>LOS</b> light on or blinking?",opts:[["Yes, red / LOS light","down_los"],["No red light","down2"]]},
  down_los:{say:"A red or blinking LOS light means the fibre cable to your home has a problem, such as a cut or a loose connector. This needs our technician.<br><br>Please don't bend or pull the thin fibre cable. Report the problem and we'll send someone.",opts:[["Report a problem","@issue:Red light (LOS) on device"],["Main menu","@menu"]]},
  down2:{say:"Restart your equipment:<br>1. Switch off the router (and the fibre box, if separate) at the plug.<br>2. Wait 30 seconds, then switch it on.<br>3. Wait 2 minutes for the lights to settle.<br><br>Is the internet working now?",opts:[["Yes, it works","fixed"],["Still not working","down3"]]},
  down3:{say:"Check whether it's one device or all of them. Try another phone or laptop and, if you can, a LAN cable from the router.<br><br>What did you find?",opts:[["Works on other devices","down_dev"],["Not working on any device","down4"]]},
  down_dev:{say:"Your connection is fine; the problem is on that one device. Try:<br>1. Turn its Wi-Fi off and on, or restart it.<br>2. Forget the Wi-Fi network and reconnect with the password.<br>3. Turn off any VPN or data saver.<br>4. Check that its date and time are correct.",opts:[["That fixed it","fixed"],["Still not working","@issue:Net not working"]]},
  down4:{say:"One more check: has your bill been paid? Service can pause when a bill is due.",opts:[["Bill is paid","down5"],["Not sure / need to pay","@bill"]]},
  down5:{say:"Thanks for checking. It's probably a line problem that our team needs to look at. Report it below and we'll get it fixed as soon as possible.",opts:[["Report a problem","@issue:Net not working"],["Main menu","@menu"]]},
  slow1:{say:"Let's find out why it's slow. Is it slow on all devices, or only on Wi-Fi when you're far from the router?",opts:[["Only on Wi-Fi / far from router","wifi1"],["Slow on all devices","slow2"]]},
  slow2:{say:"Try these:<br>1. Restart the router (off for 30 seconds).<br>2. Pause big downloads, updates, cloud backups and streaming on other devices.<br>3. Test the speed near the router or with a LAN cable at fast.com.<br><br>Is it better now?",opts:[["Yes, it's better","fixed"],["Still slow","slow3"]]},
  slow3:{say:"Your plan may be too small for how your home uses the internet, or there may be a line problem. I can suggest a plan, or you can report the problem to our team.",opts:[["Suggest a plan","@suggest"],["Report slow internet","@issue:Slow browsing"]]},
  wifi1:{say:"Wi-Fi tips:<br>1. Keep the router high, central and in the open, not inside a cabinet or behind the TV.<br>2. Walls and mirrors weaken the signal, so move closer if you can.<br>3. Use the <b>5 GHz</b> network (often ends in “5G”) near the router for speed, and <b>2.4 GHz</b> for far rooms.<br>4. Restart the router once a week.<br>5. For a big home, a mesh unit or extender helps.",opts:[["That helped","fixed"],["Still a problem","@issue:Router / Wi-Fi problem"]]},
  fixed:{say:"Great, glad it's working! Anything else I can help with?",opts:[["Main menu","@menu"]]},
};
const HELP_OPTS=[["Internet not working","down1"],["Internet is slow","slow1"],["Wi-Fi problem","wifi1"],["Suggest a plan","@suggest"],["Plan prices","@plans"],["Main menu","@menu"]];
function goNode(n,label){
  waStep=null;if(label)chat.push({from:"user",html:esc(label)});
  if(n==="@menu")return botSay("What would you like help with?",{type:"menu"});
  if(n==="@suggest")return quizStart();
  if(n==="@plans")return openTopic("plans");
  if(n==="@bill")return openTopic("bill");
  if(n.startsWith("@issue:"))return openTopic("issue",{issue:n.slice(7)});
  if(n.startsWith("@conn:"))return openTopic("conn",{plan:n.slice(6)});
  const node=TREE[n];if(node)botSay(node.say,{type:"tree",opts:node.opts});
}
let quiz={};
function quizStart(){quiz={};botSay("I'll suggest the right plan. How many people use the internet at home?",{type:"quiz",q:1});}
const QUIZ_OPTS={1:["1–2 people","3–4 people","5 or more"],2:["Browsing, social media and calls","HD streaming and video calls","4K TV, online gaming or work from home"]};
function recommendPlan(){
  const s=src(),need=[[40,80,150],[80,150,250],[150,250,400]][quiz.u][quiz.p];
  const plans=s.plans.filter(p=>p.visible&&p.name&&p.price>0).sort((a,b)=>a.mbps-b.mbps);
  if(!plans.length)return botSay("Our plans are being updated. Please call "+esc(s.contact.phone)+" for current rates.",{type:"menu"});
  const pick=plans.find(p=>p.mbps>=need)||plans[plans.length-1],sp=fmtSpeed(pick.mbps),d12=+s.billing.d12||0;
  botSay(`For your home I recommend <b>${esc(pick.name)}</b>.
    <div class="wa-slider"><div class="wa-card solo${pick.popular?" pop":""}">${pick.popular?'<span class="tg">Popular</span>':""}<span class="pn">${esc(pick.name)}</span>
    <span class="sp">${sp[0]}<small>${sp[1]}</small></span><span class="pr">${inr(pick.price)} <small>/month</small></span>
    <ul>${pick.features.slice(0,3).map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div></div>
    ${pick.mbps<need?"This is our fastest plan. ":""}${d12?`Pay for 12 months and save ${d12}%.`:""}`,
    {type:"tree",opts:[["Book "+pick.name,"@conn:"+pick.name],["See all plans","@plans"],["Main menu","@menu"]]},true);
}
function freeAsk(q){
  const s=src(),prev=waStep;clearTimeout(waTimer);waStep=null;chat.push({from:"user",html:esc(q)});
  const pin=(q.match(/\b\d{6}\b/)||[])[0];
  if(pin){
    const hits=s.areas.filter(a=>a.pin===pin),live=hits.find(a=>a.status==="live");
    return botSay(live?`Good news! We serve <b>${esc(live.name)}</b> (${pin}). Would you like to book a connection?`
      :hits.length?`${esc(hits[0].name)} (${pin}) is coming soon. Leave your details and we'll contact you when it's live.`
      :`We don't serve ${pin} yet, but we're expanding. Leave your details and we'll check your building.`,
      {type:"tree",opts:[["Book a new connection","@conn:"],["Main menu","@menu"]]});
  }
  if(matchOption(prev,q))return;
  const c=s.contact;
  switch(detectIntent(q)){
    case "menu":return botSay("What would you like help with?",{type:"menu"});
    case "down":return goNode("down1");
    case "slow":return goNode("slow1");
    case "wifi":return goNode("wifi1");
    case "suggest":return quizStart();
    case "price":return openTopic("plans");
    case "conn":return openTopic("conn");
    case "bill":return openTopic("bill");
    case "tv":return openTopic("tv");
    case "area":return botSay("Type your 6-digit PIN code and I'll check whether we serve your area.",null);
    case "contact":return botSay(`Phone: <b>${esc(c.phone)}</b><br>WhatsApp: <b>${esc(c.whatsapp)}</b><br>Email: ${esc(c.email)}<br>Hours: ${esc(c.hours)}<br>Office: ${esc(c.address)}`,{type:"tree",opts:[["Main menu","@menu"]]});
    case "hello":return botSay("Hello! How can I help? Tap a topic below or type your question.",{type:"help"});
    case "thanks":return botSay("You're welcome! Anything else I can help with?",{type:"help"});
    default:return botSay(`Sorry, I didn't understand that. Try one of these topics, or call us on ${esc(c.phone)}.`,{type:"help"});
  }
}
function submitForm(form){
  const s=src(),kind=form.dataset.kind,F=forms(s)[kind],err=document.getElementById("wa-err"),vals=[];
  for(const f of F.fields){
    const el=form.elements[f.k];let v=(el.value||"").trim();
    if(f.req&&!v){err.textContent=`Please fill in “${f.l}”.`;el.focus();return;}
    if(v&&f.t==="tel"){const d=v.replace(/\D/g,"").slice(-10);if(d.length!==10){err.textContent="Enter a 10-digit mobile number.";el.focus();return;}v=d;}
    if(v&&f.t==="pin"&&!/^\d{6}$/.test(v)){err.textContent="PIN code must be 6 digits.";el.focus();return;}
    if(v)vals.push([f.l,v,f.k]);
  }
  const get=k=>(vals.find(x=>x[2]===k)||[])[1];
  const title=kind==="issue"?`Complaint: ${get("issue")}`:F.title;
  const msg=`*${title}*\n`+vals.map(v=>`${v[0]}: ${v[1]}`).join("\n")+`\n\n_Sent from website chat_`;
  const who=get("name")?`, ${esc(get("name").split(" ")[0])}`:"";
  const next={conn:"Our team will call you to confirm a visit.",tv:"Our team will call you with options and pricing.",issue:"Our support team will pick it up as soon as possible.",bill:"We'll reply with your due amount and how to pay."}[kind];
  const btn=form.querySelector("button[type=submit]");btn.disabled=true;btn.textContent="Sending…";err.textContent="";
  saveRequest(kind,vals).then(id=>{
    const ref=id?`RV-${id}`:"";
    const text=ref?msg.replace("\n\n_Sent from website chat_",`\nRef: ${ref}\n\n_Sent from website chat_`):msg;
    chat.push({from:"user",html:`<dl>${vals.map(v=>`<dt>${esc(v[0])}</dt><dd>${esc(v[1])}</dd>`).join("")}</dl>`});
    const wa=`<a class="wa-go" href="${waLink(s,text)}" target="_blank" rel="noopener">${WA_ICON}Send on WhatsApp</a>`;
    botSay(ref?`Thanks${who}! Your request <b>${ref}</b> is saved and our team has it. ${next}<br><br>For a faster reply, you can also send it to us on WhatsApp:<br><br>${wa}`
      :`Thanks${who}! Tap the button below to send these details to us on WhatsApp, then press send in WhatsApp. ${next}<br><br>${wa}`,{type:"after"});
  });
}
// Saves a chatbot form in the database. Resolves to the request number, or null if saving isn't possible.
async function saveRequest(kind,vals){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),20000);
  try{
    const d=await gas("addRequest",{kind,client:clientId(),fields:vals.map(v=>({k:v[2],label:v[0],value:v[1]}))},ctl.signal);
    return d.id||null;
  }catch(e){return null;}finally{clearTimeout(timer);}
}
waRoot.addEventListener("click",e=>{
  const b=e.target.closest("[data-w]");if(!b)return;const w=b.dataset.w;
  if(w==="mic"){toggleMic();return;}
  if(w==="toggle"){waOpen=!waOpen;if(!waOpen)stopVoice();mountWa();const f=waRoot.querySelector(waOpen?".wa-panel button":".wa-fab");if(f&&!waOpen)f.focus();return;}
  if(w==="restart"){clearTimeout(waTimer);if(aiCtl)aiCtl.abort();aiTurns=[];startChat();return;}
  if(w==="askq"){askAI(b.dataset.q);return;}
  if(w==="node"){goNode(b.dataset.n,b.dataset.l);return;}
  if(w==="quiz"){quizPick(+b.dataset.q,+b.dataset.v,true);return;}
  if(w==="menu"){chat.push({from:"user",html:"Main menu"});botSay("What would you like help with?",{type:"menu"});return;}
  if(w==="topic"){waStep=null;pickTopic(b.dataset.t);return;}
  if(w==="choose"){waStep=null;pickTopic("conn",{plan:b.dataset.plan});return;}
  if(w==="prev"||w==="next"){const t=document.getElementById("wa-track");if(t){const st=t.children[1]?t.children[1].offsetLeft-t.children[0].offsetLeft:t.clientWidth;t.scrollBy({left:w==="next"?st:-st,behavior:reduceMo()?"auto":"smooth"});}}
});
waRoot.addEventListener("submit",e=>{e.preventDefault();
  if(e.target.id==="wa-ask"){if(aiCtl){aiCtl.abort();return;}const q=document.getElementById("wa-q");const v=q.value;q.value="";voiceMode=false;askAI(v);return;}
  submitForm(e.target);});
waRoot.addEventListener("keydown",e=>{if(e.target.id==="wa-q"&&e.key==="Enter"&&!e.shiftKey){e.preventDefault();e.target.form.requestSubmit();}});
waRoot.addEventListener("scroll",e=>{if(e.target.id==="wa-track")updateDots();},true);
addEventListener("keydown",e=>{if(e.key==="Escape"&&waOpen){waOpen=false;stopVoice();mountWa();}});
// Phone and tablet menu: opens from the header button; closes on a link tap, Escape, or a tap elsewhere.
function setMenu(open){
  const m=document.getElementById("mnav"),b=document.querySelector(".menu-btn");if(!m||!b)return;
  m.hidden=!open;b.setAttribute("aria-expanded",String(open));b.setAttribute("aria-label",open?"Close menu":"Open menu");
}
addEventListener("click",e=>{const m=document.getElementById("mnav");if(!m||m.hidden)return;
  if(e.target.closest(".mnav a")||!e.target.closest(".top"))setMenu(false);});
addEventListener("keydown",e=>{const m=document.getElementById("mnav");if(e.key==="Escape"&&m&&!m.hidden){setMenu(false);document.querySelector(".menu-btn").focus();}});
function rerenderSite(){const y=scrollY;app.innerHTML=(view==="preview"?previewBar():"")+siteHTML(view==="preview"?draft:PUBLISHED);siteAfter();scrollTo(0,y);}

/* ---------- Login ---------- */
function loginHTML(){return `
<div class="login"><div class="wrap" style="display:grid;place-items:center;width:100%">
<form id="login-form" novalidate>
  <div class="brand"><img src="${LOGO}" alt="" width="48" height="44"><span>${esc(PUBLISHED.brand.name)}</span></div>
  <h1>Admin login</h1>
  <p>Sign in to edit plans, rates and contact details on the website.</p>${pubMsg&&pubMsg.k==="bad"?`<p class="err">${esc(pubMsg.t)}</p>`:""}
  <div class="field"><label for="u">Username</label><input id="u" autocomplete="username"></div>
  <div class="field"><label for="pw">Password</label><input id="pw" type="password" autocomplete="current-password"></div>
  <p class="err" id="login-err" aria-live="polite"></p>
  <button class="btn btn-primary" type="submit">Sign in</button>
  <a class="backlink" href="#top" data-act="to-site">← Back to website</a>
</form></div></div>`;}

/* ---------- Admin ---------- */
function field(label,id,val,attrs=""){return `<div class="field"><label for="${id}">${label}</label><input id="${id}" value="${esc(val)}" ${attrs}></div>`;}
function adminTop(){return `
<div class="admin-top"><div class="wrap">
  <div class="brand"><img src="${LOGO}" alt="" width="40" height="37"><span>Website admin</span></div>
  <div class="actions">
    ${adminTab==="site"?`<span class="chip" id="status"><i></i><span></span></span>`:""}
    <a class="btn btn-ghost btn-sm" href="#top" data-act="to-site">View live site</a>
    <button class="btn btn-ghost btn-sm" type="button" data-act="logout">Log out</button>
  </div>
</div></div>`;}
function tabsHTML(){return `<div class="tabs" role="tablist">
  <button type="button" role="tab" data-act="tab" data-t="site" aria-selected="${adminTab==="site"}">Website</button>
  <button type="button" role="tab" data-act="tab" data-t="requests" aria-selected="${adminTab==="requests"}">Requests<span class="count" id="new-count" ${newCount?"":"hidden"}>${newCount}</span></button>
</div>`;}
function adminHTML(){
  const d=draft;
  return `
${adminTop()}
<main class="wrap admin-main">
  ${tabsHTML()}
  <div class="admin-intro"><h2>Manage your website</h2>
  <p>Edit below, check your changes with Preview, then press Publish to update the website for all visitors. Your edits are kept in this browser tab until you publish or discard them.</p></div>
  ${pubMsg?`<div class="pub-msg ${pubMsg.k}" role="status">${esc(pubMsg.t)}</div>`:""}

  <section class="panel" style="padding-block:24px">
    <div class="panel-head"><div><h3>Plans &amp; rates</h3><p>Plans marked “Show on website” appear in this order. Rates are monthly, in rupees.</p></div>
    <button class="btn btn-sm" type="button" data-act="add-plan">+ Add plan</button></div>
    ${d.plans.length?d.plans.map((p,i)=>`
    <div class="plan-edit${p.visible?"":" hidden-plan"}">
      <div class="pe-head"><b>Plan ${i+1}${p.visible?"":" · hidden"}</b>
        <div class="icon-btns">
          <button class="ibtn" type="button" data-act="up" data-i="${i}" ${i===0?"disabled":""} aria-label="Move up">↑</button>
          <button class="ibtn" type="button" data-act="down" data-i="${i}" ${i===d.plans.length-1?"disabled":""} aria-label="Move down">↓</button>
          <button class="ibtn del" type="button" data-act="del-plan" data-i="${i}">Delete</button>
        </div></div>
      <div class="pe-grid">
        <div class="field"><label for="pn${i}">Plan name</label><input id="pn${i}" data-p="${i}" data-f="name" value="${esc(p.name)}" placeholder="e.g. Home 100"></div>
        <div class="field"><label for="ps${i}">Speed (Mbps)</label><input id="ps${i}" data-p="${i}" data-f="mbps" type="number" min="1" inputmode="numeric" value="${esc(p.mbps)}"></div>
        <div class="field"><label for="pr${i}">Monthly rate</label><div class="input-pre"><span>₹</span><input id="pr${i}" data-p="${i}" data-f="price" type="number" min="0" inputmode="numeric" value="${esc(p.price)}"></div></div>
      </div>
      <div class="field"><label for="pf${i}">Features (one per line)</label><textarea id="pf${i}" data-p="${i}" data-f="features" rows="4">${esc(p.features.join("\n"))}</textarea></div>
      <div class="checks">
        <label><input type="checkbox" id="pv${i}" data-p="${i}" data-f="visible" ${p.visible?"checked":""}> Show on website</label>
        <label><input type="checkbox" id="pp${i}" data-p="${i}" data-f="popular" ${p.popular?"checked":""}> Mark as most popular</label>
      </div>
    </div>`).join(""):`<p class="empty">No plans yet. Add your first plan.</p>`}
  </section>

  <section class="panel">
    <div class="panel-head"><div><h3>Billing discounts</h3><p>Discount applied when customers pick 6 or 12-month billing. Use 0 for no discount.</p></div></div>
    <div class="grid3">
      ${field("6-month discount (%)","b6",d.billing.d6,'data-bind="billing.d6" type="number" min="0" max="90" inputmode="numeric"')}
      ${field("12-month discount (%)","b12",d.billing.d12,'data-bind="billing.d12" type="number" min="0" max="90" inputmode="numeric"')}
    </div>
    ${field("Note under plans","bnote",d.billing.note,'data-bind="billing.note"')}
  </section>

  <section class="panel">
    <div class="panel-head"><div><h3>Contact details</h3><p>Shown in the contact section, FAQ and footer.</p></div></div>
    <div class="grid2">
      ${field("Phone number","cph",d.contact.phone,'data-bind="contact.phone" inputmode="tel"')}
      ${field("WhatsApp number","cwa",d.contact.whatsapp,'data-bind="contact.whatsapp" inputmode="tel"')}
      ${field("Email","cem",d.contact.email,'data-bind="contact.email" type="email"')}
      ${field("Support hours","chr",d.contact.hours,'data-bind="contact.hours"')}
      <div class="span2">${field("Office address","cad",d.contact.address,'data-bind="contact.address"')}</div>
    </div>
  </section>

  <section class="panel">
    <div class="panel-head"><div><h3>WhatsApp chat</h3><p>A chat assistant on every page answers common questions, guides customers through troubleshooting, suggests plans, and collects details for new connections, cable TV, complaints and bill payment, then sends them to the WhatsApp number above.</p></div></div>
    <div class="checks"><label><input type="checkbox" id="waon" data-bind="contact.waOn" ${d.contact.waOn?"checked":""}> Show WhatsApp chat button on website</label></div>
    <div class="field"><label for="wag">Greeting message</label><textarea id="wag" rows="3" data-bind="contact.waGreeting">${esc(d.contact.waGreeting)}</textarea></div>
    <div class="grid2">
      <div class="field"><label for="bis">“Report a problem” issue list (one per line)</label><textarea id="bis" rows="7" data-list="bot.issues">${esc(d.bot.issues.join("\n"))}</textarea></div>
      <div class="field"><label for="btv">Cable TV requirement list (one per line)</label><textarea id="btv" rows="7" data-list="bot.tvNeeds">${esc(d.bot.tvNeeds.join("\n"))}</textarea></div>
    </div>
  </section>

  <section class="panel">
    <div class="panel-head"><div><h3>Business name &amp; homepage text</h3></div></div>
    <div class="grid2">
      ${field("Business name","bn",d.brand.name,'data-bind="brand.name"')}
      ${field("Small heading above title","bt",d.brand.tagline,'data-bind="brand.tagline"')}
      <div class="span2">${field("Main headline","bh",d.brand.headline,'data-bind="brand.headline"')}</div>
      <div class="field span2"><label for="bi">Intro paragraph</label><textarea id="bi" rows="3" data-bind="brand.intro">${esc(d.brand.intro)}</textarea></div>
    </div>
  </section>

  <section class="panel">
    <div class="panel-head"><div><h3>Service areas</h3><p>Used by the PIN code checker on the website.</p></div>
    <button class="btn btn-sm" type="button" data-act="add-area">+ Add area</button></div>
    ${d.areas.map((a,i)=>`<div class="area-row">
      <div class="field"><label for="an${i}">Area name</label><input id="an${i}" data-a="${i}" data-f="name" value="${esc(a.name)}"></div>
      <div class="field"><label for="ap${i}">PIN code</label><input id="ap${i}" data-a="${i}" data-f="pin" inputmode="numeric" maxlength="6" value="${esc(a.pin)}"></div>
      <div class="field"><label for="as${i}">Status</label><select id="as${i}" data-a="${i}" data-f="status"><option value="live"${a.status==="live"?" selected":""}>Live</option><option value="soon"${a.status==="soon"?" selected":""}>Coming soon</option></select></div>
      <button class="ibtn del" type="button" data-act="del-area" data-i="${i}" style="align-self:end;padding-block:12px">Remove</button>
    </div>`).join("")}
  </section>
</main>
<div class="bottom-bar"><div class="wrap">
  <span class="note" id="bar-note"></span>
  <div class="actions">
    <button class="btn btn-ghost btn-sm" type="button" data-act="discard" id="discard-btn">${discardArmed?"Click again to discard":"Discard changes"}</button>
    <button class="btn btn-sm" type="button" data-act="preview">Preview</button>
    <button class="btn btn-primary btn-sm" type="button" data-act="publish" id="pub-btn" ${publishing?"disabled":""}>${publishing?"Publishing…":"Publish to website"}</button>
  </div>
</div></div>`;
}
function updateStatus(){
  const st=document.getElementById("status"),note=document.getElementById("bar-note"),dis=document.getElementById("discard-btn");
  const dt=dirty();
  if(st){st.hidden=adminTab!=="site";st.classList.toggle("dirty",dt);st.lastElementChild.textContent=dt?"Unpublished changes":"Website up to date";}
  if(note)note.textContent=dt?"You have changes that are not on the website yet.":"No unpublished changes.";
  if(dis)dis.disabled=!dt;
}
function previewBar(){return `<div class="preview-bar"><div class="wrap"><span>Preview: these changes are not published yet.</span>
  <span style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-sm" type="button" data-act="back-admin">Back to editing</button>
  <button class="btn btn-sm" type="button" data-act="publish">Publish to website</button></span></div></div>`;}


/* ---------- Admin: customer requests from the chatbot ---------- */
const STATUS_LABEL={new:"New",in_progress:"In progress",done:"Done"};
const fmtWhen=iso=>new Date(iso).toLocaleString("en-IN",{day:"numeric",month:"short",hour:"numeric",minute:"2-digit"});
function requestsPage(){
  return `${adminTop()}
<main class="wrap admin-main">
  ${tabsHTML()}
  <div class="admin-intro"><h2>Customer requests</h2>
  <p>Everything customers submit through the website chat. Change the status as you handle each request; add notes for your team.</p></div>
  <div class="req-tools">
    <div class="req-filters" role="group" aria-label="Show">${[["new","New"],["in_progress","In progress"],["done","Done"],["all","All"]].map(f=>`<button type="button" data-act="rfilter" data-f="${f[0]}" aria-pressed="${reqFilter===f[0]}">${f[1]}</button>`).join("")}</div>
    <form class="req-search" id="req-search" role="search"><label for="rq" class="sr-only">Search requests</label>
      <input id="rq" type="search" placeholder="Name, mobile, ID or RV-no." value="${esc(reqQuery)}">
      <button class="btn btn-sm" type="submit">Search</button></form>
    <button class="btn btn-ghost btn-sm" type="button" data-act="rrefresh">Refresh</button>
  </div>
  <div id="req-list" aria-live="polite">${reqListHTML()}</div>
</main>`;
}
function reqListHTML(){
  if(reqError)return `<div class="pub-msg bad">${esc(reqError)}</div>`;
  if(!reqs)return `<p class="empty">Loading requests…</p>`;
  if(!reqs.length)return `<p class="empty">${reqQuery?"No requests match your search.":reqFilter==="new"?"No new requests. New ones from the website chat appear here.":"No requests here yet."}</p>`;
  return reqs.map(r=>{
    const phone=/^\d{10}$/.test(r.contact||"")?r.contact:"";
    return `<article class="req s-${r.status}">
    <div class="req-head"><h3>${esc(r.title)}</h3><span class="when">RV-${r.id} · ${esc(fmtWhen(r.created_at))}</span></div>
    <dl class="req-details">${(r.details||[]).map(d=>`<div><dt>${esc(d.label)}</dt><dd>${esc(d.value)}</dd></div>`).join("")}</dl>
    <div class="req-actions">
      <div class="field"><label for="rst${r.id}">Status</label><select id="rst${r.id}" data-req="${r.id}">${Object.entries(STATUS_LABEL).map(([k,l])=>`<option value="${k}"${r.status===k?" selected":""}>${l}</option>`).join("")}</select></div>
      ${phone?`<a class="btn btn-ghost btn-sm" href="https://wa.me/91${phone}" target="_blank" rel="noopener">WhatsApp ${phone}</a><a class="btn btn-ghost btn-sm" href="tel:+91${phone}">Call</a>`:""}
    </div>
    <div class="field"><label for="rn${r.id}">Notes for your team</label><textarea id="rn${r.id}" rows="2" maxlength="2000">${esc(r.notes||"")}</textarea></div>
    <div class="req-save"><button class="btn btn-sm" type="button" data-act="rsave" data-id="${r.id}">Save notes</button><span class="req-msg" id="rm${r.id}" aria-live="polite"></span></div>
  </article>`;}).join("");
}
function paintReqs(){
  const el=document.getElementById("req-list");if(el)el.innerHTML=reqListHTML();
  const c=document.getElementById("new-count");if(c){c.textContent=newCount;c.hidden=!newCount;}
}
async function loadReqs(quiet){
  if(!quiet){reqs=null;reqError="";paintReqs();}
  try{
    const res=await api(`/api/requests?status=${reqFilter}&q=${encodeURIComponent(reqQuery)}`);
    if(res.status===401){signOut({k:"bad",t:"Your admin session has expired. Sign in again."});render();return;}
    const body=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(body.error);
    newCount=body.newCount||0;
    if(!quiet){reqs=body.requests;reqError="";}
  }catch(e){if(!quiet)reqError=(e&&e.message)||"Couldn't load requests. Check your connection and press Refresh.";}
  if(quiet){const c=document.getElementById("new-count");if(c){c.textContent=newCount;c.hidden=!newCount;}}
  else paintReqs();
}
async function saveReq(id,patch,msgEl){
  if(msgEl)msgEl.textContent="Saving…";
  try{
    const res=await api(`/api/requests/${id}`,{method:"PATCH",body:JSON.stringify(patch)});
    if(res.status===401){signOut({k:"bad",t:"Your admin session has expired. Sign in again."});render();return;}
    const body=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(body.error);
    const r=reqs&&reqs.find(x=>x.id===id);if(r)Object.assign(r,body.request);
    if(msgEl)msgEl.textContent="Saved";
    if(patch.status){loadReqs(true);const card=document.getElementById("rst"+id)?.closest(".req");if(card)card.className="req s-"+patch.status;}
  }catch(e){if(msgEl)msgEl.textContent=(e&&e.message)||"Couldn't save. Try again.";}
}

/* ---------- Render ---------- */
function render(){renderView();mountWa();}
function renderView(){
  const isAdmin=routeIsAdmin();
  if(isAdmin&&!authed){view="login";app.innerHTML=loginHTML();document.getElementById("u").focus();return;}
  if(isAdmin&&previewing){view="preview";app.innerHTML=previewBar()+siteHTML(draft);siteAfter();return;}
  if(isAdmin&&adminTab==="requests"){view="admin";app.innerHTML=requestsPage();return;}
  if(isAdmin){view="admin";app.innerHTML=adminHTML();updateStatus();return;}
  view="site";app.innerHTML=siteHTML(PUBLISHED);siteAfter();
}
addEventListener("hashchange",()=>{
  const want=routeIsAdmin()?(authed?(previewing?"preview":"admin"):"login"):"site";
  if(want!==view){render();if(want!=="site")scrollTo(0,0);}
});

/* ---------- Validation & publish ---------- */
function problems(){
  const out=[];
  draft.plans.forEach((p,i)=>{if(!p.visible)return;
    if(!p.name.trim())out.push(`Plan ${i+1} needs a name.`);
    if(!(p.mbps>0))out.push(`Plan ${i+1} needs a speed above 0.`);
    if(!(p.price>0))out.push(`Plan ${i+1} needs a monthly rate above ₹0.`);});
  draft.areas.forEach((a,i)=>{if(a.pin&&!/^\d{6}$/.test(a.pin))out.push(`Service area ${i+1}: PIN code must be 6 digits.`);});
  return out;
}
async function publish(){
  if(publishing)return;
  const errs=problems();
  if(errs.length){pubMsg={k:"bad",t:"Fix these before publishing: "+errs.join(" ")};previewing=false;render();scrollTo(0,0);return;}
  if(!dirty()){pubMsg={k:"info",t:"Nothing to publish. The website already shows these details."};previewing=false;render();scrollTo(0,0);return;}
  publishing=true;previewing=false;pubMsg={k:"info",t:"Publishing to the website…"};render();scrollTo(0,0);
  try{
    const res=await api("/api/site",{method:"PUT",body:JSON.stringify(draft)});
    const body=await res.json().catch(()=>({}));
    publishing=false;
    if(res.status===401){signOut({k:"bad",t:"Your admin session has expired. Sign in again; your edits are kept in this tab."});render();return;}
    if(!res.ok){pubMsg={k:"bad",t:body.error||"Publishing failed. Try again in a moment."};render();return;}
    PUBLISHED=norm(body.site);sheetEmpty=false;draft=clone(PUBLISHED);ss.del("rv-draft");rememberSite();document.title=PUBLISHED.brand.name;
    pubMsg={k:"ok",t:"Published. The website now shows your changes."};render();
  }catch(e){publishing=false;pubMsg={k:"bad",t:"Couldn't reach the Google Sheet. Check your connection and try again."};render();}
}

/* ---------- Events ---------- */
app.addEventListener("click",e=>{
  const b=e.target.closest("[data-act]");if(!b)return;
  const act=b.dataset.act,i=+b.dataset.i;
  if(act!=="discard"&&discardArmed){discardArmed=false;const db=document.getElementById("discard-btn");if(db)db.textContent="Discard changes";}
  switch(act){
    case "menu":setMenu(document.getElementById("mnav").hidden);break;
    case "cycle":cycle=+b.dataset.c;rerenderSite();break;
    case "choose":setTimeout(()=>{const s=document.getElementById("l-plan");if(s)s.value=b.dataset.plan;},0);break;
    case "copy":{const el=document.getElementById(b.dataset.t);
      Promise.resolve().then(()=>navigator.clipboard.writeText(el.textContent)).then(()=>{b.textContent="Copied";setTimeout(()=>b.textContent="Copy",1500);})
      .catch(()=>{const s=getSelection(),r=document.createRange();r.selectNodeContents(el);s.removeAllRanges();s.addRange(r);});}break;
    case "to-site":previewing=false;break;
    case "tab":adminTab=b.dataset.t;ss.set("rv-tab",adminTab);render();scrollTo(0,0);if(adminTab==="requests")loadReqs();break;
    case "rfilter":reqFilter=b.dataset.f;document.querySelectorAll("[data-act=rfilter]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));loadReqs();break;
    case "rrefresh":loadReqs();break;
    case "rsave":{const id=+b.dataset.id;saveReq(id,{notes:document.getElementById("rn"+id).value},document.getElementById("rm"+id));}break;
    case "logout":api("/api/logout",{method:"POST"}).catch(()=>{});signOut();location.hash="top";render();scrollTo(0,0);break;
    case "add-plan":draft.plans.push({id:"p"+Date.now(),name:"",mbps:100,price:0,features:["Unlimited data"],popular:false,visible:true});saveDraft();render();
      setTimeout(()=>{const n=document.getElementById("pn"+(draft.plans.length-1));if(n){n.scrollIntoView({block:"center"});n.focus();}},0);break;
    case "del-plan":draft.plans.splice(i,1);saveDraft();render();break;
    case "up":case "down":{const j=act==="up"?i-1:i+1;[draft.plans[i],draft.plans[j]]=[draft.plans[j],draft.plans[i]];saveDraft();render();}break;
    case "add-area":draft.areas.push({name:"",pin:"",status:"live"});saveDraft();render();
      setTimeout(()=>{const n=document.getElementById("an"+(draft.areas.length-1));if(n){n.scrollIntoView({block:"center"});n.focus();}},0);break;
    case "del-area":draft.areas.splice(i,1);saveDraft();render();break;
    case "discard":if(!discardArmed){discardArmed=true;b.textContent="Click again to discard";}
      else{discardArmed=false;draft=clone(PUBLISHED);ss.del("rv-draft");pubMsg={k:"info",t:"Changes discarded. The editor matches the live website again."};render();scrollTo(0,0);}break;
    case "preview":previewing=true;cycle=1;chat=[];render();scrollTo(0,0);break;
    case "back-admin":previewing=false;render();scrollTo(0,0);break;
    case "publish":publish();break;
  }
});
function setPath(o,path,v){const k=path.split(".");let t=o;for(let n=0;n<k.length-1;n++)t=t[k[n]];t[k[k.length-1]]=v;}
function onField(e){
  const t=e.target;
  if(t.dataset.list){setPath(draft,t.dataset.list,t.value.split("\n").map(x=>x.trim()).filter(Boolean));saveDraft();return;}
  if(t.dataset.bind){const num=t.type==="number";setPath(draft,t.dataset.bind,t.type==="checkbox"?t.checked:num?(t.value===""?0:+t.value):t.value);saveDraft();return;}
  if(t.dataset.p!==undefined){const p=draft.plans[+t.dataset.p],f=t.dataset.f;
    if(f==="visible"){p.visible=t.checked;saveDraft();if(e.type==="change")render();return;}
    if(f==="popular"){draft.plans.forEach(q=>q.popular=false);p.popular=t.checked;saveDraft();if(e.type==="change")render();return;}
    if(f==="features")p.features=t.value.split("\n").map(s=>s.trim()).filter(Boolean);
    else if(f==="mbps"||f==="price")p[f]=t.value===""?0:+t.value;
    else p[f]=t.value;
    saveDraft();return;}
  if(t.dataset.a!==undefined){draft.areas[+t.dataset.a][t.dataset.f]=t.dataset.f==="pin"?t.value.replace(/\D/g,"").slice(0,6):t.value;saveDraft();}
}
app.addEventListener("input",e=>{if(e.target.type!=="checkbox")onField(e);});
app.addEventListener("change",e=>{
  if(e.target.dataset.req){const id=+e.target.dataset.req;saveReq(id,{status:e.target.value},document.getElementById("rm"+id));return;}
  if(e.target.type==="checkbox"||e.target.tagName==="SELECT")onField(e);});

app.addEventListener("submit",e=>{
  e.preventDefault();const f=e.target;
  if(f.id==="req-search"){reqQuery=document.getElementById("rq").value.trim();loadReqs();return;}
  if(f.id==="login-form"){
    const u=document.getElementById("u").value.trim(),p=document.getElementById("pw").value,err=document.getElementById("login-err"),btn=f.querySelector("button[type=submit]");
    btn.disabled=true;err.textContent="";
    gas("login",{username:u,password:p})
      .then(d=>({ok:!d.error,b:d.error?{error:d.message}:d}))
      .then(({ok,b})=>{
        if(ok){token=b.token;authed=true;ss.set("rv-token",token);pubMsg=null;render();scrollTo(0,0);loadReqs(adminTab!=="requests");}
        else{btn.disabled=false;err.textContent=b.error||"Wrong username or password. Check both and try again.";document.getElementById("pw").value="";}
      }).catch(()=>{btn.disabled=false;err.textContent="Couldn't reach the server. Check your connection and try again.";});
    return;
  }
  const s=view==="preview"?draft:PUBLISHED;
  if(f.id==="cov-form"){
    const v=document.getElementById("pin").value.trim(),r=document.getElementById("cov-result");
    r.className="result";let msg;
    if(!/^\d{6}$/.test(v))msg="Enter a 6-digit PIN code, for example 400058.";
    else{const hits=s.areas.filter(a=>a.pin===v),live=hits.find(a=>a.status==="live");
      if(live){r.classList.add("ok");msg=`Good news: we serve ${live.name} (${v}). Request a callback below to book a connection.`;}
      else if(hits.length){r.classList.add("soon");msg=`${hits[0].name} (${v}) is coming soon. Request a callback and we will contact you when it is live.`;}
      else msg=`${v} is not on our list yet. Request a callback and we will check your building.`;
      document.getElementById("l-pin").value=v;}
    r.innerHTML=`<span class="dot"></span><span>${esc(msg)}</span>`;
    return;
  }
  if(f.id==="lead-form"){
    const name=document.getElementById("l-name").value.trim(),phone=document.getElementById("l-phone").value.replace(/\D/g,"").slice(-10),err=document.getElementById("l-err");
    if(!name){err.textContent="Enter your name so we know who to ask for.";return;}
    if(phone.length!==10){err.textContent="Enter a 10-digit mobile number.";return;}
    const plan=document.getElementById("l-plan").value,pin=document.getElementById("l-pin").value.trim(),bld=document.getElementById("l-msg").value.trim();
    const text=`Hello, I'd like a callback about a new connection.\nName: ${name}\nMobile: ${phone}\nInterested in: ${plan}`+(pin?`\nPIN code: ${pin}`:"")+(bld?`\nBuilding: ${bld}`:"");
    let wa=s.contact.whatsapp.replace(/\D/g,"");if(wa.length===10)wa="91"+wa;
    f.innerHTML=`<h3>Almost done, ${esc(name.split(" ")[0])}.</h3><div class="done"><span>Send your request to us on WhatsApp. Your details are already filled in; tap Send in WhatsApp to finish.</span>
      <a class="btn btn-primary" href="https://wa.me/${wa}?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">Open WhatsApp</a>
      <span style="font-size:14px;color:var(--muted)">Prefer to call? Ring ${esc(s.contact.phone)}.</span></div>`;
  }
});

render();
if(routeIsAdmin()&&authed)loadReqs(adminTab!=="requests");
// Load the latest settings from the Google Sheet, then refresh the page if anything changed.
function rememberSite(){try{localStorage.setItem("rv-site",JSON.stringify(PUBLISHED));}catch(e){}}
gas("getSettings").then(d=>{
  if(d.error)return;
  if(!d.data){sheetEmpty=true;if(view==="admin")updateStatus();return;}
  const fresh=norm(d.data);
  if(same(fresh,PUBLISHED))return;
  const wasDirty=!same(draft,PUBLISHED);
  PUBLISHED=fresh;rememberSite();document.title=PUBLISHED.brand.name;
  if(!wasDirty){draft=clone(PUBLISHED);ss.del("rv-draft");}
  if(view==="site")rerenderSite();
  else if(view==="admin"&&adminTab==="site"&&!wasDirty)renderView();
  else if(view==="admin")updateStatus();
}).catch(()=>{});
if(!routeIsAdmin()&&location.hash.length>1){const t=document.getElementById(location.hash.slice(1));if(t)t.scrollIntoView();}
})();
