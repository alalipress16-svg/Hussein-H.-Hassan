document.addEventListener("DOMContentLoaded", async () => {
  renderPageHeader("الوارد");
  const session = await checkAuth();
  if (!session) return;
  await loadIncomeTypes();
  await loadIncome();
  document.getElementById("income-form").addEventListener("submit", saveIncome);
});

async function loadIncomeTypes() {
  const select = document.getElementById("income-type");
  if (!select) return;
  const { data, error } = await supabaseClient.from("income_types").select("id,name").eq("is_active", true).order("name");
  if (error) return;
  select.innerHTML = '<option value="">اختر النوع</option>';
  (data || []).forEach(x => select.add(new Option(x.name, x.id)));
}

async function saveIncome(e) {
  e.preventDefault();
  const form = e.currentTarget; clearFormError(form);
  const income_date = document.getElementById("income-date").value;
  const amount = parseNumberOrNull(document.getElementById("income-amount").value);
  const received_from = parseTextOrNull(document.getElementById("income-source").value);
  const income_type_id = parseTextOrNull(document.getElementById("income-type").value);
  const voucher_no = parseTextOrNull(document.getElementById("income-voucher").value);
  if (!income_date || amount === null || Number.isNaN(amount)) return showFormError(form, "أدخل التاريخ والمبلغ بشكل صحيح");
  if (amount < 0) return showFormError(form, "المبلغ لا يمكن أن يكون سالبًا");
  const record = { income_date, amount, received_from: received_from || "غير محدد", income_type_id, voucher_no };
  const { data, error } = await supabaseClient.from("income").insert(record).select().single();
  if (error) return showFormError(form, "تعذّر حفظ الوارد: " + error.message);
  await logActivity("insert", "income", data.id, record);
  form.reset();
  await loadIncome();
}

async function loadIncome() {
  const { data, error } = await supabaseClient.from("income").select("*, income_types(name)").order("income_date", { ascending: false });
  const tbody = document.getElementById("income-table-body"); tbody.innerHTML = "";
  if (error) return tbody.appendChild(buildSafeRow(["تعذّر تحميل البيانات: " + error.message]));
  (data || []).forEach(row => {
    const actions = `<button data-id="${row.id}" class="delete-income-btn">حذف</button>`;
    tbody.appendChild(buildSafeRow([row.income_date, formatMoney(row.amount), row.income_types?.name || "", row.received_from], actions));
  });
  tbody.querySelectorAll(".delete-income-btn").forEach(btn => btn.addEventListener("click", async () => {
    if (!confirm("تأكيد حذف الوارد؟")) return;
    const id = btn.dataset.id;
    const { error } = await supabaseClient.from("income").delete().eq("id", id);
    if (!error) { await logActivity("delete", "income", id); await loadIncome(); }
    else alert("تعذّر الحذف: " + error.message);
  }));
}
