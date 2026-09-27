document.addEventListener("DOMContentLoaded", async () => {
  renderPageHeader("المصروف");
  const session = await checkAuth();
  if (!session) return;

  await loadExpenseTypes();
  await processAutomaticRecurringExpenses();
  await loadExpenses();
  await loadRecurringExpenses();

  const form = document.getElementById("expenses-form");
  if (form) form.addEventListener("submit", saveExpense);

  const recurringForm = document.getElementById("recurring-expense-form");
  if (recurringForm) {
    recurringForm.addEventListener("submit", saveRecurringExpense);
    updateRecurringScheduleFields();
  }

  const frequency = document.getElementById("recurring-frequency");
  if (frequency) frequency.addEventListener("change", updateRecurringScheduleFields);
});

async function loadExpenseTypes() {
  const select = document.getElementById("expense-type");
  if (!select) return;
  const { data, error } = await supabaseClient.from("expense_types").select("id,name").eq("is_active", true).order("name");
  if (error) return;
  select.innerHTML = '<option value="">اختر النوع</option>';
  (data || []).forEach(x => select.add(new Option(x.name, x.id)));
  const recurringSelect = document.getElementById("recurring-expense-type");
  if (recurringSelect) {
    recurringSelect.innerHTML = '<option value="">اختر النوع</option>';
    (data || []).forEach(x => recurringSelect.add(new Option(x.name, x.id)));
  }
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
  form.reset();
  await loadExpenses();
}

async function loadExpenses() {
  const { data, error } = await supabaseClient.from("expenses").select("*, expense_types(name)").order("expense_date", { ascending: false });
  const tbody = document.getElementById("expenses-table-body"); tbody.innerHTML = "";
  if (error) return tbody.appendChild(buildSafeRow(["تعذّر تحميل البيانات: " + error.message]));
  (data || []).forEach(row => {
    const recurring = row.recurring_expense_id ? "متكرر" : "";
    const actions = `<button data-id="${row.id}" class="delete-expenses-btn">حذف</button>`;
    tbody.appendChild(buildSafeRow([row.expense_date, formatMoney(row.amount), row.expense_types?.name || "", row.paid_to, recurring], actions));
  });
  tbody.querySelectorAll(".delete-expenses-btn").forEach(btn => btn.addEventListener("click", async () => {
    if (!confirm("تأكيد حذف المصروف؟")) return;
    const id = btn.dataset.id;
    const { error } = await supabaseClient.from("expenses").delete().eq("id", id);
    if (!error) { await logActivity("delete", "expenses", id); await loadExpenses(); }
    else alert("تعذّر الحذف: " + error.message);
  }));
}

async function processAutomaticRecurringExpenses() {
  const { error } = await supabaseClient.rpc("process_recurring_expenses");
  if (error) console.warn("تعذّر معالجة المصروفات المتكررة تلقائيًا:", error.message);
}

function updateRecurringScheduleFields() {
  const frequency = document.getElementById("recurring-frequency")?.value;
  const weeklyWrap = document.getElementById("recurring-weekly-wrap");
  const monthlyWrap = document.getElementById("recurring-monthly-wrap");
  if (weeklyWrap) weeklyWrap.style.display = frequency === "weekly" ? "block" : "none";
  if (monthlyWrap) monthlyWrap.style.display = frequency === "monthly" ? "block" : "none";
}

async function saveRecurringExpense(e) {
  e.preventDefault();
  const form = e.currentTarget;
  clearFormError(form);

  const name = parseTextOrNull(document.getElementById("recurring-name").value);
  const amountRaw = document.getElementById("recurring-amount").value.trim();
  const amount = amountRaw === "" ? null : parseNumberOrNull(amountRaw);
  const expense_type_id = parseTextOrNull(document.getElementById("recurring-expense-type").value);
  const paid_to = parseTextOrNull(document.getElementById("recurring-paid-to").value);
  const frequency = document.getElementById("recurring-frequency").value;
  const execution_mode = document.getElementById("recurring-execution").value;
  const start_date = document.getElementById("recurring-start-date").value;
  const weekly_day = frequency === "weekly" ? Number(document.getElementById("recurring-weekly-day").value) : null;
  const monthly_day = frequency === "monthly" ? Number(document.getElementById("recurring-monthly-day").value) : null;
  const notes = parseTextOrNull(document.getElementById("recurring-notes").value);

  if (!name || !frequency || !execution_mode || !start_date) {
    return showFormError(form, "أكمل بيانات المصروف المتكرر");
  }
  if (execution_mode === "automatic" && (amount === null || Number.isNaN(amount) || amount <= 0)) {
    return showFormError(form, "المصروف التلقائي يحتاج إلى مبلغ أكبر من صفر");
  }
  if (amount !== null && (Number.isNaN(amount) || amount < 0)) {
    return showFormError(form, "المبلغ غير صحيح");
  }

  const record = {
    name,
    amount,
    expense_type_id,
    paid_to: paid_to || name,
    frequency,
    execution_mode,
    start_date,
    weekly_day,
    monthly_day,
    is_active: true,
    notes
  };

  const { data, error } = await supabaseClient.from("recurring_expenses").insert(record).select().single();
  if (error) return showFormError(form, "تعذّر حفظ المصروف المتكرر: " + error.message);

  await logActivity("insert", "recurring_expenses", data.id, record);
  form.reset();
  document.getElementById("recurring-start-date").value = new Date().toISOString().slice(0, 10);
  updateRecurringScheduleFields();
  await processAutomaticRecurringExpenses();
  await loadExpenses();
  await loadRecurringExpenses();
}

async function loadRecurringExpenses() {
  const tbody = document.getElementById("recurring-expenses-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  const { data, error } = await supabaseClient
    .from("recurring_expenses")
    .select("*, expense_types(name)")
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    tbody.appendChild(buildSafeRow(["تعذّر تحميل المصروفات المتكررة: " + error.message]));
    return;
  }

  const rows = data || [];
  if (!rows.length) {
    tbody.appendChild(buildSafeRow(["لا توجد مصروفات متكررة مضافة حتى الآن"]));
    return;
  }

  rows.forEach(row => {
    const due = getRecurringDueState(row);
    const schedule = formatRecurringSchedule(row);
    const mode = row.execution_mode === "automatic" ? "تلقائي" : "تذكير فقط";
    const state = row.is_active ? (due.due ? due.label : "فعال") : "متوقف";
    const actions =
      `<button data-id="${row.id}" class="toggle-recurring-btn">${row.is_active ? "إيقاف" : "تفعيل"}</button>` +
      (row.execution_mode === "reminder" && row.is_active && due.due
        ? ` <button data-id="${row.id}" class="record-recurring-btn">تسجيل اليوم</button>`
        : "") +
      ` <button data-id="${row.id}" class="delete-recurring-btn">حذف</button>`;

    tbody.appendChild(buildSafeRow([
      row.name,
      row.amount == null ? "حسب الفعلي" : formatMoney(row.amount),
      row.expense_types?.name || "",
      schedule,
      mode,
      state
    ], actions));
  });

  tbody.querySelectorAll(".toggle-recurring-btn").forEach(btn => btn.addEventListener("click", () => toggleRecurringExpense(btn.dataset.id)));
  tbody.querySelectorAll(".record-recurring-btn").forEach(btn => btn.addEventListener("click", () => recordReminderExpense(btn.dataset.id)));
  tbody.querySelectorAll(".delete-recurring-btn").forEach(btn => btn.addEventListener("click", () => deleteRecurringExpense(btn.dataset.id)));
}

function getRecurringDueState(row) {
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const start = String(row.start_date || "").slice(0, 10);
  if (!start || start > todayKey) return { due: false, label: "لم يبدأ" };

  if (row.frequency === "daily") return { due: true, label: "مستحق اليوم" };

  if (row.frequency === "weekly") {
    const day = today.getDay();
    if (day === Number(row.weekly_day)) return { due: true, label: "مستحق اليوم" };
    return { due: false, label: "فعال" };
  }

  if (row.frequency === "monthly") {
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const dueDay = Math.min(Number(row.monthly_day) || 1, lastDay);
    if (today.getDate() === dueDay) return { due: true, label: "مستحق اليوم" };
    return { due: false, label: "فعال" };
  }

  return { due: false, label: "فعال" };
}

function formatRecurringSchedule(row) {
  if (row.frequency === "daily") return "يومي";
  if (row.frequency === "weekly") {
    const names = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    return "أسبوعي - " + (names[Number(row.weekly_day)] || "");
  }
  return "شهري - يوم " + String(row.monthly_day || 1);
}

async function toggleRecurringExpense(id) {
  const row = await getRecurringExpense(id);
  if (!row) return;
  const next = !row.is_active;
  const { error } = await supabaseClient.from("recurring_expenses").update({ is_active: next, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return alert("تعذّر تغيير حالة المصروف المتكرر: " + error.message);
  await logActivity("update", "recurring_expenses", id, { is_active: next });
  await loadRecurringExpenses();
}

async function deleteRecurringExpense(id) {
  if (!confirm("حذف المصروف المتكرر؟ السجلات التي تم إنشاؤها منه لن تُحذف.")) return;
  const { error } = await supabaseClient.from("recurring_expenses").delete().eq("id", id);
  if (error) return alert("تعذّر حذف المصروف المتكرر: " + error.message);
  await logActivity("delete", "recurring_expenses", id);
  await loadRecurringExpenses();
}

async function getRecurringExpense(id) {
  const { data, error } = await supabaseClient.from("recurring_expenses").select("*").eq("id", id).maybeSingle();
  if (error) {
    alert("تعذّر تحميل المصروف المتكرر: " + error.message);
    return null;
  }
  return data;
}

async function recordReminderExpense(id) {
  const row = await getRecurringExpense(id);
  if (!row) return;

  const todayKey = new Date().toISOString().slice(0, 10);
  const amount = row.amount == null
    ? parseNumberOrNull(prompt("أدخل المبلغ الفعلي لهذا المصروف:") || "")
    : Number(row.amount);

  if (amount === null || !Number.isFinite(amount) || amount <= 0) {
    alert("المبلغ غير صحيح.");
    return;
  }

  const { data: existing } = await supabaseClient
    .from("expenses")
    .select("id")
    .eq("recurring_expense_id", id)
    .eq("recurring_due_date", todayKey)
    .maybeSingle();

  if (existing) {
    alert("تم تسجيل هذا الاستحقاق مسبقًا.");
    return;
  }

  const record = {
    expense_date: todayKey,
    amount,
    paid_to: row.paid_to || row.name,
    expense_type_id: row.expense_type_id,
    voucher_no: "متكرر: " + row.name,
    statement: row.name,
    notes: row.notes,
    recurring_expense_id: row.id,
    recurring_due_date: todayKey
  };

  const { data, error } = await supabaseClient.from("expenses").insert(record).select().single();
  if (error) return alert("تعذّر تسجيل المصروف: " + error.message);

  await logActivity("insert", "expenses", data.id, record);
  await loadExpenses();
  await loadRecurringExpenses();
}
