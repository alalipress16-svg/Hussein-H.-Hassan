document.addEventListener("DOMContentLoaded",async()=>{renderPageHeader("الإعدادات");const session=await checkAuth();if(!session)return;await loadSettings();document.getElementById("settings-form").addEventListener("submit",saveSettings);});
async function loadSettings(){const {data,error}=await supabaseClient.from("settings").select("*").limit(1).maybeSingle();const form=document.getElementById("settings-form");if(error)return showFormError(form,"تعذّر تحميل الإعدادات: "+error.message);if(!data)return;["app_name","manager_name","manager_phone","slogan","currency","company_name","company_phone","company_address","report_header","report_footer","font_size"].forEach(k=>{const el=document.getElementById("f-"+k);if(el)el.value=data[k]??"";});const dark=document.getElementById("f-dark_mode");if(dark)dark.checked=!!data.dark_mode;
  ["manager_name","manager_phone"].forEach(k=>{const el=document.getElementById("f-"+k);if(el){el.readOnly=true;el.disabled=true;el.title="بيانات مدير البرنامج ثابتة ولا يمكن تغييرها";}});}
async function saveSettings(e){e.preventDefault();const form=e.currentTarget;clearFormError(form);const {data:existing,error:readError}=await supabaseClient.from("settings").select("id").limit(1).maybeSingle();if(readError)return showFormError(form,readError.message);if(!existing)return showFormError(form,"لم يتم العثور على سجل الإعدادات");const patch={};["app_name","manager_name","manager_phone","slogan","currency","company_name","company_phone","company_address","report_header","report_footer","font_size"].forEach(k=>{const el=document.getElementById("f-"+k);if(el)patch[k]=parseTextOrNull(el.value);});patch.dark_mode=!!document.getElementById("f-dark_mode")?.checked;const {error}=await supabaseClient.from("settings").update(patch).eq("id",existing.id);if(error)return showFormError(form,"تعذّر حفظ الإعدادات: "+error.message);await logActivity("update","settings",existing.id,patch);alert("تم حفظ الإعدادات");}

document.addEventListener('DOMContentLoaded',()=>{document.getElementById('backup-btn')?.addEventListener('click',downloadBackup);});
async function downloadBackup(){
  const tables=['settings','income','expenses','work_orders','work_order_payments','services','paper_sizes','print_types','inventory_items','inventory_movements','order_statuses','income_types','expense_types'];
  const backup={exported_at:new Date().toISOString(),application:'برنامج المحاسبة للمطابع',data:{}};
  for(const table of tables){
    const {data,error}=await supabaseClient.from(table).select('*');
    if(error){alert('تعذّر إنشاء النسخة الاحتياطية عند قراءة '+table+': '+error.message);return;}
    backup.data[table]=data||[];
  }
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`backup-printing-accounting-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);alert('تم إنشاء النسخة الاحتياطية بنجاح.');
}
