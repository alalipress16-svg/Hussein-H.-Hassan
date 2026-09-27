let customersRows = [];
let selectedCustomerKey = null;

function customerKey(row) {
  const phone = String(row.customer_phone || "").trim();
  const name = String(row.customer_name || "").trim().toLowerCase();
  return phone ? `phone:${phone}` : `name:${name}`;
}

function customerName(row) {
  return String(row.customer_name || "غير محدد").trim() || "غير محدد";
}

function money(value) {
  return formatMoney(Math.max(0, Number(value) || 0));
}

function buildCustomers(rows) {
  const map = new Map();

  (rows || []).forEach(order => {
    const key = customerKey(order);
    if (!map.has(key)) {
      map.set(key, {
        key,
        name: customerName(order),
        phone: String(order.customer_phone || "").trim(),
        orders: [],
        total: 0,
        paid: 0,
        remaining: 0
      });
    }

    const c = map.get(key);
    c.orders.push(order);
    c.total += Math.max(0, Number(order.net_total) || 0);
    c.paid += Math.max(0, Number(order.paid_amount) || 0);
    c.remaining = Math.max(0, c.total - c.paid);
    if (!c.phone && order.customer_phone) c.phone = String(order.customer_phone).trim();
  });

  return [...map.values()].sort((a, b) => {
    if (b.remaining !== a.remaining) return b.remaining - a.remaining;
    return a.name.localeCompare(b.name, "ar");
  });
}

function customerMatches(c, search) {
  if (!search) return true;
  return c.name.toLowerCase().includes(search) || c.phone.toLowerCase().includes(search);
}

function renderAlert(customers) {
  const box = document.getElementById("customer-alert");
  if (!box) return;

  const debtors = customers.filter(c => c.remaining > 0.009);
  if (!debtors.length) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }

  const totalOutstanding = debtors.reduce((sum, c) => sum + c.remaining, 0);

  box.hidden = false;
  box.innerHTML = `
    <div><strong>تنبيه المبالغ غير المسددة</strong><span>${debtors.length} عميل</span></div>
    <div>إجمالي المبالغ المتبقية: <b>${money(totalOutstanding)}</b></div>
    <div class="customer-types">يمكن فتح ملف أي عميل لمعرفة الطلبات والمبلغ المتبقي لكل طلب.</div>
  `;
}

function renderCustomers(customers) {
  const tbody = document.getElementById("customers-table-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!customers.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="8">لا توجد نتائج.</td>`;
    tbody.appendChild(tr);
    return;
  }

  customers.forEach(c => {
    const tr = document.createElement("tr");
    const status = c.remaining > 0.009 ? "يوجد مبلغ متبقي" : "مسدد بالكامل";
    const statusClass = c.remaining > 0.009 ? "status-new" : "status-ready";

    tr.innerHTML = `
      <td><strong>${escapeHtml(c.name)}</strong></td>
      <td>${c.phone ? `<a class="phone-link" href="tel:${escapeHtml(c.phone)}">${escapeHtml(c.phone)}</a>` : "—"}</td>
      <td>${c.orders.length}</td>
      <td>${money(c.total)}</td>
      <td>${money(c.paid)}</td>
      <td>${money(c.remaining)}</td>
      <td><span class="status-badge ${statusClass}">${status}</span></td>
      <td><button type="button" class="secondary-action customer-view-btn" data-key="${escapeHtml(c.key)}">عرض الملف</button></td>
    `;

    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".customer-view-btn").forEach(btn => {
    btn.addEventListener("click", () => showCustomerProfile(btn.dataset.key));
  });
}

function orderStatus(order) {
  return order.order_statuses?.name || "جديد";
}

function orderItemsText(order) {
  try {
    const parsed = JSON.parse(order.notes || "");
    if (parsed && Array.isArray(parsed.items)) {
      return parsed.items.map(x => {
        const type = x.work_type || "عمل";
        const qty = x.quantity ? ` × ${x.quantity}` : "";
        return `${type}${qty}`;
      }).join("، ");
    }
  } catch (_) {}
  return "—";
}

function showCustomerProfile(key) {
  const customer = customersRows.find(c => c.key === key);
  const box = document.getElementById("customer-profile");
  if (!customer || !box) return;

  selectedCustomerKey = key;
  box.hidden = false;

  const orderRows = [...customer.orders]
    .sort((a, b) => Number(b.order_no || 0) - Number(a.order_no || 0))
    .map(order => {
      const remaining = Math.max(0, Number(order.net_total || 0) - Number(order.paid_amount || 0));
      const debt = remaining > 0.009;
      return `
        <tr>
          <td>#${escapeHtml(order.order_no)}</td>
          <td>${escapeHtml(order.order_date || "—")}</td>
          <td>${escapeHtml(orderStatus(order))}</td>
          <td>${escapeHtml(orderItemsText(order))}</td>
          <td>${money(order.net_total)}</td>
          <td>${money(order.paid_amount)}</td>
          <td>${money(remaining)}</td>
          <td>${debt ? '<span class="status-badge status-new">غير مسدد</span>' : '<span class="status-badge status-ready">مسدد</span>'}</td>
        </tr>
      `;
    }).join("");

  box.innerHTML = `
    <div>
      <strong>ملف العميل: ${escapeHtml(customer.name)}</strong>
      <span>${customer.orders.length} طلب</span>
    </div>
    <div>الهاتف: <b>${customer.phone ? escapeHtml(customer.phone) : "—"}</b></div>
    <div>إجمالي الطلبات: <b>${money(customer.total)}</b></div>
    <div>إجمالي المدفوع: <b>${money(customer.paid)}</b></div>
    <div>إجمالي المتبقي: <b>${money(customer.remaining)}</b></div>
    <div class="table-wrap">
      <table class="work-orders-table">
        <thead><tr><th>الطلب</th><th>التاريخ</th><th>الحالة</th><th>الأعمال</th><th>الكلي</th><th>المدفوع</th><th>المتبقي</th><th>السداد</th></tr></thead>
        <tbody>${orderRows}</tbody>
      </table>
    </div>
  `;
}

async function loadCustomers() {
  const { data, error } = await supabaseClient
    .from("work_orders")
    .select("*, order_statuses(name)")
    .order("order_no", { ascending: false });

  const tbody = document.getElementById("customers-table-body");
  if (error) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="8">تعذّر تحميل العملاء: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  customersRows = buildCustomers(data || []);
  const search = String(document.getElementById("customers-search")?.value || "").trim().toLowerCase();
  const filtered = customersRows.filter(c => customerMatches(c, search));

  renderAlert(customersRows);
  renderCustomers(filtered);

  if (selectedCustomerKey && filtered.some(c => c.key === selectedCustomerKey)) {
    showCustomerProfile(selectedCustomerKey);
  } else if (!selectedCustomerKey) {
    const profile = document.getElementById("customer-profile");
    if (profile) {
      profile.hidden = true;
      profile.innerHTML = "";
    }
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  renderPageHeader("العملاء");

  const session = await checkAuth();
  if (!session) return;

  document.getElementById("customers-search")?.addEventListener("input", loadCustomers);
  await loadCustomers();
});
