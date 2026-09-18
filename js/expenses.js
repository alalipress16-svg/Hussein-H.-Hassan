document.addEventListener("DOMContentLoaded", async () => {
  renderPageHeader("المصروف");
  const session = await checkAuth();
  if (!session) return;
  await loadExpenseTypes();
  await loadExpenses();
  document.getElementById("expenses-form").addEventListener("submit", saveExpense);
});

async function loadExpenseTypes() {
  const select = document.getElementById("expense-type");
  if (!select) return;
  const { data, error } = await supabaseClient.from("expense_types").select("id,name").eq("is_active", true).order("name");
  if (error) return;
  select.innerHTML = '<option value="">اختر النوع</option>';
  (data || []).forEach(x => select.add(new Option(x.name, x.id)));
}

async function saveExpense(e) {
  e.preventDefault();
  const form = e.currentTarget; clearFormError(form);
  const expense_date = document.getElementById("f-date").value;
  const amount = parseNumberOrNull(document.getElementById("f-amount").value);
  const paid_to = parseTextOrNull(document.getElementById("f-paid_to").value);
  const expense_type_id = parseTextOrNull(document.getElementById("expense-type").value);
  const voucher_no = parseTextOrNull(document.getElementById("f-voucher").value);
  if (!expense_date || amount === null || Number.isNaN(amount)) return showFormError(form, "أدخل التاريخ والمبلغ بشكل صحيح");
  if (amount < 0) return showFormError(form, "المبلغ لا يمكن أن يكون سالبًا");
  const record = { expense_date, amount, paid_to: paid_to || "غير محدد", expense_type_id, voucher_no };
  const { data, error } = await supabaseClient.from("expenses").insert(record).select().single();
  if (error) return showFormError(form, "تعذّر حفظ المصروف: " + error.message);
  await logActivity("insert", "expenses", data.id, record);
  form.reset(); await loadExpenses();
}

async function loadExpenses() {
  const { data, error } = await supabaseClient.from("expenses").select("*, expense_types(name)").order("expense_date", { ascending: false });
  const tbody = document.getElementById("expenses-table-body"); tbody.innerHTML = "";
  if (error) return tbody.appendChild(buildSafeRow(["تعذّر تحميل البيانات: " + error.message]));
  (data || []).forEach(row => {
    const actions = `<button data-id="${row.id}" class="delete-expenses-btn">حذف</button>`;
    tbody.appendChild(buildSafeRow([row.expense_date, formatMoney(row.amount), row.expense_types?.name || "", row.paid_to], actions));
  });
  tbody.querySelectorAll(".delete-expenses-btn").forEach(btn => btn.addEventListener("click", async () => {
    if (!confirm("تأكيد حذف المصروف؟")) return;
    const id = btn.dataset.id;
    const { error } = await supabaseClient.from("expenses").delete().eq("id", id);
    if (!error) { await logActivity("delete", "expenses", id); await loadExpenses(); } else alert("تعذّر الحذف: " + error.message);
  }));
}
