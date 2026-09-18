// =====================================================================
// برنامج المحاسبة للمطابع — المنطق العام
// تسجيل الدخول: جلسة Supabase Anonymous + رمز سري يتحقق منه RPC.
// =====================================================================

function bindMenuToggle() {
  const menuToggle = document.getElementById("menu-toggle");
  const sidebar = document.getElementById("sidebar");
  if (!menuToggle || !sidebar || menuToggle.dataset.bound === "true") return;
  menuToggle.dataset.bound = "true";
  menuToggle.addEventListener("click", () => sidebar.classList.toggle("open"));
  sidebar.querySelectorAll("nav a").forEach(link => {
    link.addEventListener("click", () => sidebar.classList.remove("open"));
  });
}

document.addEventListener("DOMContentLoaded", bindMenuToggle);

let authPromise = null;

async function ensureAnonymousSession() {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw error;
  if (data.session) return data.session;
  if (!authPromise) {
    authPromise = supabaseClient.auth.signInAnonymously().then(({ data: signInData, error: signInError }) => {
      if (signInError) throw signInError;
      return signInData.session;
    }).finally(() => { authPromise = null; });
  }
  return authPromise;
}

async function isVerifiedSession() {
  const { data, error } = await supabaseClient.rpc("is_verified");
  if (error) return false;
  return data === true;
}

async function checkAuth() {
  const authStatusEl = document.getElementById("auth-status");
  const loginBox = document.getElementById("login-box");
  const dashboard = document.getElementById("dashboard-summary");
  const logoutBtn = document.getElementById("logout-btn");

  try {
    const session = await ensureAnonymousSession();
    const verified = await isVerifiedSession();

    if (!verified) {
      if (authStatusEl) authStatusEl.textContent = "بانتظار رمز الدخول";
      if (loginBox) loginBox.style.display = "block";
      if (dashboard) dashboard.style.display = "none";
      if (logoutBtn) logoutBtn.style.display = "none";
      return null;
    }

    if (authStatusEl) authStatusEl.textContent = "تم تسجيل الدخول";
    if (loginBox) loginBox.style.display = "none";
    if (dashboard) dashboard.style.display = "grid";
    if (logoutBtn) logoutBtn.style.display = "inline-block";
    return session;
  } catch (error) {
    if (authStatusEl) authStatusEl.textContent = "تعذر الاتصال بالخادم";
    if (loginBox) loginBox.style.display = "block";
    const errorEl = document.getElementById("login-error");
    if (errorEl) errorEl.textContent = "تعذّر إنشاء جلسة الدخول. فعّل Anonymous Sign-Ins في مشروع Supabase الصحيح.";
    return null;
  }
}

async function submitAccessCode(code) {
  const clean = (code || "").trim();
  if (!clean) return { ok: false, message: "الرجاء إدخال الرمز السري" };
  try {
    await ensureAnonymousSession();
    const { data, error } = await supabaseClient.rpc("verify_access_code", { input_code: clean });
    if (error) return { ok: false, message: error.message || "تعذر التحقق من الرمز" };
    if (data === true) return { ok: true };
    return { ok: false, message: "الرمز السري غير صحيح أو تم إيقاف المحاولات مؤقتًا" };
  } catch (error) {
    return { ok: false, message: "تعذّر إنشاء جلسة الدخول. تأكد من تفعيل Anonymous Sign-Ins في Supabase." };
  }
}

async function logoutUser() {
  await supabaseClient.auth.signOut();
  const isSubPage = window.location.pathname.includes("/pages/");
  window.location.href = isSubPage ? "../index.html" : "index.html";
}

document.addEventListener("DOMContentLoaded", () => {
  // فحص الجلسة عند فتح الصفحة. كان هذا الاستدعاء مفقودًا،
  // لذلك بعد نجاح التحقق كانت الصفحة تعود دون إظهار لوحة التحكم.
  checkAuth();

  const loginBtn = document.getElementById("login-btn");
  if (!loginBtn) return;

  loginBtn.addEventListener("click", async () => {
    const codeEl = document.getElementById("login-code");
    const errorEl = document.getElementById("login-error");

    if (errorEl) errorEl.textContent = "";
    loginBtn.disabled = true;
    loginBtn.textContent = "جارٍ التحقق...";

    try {
      const result = await submitAccessCode(codeEl?.value || "");

      if (!result.ok) {
        if (errorEl) errorEl.textContent = result.message;
        return;
      }

     // لا نعيد تحميل الصفحة؛ نفتح لوحة التحكم ونحمّل بياناتها مباشرة.
const session = await checkAuth();

if (session) {
  // عند الدخول من دون إعادة تحميل الصفحة يكون مستمع dashboard.js
  // قد انتهى بالفعل قبل نجاح التحقق؛ لذلك نفتح المحتوى ونحمّل البيانات هنا.
  if (typeof showDashboard === "function") showDashboard();
  if (typeof updateClock === "function") updateClock();

  if (typeof loadDashboardSummary === "function") {
    await loadDashboardSummary();
  }
} else {
  if (errorEl) {
    errorEl.textContent = "تم قبول الرمز لكن تعذر فتح لوحة التحكم. أعد المحاولة.";
  }
}
    } catch (error) {
      if (errorEl) {
        errorEl.textContent = "حدث خطأ غير متوقع أثناء تسجيل الدخول.";
      }
      console.error("Login error:", error);
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = "دخول";
    }
  });
});

async function logActivity(action, tableName, recordId, details = {}) {
  try {
    await supabaseClient.from("audit_logs").insert({
      action,
      table_name: tableName,
      record_id: recordId || null,
      actor_name: "مستخدم البرنامج",
      new_data: details
    });
  } catch (_) {}
}

function parseTextOrNull(value) {
  const trimmed = (value ?? "").toString().trim();
  return trimmed === "" ? null : trimmed;
}

function parseNumberOrNull(value) {
  const trimmed = (value ?? "").toString().trim();
  if (trimmed === "") return null;
  const num = Number(trimmed);
  return Number.isNaN(num) ? NaN : num;
}

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
function isValidUuidOrEmpty(value) {
  const trimmed = (value ?? "").toString().trim();
  return trimmed === "" || UUID_REGEX.test(trimmed);
}

function showFormError(formEl, message) {
  if (!formEl) return;
  let errorEl = formEl.querySelector(".form-error-text");
  if (!errorEl) {
    errorEl = document.createElement("p");
    errorEl.className = "form-error-text error-text";
    formEl.appendChild(errorEl);
  }
  errorEl.textContent = message;
}

function clearFormError(formEl) {
  const errorEl = formEl?.querySelector(".form-error-text");
  if (errorEl) errorEl.textContent = "";
}

function buildSafeRow(cellValues, actionsHtml) {
  const tr = document.createElement("tr");
  cellValues.forEach(val => {
    const td = document.createElement("td");
    td.textContent = val == null ? "" : String(val);
    tr.appendChild(td);
  });
  if (actionsHtml !== undefined) {
    const td = document.createElement("td");
    td.innerHTML = actionsHtml;
    tr.appendChild(td);
  }
  return tr;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-US") + " د.ع";
}

function escapeHtml(value){return String(value??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));}
