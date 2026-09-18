// =====================================================================
// دالة مساعدة تبني رأس صفحة موحّد + رابط رجوع للرئيسية وزر خروج
// تُستدعى من كل صفحة داخل pages/ لتوليد شريط علوي متطابق
// =====================================================================

function renderPageHeader(title) {
  const topbar = document.querySelector(".topbar");
  if (!topbar) return;
  topbar.innerHTML = `
    <button id="menu-toggle" class="menu-toggle">☰</button>
    <h2>${title}</h2>
    <div>
      <span id="auth-status"></span>
      <button id="logout-btn" style="margin-inline-start:10px;">خروج</button>
    </div>
  `;
  document.getElementById("logout-btn").addEventListener("click", logoutUser);

  // إعادة ربط زر القائمة الجانبية (☰) بعد إنشائه هنا ديناميكيًا،
  // لأن app.js يحاول ربطه عند DOMContentLoaded وقد لا يكون موجودًا
  // بعد في الصفحات الفرعية في تلك اللحظة. bindMenuToggle() تتجاهل
  // الربط المكرر تلقائيًا (dataset.bound) فلا ضرر من استدعائها مرتين.
  bindMenuToggle();
}
