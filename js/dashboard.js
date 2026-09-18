let dashboardData={income:[],expenses:[],orders:[],statuses:[],inventory:[],services:[],incomeTypes:[]};

document.addEventListener("DOMContentLoaded",async()=>{
  const session=await checkAuth();
  if(!session)return;
  showDashboard();
  updateClock();
  setInterval(updateClock,1000);
  await loadDashboardSummary();
  const jump=document.getElementById("alerts-jump-btn");
  if(jump)jump.addEventListener("click",()=>document.getElementById("smart-alerts")?.closest(".alerts-panel")?.scrollIntoView({behavior:"smooth",block:"center"}));
});

function showDashboard(){
  const content=document.getElementById("dashboard-content");
  const login=document.getElementById("login-box");
  if(content)content.style.display="block";
  if(login)login.style.display="none";
}

function updateClock(){
  const now=new Date();
  const dateEl=document.getElementById("current-date");
  const timeEl=document.getElementById("current-time");
  if(dateEl)dateEl.textContent=new Intl.DateTimeFormat("ar-IQ-u-nu-latn",{year:"numeric",month:"long",day:"2-digit"}).format(now);
  if(timeEl)timeEl.textContent=new Intl.DateTimeFormat("en-GB",{hour:"2-digit",minute:"2-digit",hour12:false}).format(now);
  const year=document.getElementById("footer-year");if(year)year.textContent=now.getFullYear();
}

async function loadDashboardSummary(){
  const results=await Promise.all([
    supabaseClient.from("income").select("amount,created_at,income_type_id"),
    supabaseClient.from("expenses").select("amount,created_at,expense_type_id"),
    supabaseClient.from("work_orders").select("id,order_no,order_date,customer_name,quantity,net_total,status_id,services(name),paper_sizes(name),order_statuses(name)").order("order_no",{ascending:false}).limit(8),
    supabaseClient.from("order_statuses").select("id,name").eq("is_active",true),
    supabaseClient.from("inventory_items").select("id,name,current_quantity,minimum_quantity").eq("is_active",true),
    supabaseClient.from("services").select("id,name").eq("is_active",true),
    supabaseClient.from("income_types").select("id,name").eq("is_active",true)
  ]);
  dashboardData.income=results[0].data||[];
  dashboardData.expenses=results[1].data||[];
  dashboardData.orders=results[2].data||[];
  dashboardData.statuses=results[3].data||[];
  dashboardData.inventory=results[4].data||[];
  dashboardData.services=results[5].data||[];
  dashboardData.incomeTypes=results[6].data||[];

  const incomeTotal=sum(dashboardData.income.map(x=>x.amount));
  const expenseTotal=sum(dashboardData.expenses.map(x=>x.amount));
  const profit=incomeTotal-expenseTotal;
  setText("total-income",formatMoney(incomeTotal));
  setText("total-expenses",formatMoney(expenseTotal));
  setText("net-profit",formatMoney(profit));

  const invoiceCount=dashboardData.orders.length;
  setText("total-invoices",formatMoney(sum(dashboardData.orders.map(x=>x.net_total))));
  const unpaid=dashboardData.orders.filter(x=>Number(x.net_total||0)>Number(x.paid_amount||0)).length;
  setText("invoice-note",`${unpaid} فواتير مستحقة`);
  setText("open-orders",String(dashboardData.orders.length));

  renderSalesChart();
  renderDistribution(incomeTotal);
  renderOrders();
  renderAlerts(unpaid);
  renderQuickStats();
}

function sum(values){return values.reduce((s,v)=>s+Number(v||0),0)}
function setText(id,value){const el=document.getElementById(id);if(el)el.textContent=value}
function formatMoney(value){return Number(value||0).toLocaleString("en-US",{maximumFractionDigits:2})+" د.ع"}
function escapeHtml(v){return String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]))}

function lastSixMonths(){
  const out=[];const now=new Date();
  for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);out.push({year:d.getFullYear(),month:d.getMonth(),label:new Intl.DateTimeFormat("ar-IQ-u-nu-latn",{month:"short"}).format(d)})}
  return out;
}
function totalsByMonth(rows){return lastSixMonths().map(m=>sum(rows.filter(r=>{const d=new Date(r.created_at||r.order_date||"");return d.getFullYear()===m.year&&d.getMonth()===m.month}).map(r=>r.amount??r.net_total)))}

function renderSalesChart(){
  const svg=document.getElementById("sales-chart");if(!svg)return;
  const months=lastSixMonths(), sales=totalsByMonth(dashboardData.income), expenses=totalsByMonth(dashboardData.expenses);
  const profits=sales.map((v,i)=>Math.max(0,v-expenses[i]));
  const all=[...sales,...profits];const max=Math.max(...all,1);const W=760,H=310,left=50,right=12,top=25,bottom=38;const iw=W-left-right,ih=H-top-bottom;
  const x=i=>left+(iw/(months.length-1))*i;const y=v=>top+ih-(v/max)*ih;
  let html="";
  for(let i=0;i<5;i++){const yy=top+(ih/4)*i;const val=max-(max/4)*i;html+=`<line x1="${left}" y1="${yy}" x2="${W-right}" y2="${yy}" class="chart-grid"/><text x="${left-9}" y="${yy+4}" text-anchor="end" class="chart-axis">${compactNumber(val)}</text>`}
  months.forEach((m,i)=>html+=`<line x1="${x(i)}" y1="${top}" x2="${x(i)}" y2="${top+ih}" class="chart-grid"/><text x="${x(i)}" y="${H-10}" text-anchor="middle" class="chart-axis">${escapeHtml(m.label)}</text>`);
  html+=`<polyline points="${sales.map((v,i)=>`${x(i)},${y(v)}`).join(" ")}" class="chart-line-sales"/><polyline points="${profits.map((v,i)=>`${x(i)},${y(v)}`).join(" ")}" class="chart-line-profit"/>`;
  sales.forEach((v,i)=>html+=`<circle cx="${x(i)}" cy="${y(v)}" r="5" class="chart-point-sales"/>`);profits.forEach((v,i)=>html+=`<circle cx="${x(i)}" cy="${y(v)}" r="5" class="chart-point-profit"/>`);
  svg.innerHTML=html;
}
function compactNumber(v){if(v>=1000000)return Math.round(v/1000000)+"م";if(v>=1000)return Math.round(v/1000)+"ك";return Math.round(v).toLocaleString("en-US")}

function renderDistribution(total){
  const legend=document.getElementById("distribution-legend");const donut=document.getElementById("donut-chart");setText("donut-total",compactNumber(total));
  const groups=[];
  if(dashboardData.incomeTypes.length){dashboardData.incomeTypes.forEach(t=>{const amount=sum(dashboardData.income.filter(x=>x.income_type_id===t.id).map(x=>x.amount));if(amount>0)groups.push({name:t.name,amount})})}
  if(!groups.length){groups.push({name:"مطـبوعات تجارية",amount:total*.45},{name:"مطـبوعات تسويقية",amount:total*.25},{name:"تعليمي وعلب",amount:total*.20},{name:"أخرى",amount:total*.10})}
  groups.sort((a,b)=>b.amount-a.amount);const top=groups.slice(0,4), colors=["#118eff","#b23aff","#ff9e24","#10c9df"];const sumTop=sum(top.map(x=>x.amount));
  let cursor=0;const stops=top.map((g,i)=>{const pct=sumTop?g.amount/sumTop*100:25;const s=`${colors[i]} ${cursor}% ${cursor+pct}%`;cursor+=pct;return s}).join(",");if(donut)donut.style.background=`conic-gradient(${stops})`;
  if(legend)legend.innerHTML=top.map((g,i)=>`<div class="dist-row"><i class="dist-dot" style="color:${colors[i]};background:${colors[i]}"></i><span class="dist-name">${escapeHtml(g.name)}</span><span class="dist-pct">${sumTop?Math.round(g.amount/sumTop*100):0}%</span></div>`).join("");
}

function renderOrders(){
  const tbody=document.getElementById("orders-table-body");if(!tbody)return;tbody.innerHTML="";
  if(!dashboardData.orders.length){tbody.innerHTML='<tr><td colspan="7" style="text-align:center;color:#8299bb;padding:25px">لا توجد بيانات حتى الآن</td></tr>';return}
  const statusNames=dashboardData.statuses.reduce((a,s)=>(a[s.id]=s.name,a),{});
  dashboardData.orders.slice(0,6).forEach((r,i)=>{const status=r.order_statuses?.name||statusNames[r.status_id]||"جديد";const cls=/تسليم|جاهز|مكتمل/i.test(status)?"status-ready":/طباع|قيد/i.test(status)?"status-print":/تصميم/i.test(status)?"status-design":"status-new";const progress=/مكتمل|جاهز|تسليم/i.test(status)?100:/طباع|قيد/i.test(status)?65:/تصميم/i.test(status)?30:10;const product=r.services?.name||r.paper_sizes?.name||"مطبوعات";tbody.insertAdjacentHTML("beforeend",`<tr><td>#${escapeHtml(r.order_no)}</td><td>${escapeHtml(r.customer_name)}</td><td>${escapeHtml(product)}</td><td>${Number(r.quantity||0).toLocaleString("en-US")}</td><td>${escapeHtml(r.order_date||"—")}</td><td><span class="status-badge ${cls}">${escapeHtml(status)}</span></td><td><span class="progress"><i style="width:${progress}%"></i></span> ${progress}%</td></tr>`)})
}

function renderAlerts(unpaid){
  const el=document.getElementById("smart-alerts");if(!el)return;
  const low=dashboardData.inventory.filter(x=>Number(x.current_quantity)<=Number(x.minimum_quantity));
  const delayed=dashboardData.orders.filter(x=>/متأخر|تأخير/i.test(x.order_statuses?.name||""));
  const items=[];
  if(unpaid)items.push({cls:"alert-red",icon:"▤",title:"فواتير مستحقة الدفع",text:`${unpaid} فواتير تحتاج متابعة`,href:"pages/income.html",action:"فتح الوارد"});
  if(low.length)items.push({cls:"alert-purple",icon:"▱",title:"مخزون ورق منخفض",text:`${low.length} أصناف تحت الحد الأدنى`,href:"pages/inventory.html",action:"فتح المخزون"});
  if(delayed.length)items.push({cls:"alert-orange",icon:"◷",title:"طلبات متأخرة",text:`${delayed.length} طلبات تحتاج متابعة`,href:"pages/work-orders.html",action:"فتح الطلبات"});
  if(!items.length){
    items.push({cls:"alert-cyan",icon:"✓",title:"كل شيء يسير جيداً",text:"لا توجد تنبيهات حرجة حالياً",href:"pages/reports.html",action:"عرض التقارير"});
  }
  el.innerHTML=items.slice(0,4).map(x=>`<a class="alert-item ${x.cls}" href="${x.href}" aria-label="${escapeHtml(x.title)} - ${escapeHtml(x.action)}"><div class="alert-icon">${x.icon}</div><div class="alert-copy"><strong>${escapeHtml(x.title)}</strong><span>${escapeHtml(x.text)}</span><em>${escapeHtml(x.action)} ←</em></div><span class="alert-arrow" aria-hidden="true">←</span></a>`).join("");
}
function renderQuickStats(){
  const el=document.getElementById("quick-stats");if(!el)return;const customers=new Set(dashboardData.orders.map(x=>x.customer_name).filter(Boolean)).size;const low=dashboardData.inventory.filter(x=>Number(x.current_quantity)<=Number(x.minimum_quantity)).length;const orders=dashboardData.orders.length;
  el.innerHTML=[['quick-blue','♙','العملاء',`+${customers||0}`],['quick-purple','♧','طلبات العمل',`+${orders}`],['quick-cyan','▥','المخزون المنخفض',String(low)],['quick-blue','◉','المنتجات والخدمات',String(dashboardData.services.length||0)]].map(x=>`<div class="quick-item"><div class="quick-icon ${x[0]}">${x[1]}</div><div class="quick-copy"><strong>${x[2]}</strong></div><b class="quick-value">${x[3]}</b></div>`).join("")
}
