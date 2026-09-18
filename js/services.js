document.addEventListener("DOMContentLoaded", async () => {
  renderPageHeader("الخدمات والأسعار");
  const session = await checkAuth();
  if (!session) return;
  await Promise.all([loadPaperSizes(), loadPrintTypes(), loadServices()]);
  document.getElementById("services-form").addEventListener("submit", saveService);
});

async function loadPaperSizes() {
  const s = document.getElementById("f-paper_size_id"); if (!s) return;
  const { data } = await supabaseClient.from("paper_sizes").select("id,name").eq("is_active", true).order("name");
  s.innerHTML = '<option value="">حجم الورق</option>';
  (data || []).forEach(x => s.add(new Option(x.name, x.id)));
}
async function loadPrintTypes() {
  const s = document.getElementById("f-print_type_id"); if (!s) return;
  const { data } = await supabaseClient.from("print_types").select("id,name").eq("is_active", true).order("name");
  s.innerHTML = '<option value="">نوع الطباعة</option>';
  (data || []).forEach(x => s.add(new Option(x.name, x.id)));
}
async function saveService(e) {
  e.preventDefault(); const form = e.currentTarget; clearFormError(form);
  const name = parseTextOrNull(document.getElementById("f-name").value);
  const paper_size_id = parseTextOrNull(document.getElementById("f-paper_size_id").value);
  const print_type_id = parseTextOrNull(document.getElementById("f-print_type_id").value);
  const min_quantity = parseNumberOrNull(document.getElementById("f-min_quantity").value);
  const retail_price = parseNumberOrNull(document.getElementById("f-retail_price").value);
  const wholesale_price = parseNumberOrNull(document.getElementById("f-wholesale_price").value);
  const notes = parseTextOrNull(document.getElementById("f-notes").value);
  if (!name) return showFormError(form, "الرجاء إدخال اسم الخدمة");
  if ([min_quantity, retail_price, wholesale_price].some(Number.isNaN)) return showFormError(form, "تحقق من الأسعار والكميات");
  const record = { name, paper_size_id, print_type_id, min_quantity, retail_price: retail_price ?? 0, wholesale_price: wholesale_price ?? 0, notes };
  const { data, error } = await supabaseClient.from("services").insert(record).select().single();
  if (error) return showFormError(form, "تعذّر حفظ الخدمة: " + error.message);
  await logActivity("insert", "services", data.id, record); form.reset(); await loadServices();
}
async function loadServices() {
  const { data, error } = await supabaseClient.from("services").select("*, paper_sizes(name), print_types(name)").order("created_at", { ascending: false });
  const tbody = document.getElementById("services-table-body"); tbody.innerHTML = "";
  if (error) return tbody.appendChild(buildSafeRow(["تعذّر تحميل البيانات: " + error.message]));
  (data || []).forEach(row => {
    const actions = `<button data-id="${row.id}" class="delete-services-btn">حذف</button>`;
    tbody.appendChild(buildSafeRow([row.name, row.paper_sizes?.name || "", row.print_types?.name || "", row.min_quantity ?? "", formatMoney(row.retail_price), formatMoney(row.wholesale_price), row.notes || ""], actions));
  });
  tbody.querySelectorAll(".delete-services-btn").forEach(btn => btn.addEventListener("click", async () => {
    if (!confirm("تأكيد حذف الخدمة؟")) return;
    const id = btn.dataset.id; const { error } = await supabaseClient.from("services").delete().eq("id", id);
    if (!error) { await logActivity("delete", "services", id); await loadServices(); } else alert("تعذّر الحذف: " + error.message);
  }));
}
