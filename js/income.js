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

  const rows = data || [];
  const orderIds = [...new Set(rows.map(row => row.work_order_id).filter(Boolean))];
  let ordersById = {};
  let collectedByOrder = {};

  if (orderIds.length) {
    const { data: orders } = await supabaseClient.from("work_orders").select("id,order_no,customer_name,net_total").in("id", orderIds);
    (orders || []).forEach(order => { ordersById[String(order.id)] = order; });

    const { data: payments } = await supabaseClient.from("work_order_payments").select("work_order_id,amount").in("work_order_id", orderIds);
    (payments || []).forEach(payment => {
      const key = String(payment.work_order_id);
      collectedByOrder[key] = (collectedByOrder[key] || 0) + (Number(payment.amount) || 0);
    });
  }

  rows.forEach(row => {
    const order = row.work_order_id ? ordersById[String(row.work_order_id)] : null;
    let orderDetails = "—";
    if (order) {
      const total = Number(order.net_total) || 0;
      const collected = Number(collectedByOrder[String(order.id)] || 0);
      const remaining = Math.max(0, total - collected);
      orderDetails =
        "طلب #" + String(order.order_no ?? "") +
        " | " + (order.customer_name || "غير محدد") +
        " | إجمالي الطلب: " + formatMoney(total) +
        " | المحصل حتى الآن: " + formatMoney(collected) +
        " | المتبقي: " + formatMoney(remaining);
    }
    const actions = '<button data-id="' + row.id + '" class="delete-income-btn">حذف</button>';
    tbody.appendChild(buildSafeRow(
      [row.income_date, formatMoney(row.amount), row.income_types?.name || "", row.received_from, orderDetails],
      actions
    ));
  });

  tbody.querySelectorAll(".delete-income-btn").forEach(btn => btn.addEventListener("click", async () => {
    if (!confirm("تأكيد حذف الوارد؟")) return;
    const id = btn.dataset.id;
    const { error } = await supabaseClient.from("income").delete().eq("id", id);
    if (!error) { await logActivity("delete", "income", id); await loadIncome(); }
    else alert("تعذّر الحذف: " + error.message);
  }));
}
