let workOrderStatuses = [];
let paperSizes = [];
let printTypes = [];
let workItemSeq = 0;

function todayISO(){const d=new Date(),offset=d.getTimezoneOffset();return new Date(d.getTime()-offset*60000).toISOString().slice(0,10)}
function safeJson(value,fallback){try{return JSON.parse(value)}catch(_){return fallback}}
function parseOrderDetails(row){const parsed=safeJson(row?.notes||'',null);if(parsed&&Array.isArray(parsed.items))return parsed;return {items:[{paper_size_id:row?.paper_size_id||'',quantity:row?.quantity||'',copies:'',print_type_id:row?.print_type_id||'',serial_start:'',serial_end:'',work_type:'',measurement:''}],version:2}}
function parseOrderItems(row){return parseOrderDetails(row).items||[]}
function orderNotes(items){return JSON.stringify({version:2,items:items.map(i=>({work_type:i.work_type||'',measurement:i.measurement||'',paper_size_id:i.paper_size_id||'',quantity:i.quantity??'',copies:i.copies??'',print_type_id:i.print_type_id||'',serial_start:i.serial_start||'',serial_end:i.serial_end||''}))})}
function getOptionHtml(items,selected,placeholder){return `<option value="">${placeholder}</option>`+(items||[]).map(x=>`<option value="${escapeHtml(x.id)}" ${String(x.id)===String(selected||'')?'selected':''}>${escapeHtml(x.name)}</option>`).join('')}

 document.addEventListener('DOMContentLoaded',async()=>{renderPageHeader('طلبات العمل');const session=await checkAuth();if(!session)return;await Promise.all([loadOrderStatuses(),loadPaperSizes(),loadPrintTypes()]);addWorkItem();await restorePendingWorkOrder();bindOrderCalculations();await loadWorkOrders();document.getElementById('work-orders-form').addEventListener('submit',saveWorkOrder);document.getElementById('customer-search')?.addEventListener('input',loadWorkOrders);document.getElementById('add-work-item')?.addEventListener('click',()=>addWorkItem());});
async function loadOrderStatuses(){const {data}=await supabaseClient.from('order_statuses').select('id,name').eq('is_active',true).order('name');workOrderStatuses=data||[]}
async function loadPaperSizes(){const {data}=await supabaseClient.from('paper_sizes').select('id,name').eq('is_active',true).order('name');paperSizes=data||[]}
async function loadPrintTypes(){const {data}=await supabaseClient.from('print_types').select('id,name').eq('is_active',true).order('name');printTypes=data||[]}
function addWorkItem(item={}){const wrap=document.getElementById('work-items');if(!wrap)return;workItemSeq++;const id=workItemSeq;const el=document.createElement('div');el.className='work-item-card';el.dataset.itemId=id;el.innerHTML=`<div class="work-item-title"><strong>نوع العمل ${id}</strong><button type="button" class="remove-work-item">حذف</button></div><div class="work-item-grid"><div class="form-field"><label>اسم/نوع العمل</label><input class="item-work-type" placeholder="مثال: دفتر قبض" value="${escapeHtml(item.work_type||'')}"></div><div class="form-field"><label>القياس</label><select class="item-paper-size">${getOptionHtml(paperSizes,item.paper_size_id,'اختر القياس')}</select></div><div class="form-field"><label>الكمية</label><input type="number" min="1" step="1" class="item-quantity" placeholder="الكمية" value="${escapeHtml(item.quantity??'')}"></div><div class="form-field"><label>عدد النسخ</label><input type="number" min="1" step="1" class="item-copies" placeholder="اكتب العدد يدويًا" value="${escapeHtml(item.copies??'')}"></div><div class="form-field"><label>نوع الطباعة</label><select class="item-print-type">${getOptionHtml(printTypes,item.print_type_id,'اختر نوع الطباعة')}</select></div><div class="form-field"><label>الرقم التسلسلي من</label><input type="text" class="item-serial-start" inputmode="numeric" placeholder="مثال: 1001" value="${escapeHtml(item.serial_start||'')}"></div><div class="form-field"><label>الرقم التسلسلي إلى</label><input type="text" class="item-serial-end" inputmode="numeric" placeholder="مثال: 1500" value="${escapeHtml(item.serial_end||'')}"></div><div class="form-field"><label>ملاحظة القياس (اختياري)</label><input class="item-measurement" placeholder="مثال: 14 × 21 سم" value="${escapeHtml(item.measurement||'')}"></div></div>`;wrap.appendChild(el);el.querySelector('.remove-work-item').addEventListener('click',()=>{if(wrap.children.length<=1){alert('يجب أن يبقى نوع عمل واحد على الأقل.');return}el.remove();renumberWorkItems()})}
function renumberWorkItems(){document.querySelectorAll('.work-item-card').forEach((el,i)=>{el.querySelector('.work-item-title strong').textContent=`نوع العمل ${i+1}`})}
function collectWorkItems(){return [...document.querySelectorAll('.work-item-card')].map(el=>({work_type:parseTextOrNull(el.querySelector('.item-work-type')?.value),paper_size_id:parseTextOrNull(el.querySelector('.item-paper-size')?.value),quantity:parseNumberOrNull(el.querySelector('.item-quantity')?.value),copies:parseNumberOrNull(el.querySelector('.item-copies')?.value),print_type_id:parseTextOrNull(el.querySelector('.item-print-type')?.value),serial_start:parseTextOrNull(el.querySelector('.item-serial-start')?.value),serial_end:parseTextOrNull(el.querySelector('.item-serial-end')?.value),measurement:parseTextOrNull(el.querySelector('.item-measurement')?.value)}))}
function bindOrderCalculations(){['f-total_amount','f-deposit'].forEach(id=>document.getElementById(id)?.addEventListener('input',updateRemaining));updateRemaining()}
function updateRemaining(){const total=Math.max(0,parseNumberOrNull(document.getElementById('f-total_amount')?.value)||0);const deposit=Math.max(0,parseNumberOrNull(document.getElementById('f-deposit')?.value)||0);const out=document.getElementById('f-remaining');if(out)out.textContent=formatMoney(Math.max(0,total-deposit))}
async function restorePendingWorkOrder() {
  const requestStateKey = 'workOrderCreateRetryState';
  let savedState;

  try {
    savedState = JSON.parse(sessionStorage.getItem(requestStateKey) || 'null');
  } catch (_) {
    alert('تعذّر قراءة حالة حفظ طلب سابقة. لن ننشئ طلبًا جديدًا قبل مراجعة الحالة.');
    return;
  }

  if (!savedState) return;

  if (!savedState.requestId || !savedState.fingerprint || !savedState.record) {
    alert(
      'توجد محاولة حفظ قديمة لا تحتوي على بيانات كافية للاستعادة الآمنة. ' +
      'لم يتم حذفها أو إنشاء طلب جديد. تحقق من قائمة طلبات العمل أولًا.'
    );
    return;
  }

  const record = savedState.record;
  document.getElementById('f-customer_name').value = record.customer_name || '';
  document.getElementById('f-customer_phone').value = record.customer_phone || '';
  document.getElementById('f-total_amount').value = record.net_total ?? '';
  document.getElementById('f-deposit').value = record.deposit_amount ?? 0;

  const items = parseOrderItems(record);
  const wrap = document.getElementById('work-items');
  if (wrap) wrap.innerHTML = '';
  workItemSeq = 0;
  (items.length ? items : [{}]).forEach(item => addWorkItem(item));

  alert(
    'تمت استعادة بيانات محاولة حفظ سابقة غير مؤكدة. ' +
    'راجع البيانات الظاهرة، ثم اضغط حفظ لإعادة إرسال العملية نفسها بأمان. ' +
    'لا تعدّل البيانات قبل حسم هذه المحاولة.'
  );
}

async function submitWorkOrderRecord(form, record, requestStateKey, fingerprint, creationRequestId) {
  const payload = { ...record, creation_request_id: creationRequestId };
  const { data, error } = await supabaseClient.rpc(
    'create_work_order_with_deposit',
    { p_order: payload }
  );

  if (error) {
    return showFormError(
      form,
      'تعذّر تأكيد حفظ الطلب: ' + error.message +
      '؛ احتفظ بالبيانات نفسها وأعد المحاولة دون إنشاء طلب جديد.'
    );
  }

  await logActivity('insert', 'work_orders', data?.id || null, {
    ...payload,
    order_no: data?.order_no || null,
    already_created: data?.already_created === true
  });

  try {
    const currentState = JSON.parse(sessionStorage.getItem(requestStateKey) || 'null');
    if (currentState?.requestId === creationRequestId && currentState?.fingerprint === fingerprint) {
      sessionStorage.removeItem(requestStateKey);
    }
  } catch (_) {
    // لا نوقف الحفظ الناجح بسبب خطأ في تنظيف حالة المحاولة.
  }

  if (data?.already_created) {
    alert(`تم العثور على الطلب السابق #${data?.order_no ?? ''}؛ لم يتم إنشاء طلب مكرر.`);
  } else {
    alert(`تم حفظ طلب العمل بنجاح. رقم الطلب: #${data?.order_no ?? ''}`);
  }

  form.reset();
  const wrap = document.getElementById('work-items');
  if (wrap) wrap.innerHTML = '';
  workItemSeq = 0;
  addWorkItem();
  updateRemaining();
  await loadWorkOrders();
}

async function saveWorkOrder(e) {
  e.preventDefault();
  const form = e.currentTarget;
  clearFormError(form);
  const requestStateKey = 'workOrderCreateRetryState';
  let savedState;

  try {
    savedState = JSON.parse(sessionStorage.getItem(requestStateKey) || 'null');
  } catch (_) {
    return showFormError(form, 'تعذّر قراءة حالة الحفظ السابقة. لم يتم إرسال طلب جديد.');
  }

  // عند وجود محاولة غير محسومة، نعيد إرسال السجل المحفوظ نفسه بدل الاعتماد على النموذج الحالي.
  if (savedState) {
    if (!savedState.requestId || !savedState.fingerprint || !savedState.record) {
      return showFormError(
        form,
        'توجد محاولة حفظ قديمة غير محسومة ولا يمكن استعادتها بأمان. تحقق من قائمة الطلبات قبل المتابعة.'
      );
    }

    if (JSON.stringify(savedState.record) !== savedState.fingerprint) {
      return showFormError(form, 'بيانات محاولة الحفظ المحفوظة غير متطابقة. لم يتم إرسال العملية.');
    }

    if (!confirm('ستتم إعادة إرسال محاولة الحفظ السابقة بالبيانات المحفوظة نفسها. لن يتم إنشاء طلب جديد بمعرّف مختلف. هل تريد المتابعة؟')) {
      return;
    }

    return submitWorkOrderRecord(
      form,
      savedState.record,
      requestStateKey,
      savedState.fingerprint,
      savedState.requestId
    );
  }

  const customer_name = parseTextOrNull(document.getElementById('f-customer_name').value);
  const customer_phone = parseTextOrNull(document.getElementById('f-customer_phone').value);
  const total_amount = parseNumberOrNull(document.getElementById('f-total_amount').value);
  const deposit = Math.max(0, parseNumberOrNull(document.getElementById('f-deposit').value) || 0);
  const items = collectWorkItems();

  if (!customer_name) return showFormError(form, 'أدخل اسم الزبون');
  if (total_amount === null || Number.isNaN(total_amount) || total_amount < 0) {
    return showFormError(form, 'أدخل المبلغ الكلي بشكل صحيح');
  }
  if (deposit > total_amount) return showFormError(form, 'العربون لا يمكن أن يتجاوز المبلغ الكلي');
  if (!items.length) return showFormError(form, 'أضف نوع عمل واحدًا على الأقل');

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.work_type) return showFormError(form, `أدخل اسم/نوع العمل في النوع ${i + 1}`);
    if (item.quantity === null || Number.isNaN(item.quantity) || item.quantity <= 0) {
      return showFormError(form, `أدخل الكمية بشكل صحيح في النوع ${i + 1}`);
    }
    if (item.copies !== null && (Number.isNaN(item.copies) || item.copies <= 0)) {
      return showFormError(form, `عدد النسخ يجب أن يكون رقمًا موجبًا في النوع ${i + 1}`);
    }
  }

  const first = items[0];
  const remaining_amount = Math.max(0, total_amount - deposit);
  const status_id = workOrderStatuses.find(x => /جديد/i.test(x.name))?.id || workOrderStatuses[0]?.id || null;
  const record = {
    order_date: todayISO(),
    customer_name,
    customer_phone,
    paper_size_id: first.paper_size_id || null,
    print_type_id: first.print_type_id || null,
    quantity: first.quantity || 0,
    unit_retail_price: total_amount,
    unit_wholesale_price: 0,
    chosen_unit_price: total_amount,
    gross_total: total_amount,
    discount: 0,
    net_total: total_amount,
    paid_amount: deposit,
    remaining_amount,
    status_id,
    payment_status: deposit <= 0 ? 'unpaid' : deposit < total_amount ? 'partial' : 'paid',
    notes: orderNotes(items),
    deposit_amount: deposit
  };

  const fingerprint = JSON.stringify(record);
  const creationRequestId = crypto.randomUUID();

  try {
    sessionStorage.setItem(
      requestStateKey,
      JSON.stringify({ fingerprint, requestId: creationRequestId, record })
    );
  } catch (_) {
    return showFormError(form, 'تعذّر حفظ بيانات محاولة الحفظ محليًا. لم يتم إرسال الطلب.');
  }

  return submitWorkOrderRecord(
    form,
    record,
    requestStateKey,
    fingerprint,
    creationRequestId
  );
}

function getStatusClass(name){if(/تسليم|جاهز|مكتمل/i.test(name||''))return'status-ready';if(/طباع|قيد/i.test(name||''))return'status-print';if(/تصميم/i.test(name||''))return'status-design';return'status-new'}
function statusOptions(selected){return workOrderStatuses.map(s=>`<option value="${escapeHtml(s.id)}" ${String(s.id)===String(selected)?'selected':''}>${escapeHtml(s.name)}</option>`).join('')}

async function changeOrderStatus(id, statusId) {
  if (!statusId) return;

  const selectedStatus = workOrderStatuses.find(
    x => String(x.id) === String(statusId)
  );

  const isDelivered =
    selectedStatus && /تم التسليم|تسليم/i.test(selectedStatus.name || '');

  if (isDelivered) {
    const order = window.__workOrdersCache?.find(
      x => String(x.id) === String(id)
    );

    if (!order) {
      alert('تعذّر العثور على بيانات الطلب.');
      return;
    }

    const total = Math.max(0, Number(order.net_total) || 0);
    const paid = Math.max(0, Number(order.paid_amount) || 0);
    const remaining = Math.max(0, total - paid);
    const requestStateKey = `workOrderDeliveryRetry:${id}`;

    let savedState;
    try {
      savedState = JSON.parse(
        sessionStorage.getItem(requestStateKey) || 'null'
      );
    } catch (_) {
      alert('تعذّر قراءة حالة عملية التحصيل المحفوظة. لم يتم إرسال العملية.');
      return;
    }

    let received;
    let fullPayment;
    let requestId;
    let fingerprint;

    if (savedState) {
      // إعادة المحاولة بالبيانات نفسها حتى لو تغيّر المتبقي بعد نجاح الحفظ الأول.
      if (
        !savedState.requestId ||
        !Number.isFinite(Number(savedState.amount)) ||
        typeof savedState.fullPayment !== 'boolean'
      ) {
        alert(
          'توجد محاولة تحصيل قديمة محفوظة لا تحتوي على بيانات كافية لإعادة المحاولة بأمان. ' +
          'لا تحذفها يدويًا؛ أرسل هذه الرسالة للمراجعة.'
        );
        return;
      }

      received = Number(savedState.amount);
      fullPayment = savedState.fullPayment;
      requestId = savedState.requestId;
      fingerprint = JSON.stringify({ workOrderId: id, amount: received, fullPayment });

      if (savedState.fingerprint !== fingerprint) {
        alert('بيانات محاولة التحصيل المحفوظة غير متطابقة. لم يتم إرسال العملية.');
        return;
      }

      if (!confirm(
        `توجد محاولة تحصيل سابقة لم نتأكد من نتيجتها بقيمة ${formatMoney(received)}.\n` +
        'هل تريد إعادة إرسال العملية نفسها للتحقق من نتيجتها دون إنشاء دفعة مكررة؟'
      )) return;
    } else {
      const amountInput = prompt(
        `طلب #${order.order_no}\n` +
        `الزبون: ${order.customer_name || '-'}\n` +
        `المبلغ الكلي: ${formatMoney(total)}\n` +
        `المبلغ المستلم سابقاً: ${formatMoney(paid)}\n` +
        `المبلغ المتبقي: ${formatMoney(remaining)}\n\n` +
        `أدخل المبلغ المستلم عند التسليم.\n` +
        `إذا كان المبلغ واصل كاملاً أدخل: ${remaining}`
      );

      if (amountInput === null) return;

      received = Number(String(amountInput).replace(/,/g, '').trim());
      if (
        !Number.isFinite(received) ||
        received < 0 ||
        received > remaining
      ) {
        alert('المبلغ المستلم غير صحيح. يجب أن يكون بين 0 والمبلغ المتبقي.');
        return;
      }

      fullPayment = Math.abs(received - remaining) < 0.01;
      requestId = crypto.randomUUID();
      fingerprint = JSON.stringify({ workOrderId: id, amount: received, fullPayment });

      try {
        sessionStorage.setItem(
          requestStateKey,
          JSON.stringify({ requestId, fingerprint, amount: received, fullPayment })
        );
      } catch (_) {
        alert('تعذّر حفظ معرّف عملية التحصيل. لم يتم إرسال العملية.');
        return;
      }
    }

    const { data, error } = await supabaseClient.rpc(
      'record_work_order_delivery_payment',
      {
        p_work_order_id: id,
        p_amount: received,
        p_full_payment: fullPayment,
        p_request_id: requestId
      }
    );

    if (error) {
      // نحتفظ بالمعرّف لإعادة المحاولة الآمنة بالبيانات نفسها.
      alert('تعذّر تأكيد التحصيل: ' + error.message);
      return;
    }

    await logActivity(
      'update',
      'work_orders',
      id,
      {
        status_id: statusId,
        delivery_amount_received: received,
        delivery_payment_full: fullPayment,
        payment_id: data?.payment_id || null,
        already_recorded: data?.already_recorded === true
      }
    );

    // لا نمسح معرّف العملية إلا بعد نجاح RPC وتسجيل النشاط.
    try {
      const currentState = JSON.parse(
        sessionStorage.getItem(requestStateKey) || 'null'
      );

      if (currentState?.requestId === requestId) {
        sessionStorage.removeItem(requestStateKey);
      }
    } catch (_) {
      // لا نلغي عملية تحصيل ناجحة بسبب مشكلة في تنظيف الحالة.
    }

    const newRemaining = Math.max(
      0,
      Number(data?.remaining_amount ?? (remaining - received))
    );

    if (data?.already_recorded) {
      alert(
        'تم التعرف على عملية التحصيل السابقة ولم تُنشأ دفعة جديدة.\n\n' +
        `المبلغ المسجل: ${formatMoney(received)}\n` +
        `المبلغ المتبقي: ${formatMoney(newRemaining)}`
      );
    } else if (newRemaining > 0) {
      alert(
        'تم تسليم الطلب وتسجيل المبلغ المستلم في الوارد.\n\n' +
        `المبلغ المستلم: ${formatMoney(received)}\n` +
        `المبلغ المتبقي على الزبون: ${formatMoney(newRemaining)}`
      );
    } else {
      alert(
        'تم تسليم الطلب وتسجيل المبلغ كاملاً في الوارد.\n\n' +
        `المبلغ المستلم: ${formatMoney(received)}`
      );
    }

    await loadWorkOrders();
    return;
  }

  const { error } = await supabaseClient
    .from('work_orders')
    .update({
      status_id: statusId,
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (error) {
    alert('تعذّر تحديث حالة الطلب: ' + error.message);
    return;
  }

  await logActivity('update', 'work_orders', id, {
    status_id: statusId
  });

  await loadWorkOrders();
}

function itemLabel(item){const type=item.work_type||'عمل';const qty=item.quantity?` × ${item.quantity}`:'';const serial=item.serial_start||item.serial_end?` (${item.serial_start||'—'} - ${item.serial_end||'—'})`:'';return `${type}${qty}${serial}`}
function printOrder(row){const items=parseOrderItems(row);const remaining=Math.max(0,Number(row.net_total||0)-Number(row.paid_amount||0));const rows=items.map((x,i)=>`<tr><td>${i+1}</td><td>${escapeHtml(x.work_type||'—')}</td><td>${escapeHtml(paperSizes.find(p=>String(p.id)===String(x.paper_size_id))?.name||row.paper_sizes?.name||'—')}</td><td>${escapeHtml(x.quantity??'—')}</td><td>${escapeHtml(x.copies??'—')}</td><td>${escapeHtml(printTypes.find(p=>String(p.id)===String(x.print_type_id))?.name||row.print_types?.name||'—')}</td><td>${escapeHtml(x.serial_start||'—')}</td><td>${escapeHtml(x.serial_end||'—')}</td></tr>`).join('');const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>إيصال طلب العمل #${escapeHtml(row.order_no)}</title><style>body{font-family:Arial,sans-serif;padding:25px;color:#111}h1{text-align:center}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #bbb;padding:8px;text-align:right}th{background:#eee}.total{font-weight:bold;font-size:18px}@media print{body{padding:10mm}}</style></head><body><h1>برنامج المحاسبة للمطابع</h1><p style="text-align:center">إدارة أسهل .. أرباح أكبر</p><hr><p><b>رقم الطلب:</b> #${escapeHtml(row.order_no)}</p><p><b>الزبون:</b> ${escapeHtml(row.customer_name)} &nbsp; <b>الهاتف:</b> ${escapeHtml(row.customer_phone||'—')}</p><table><thead><tr><th>#</th><th>نوع العمل</th><th>القياس</th><th>الكمية</th><th>النسخ</th><th>الطباعة</th><th>من</th><th>إلى</th></tr></thead><tbody>${rows}</tbody></table><p>المبلغ الكلي: <b>${formatMoney(row.net_total)}</b></p><p>المبلغ المستلم حتى الآن: <b>${formatMoney(row.paid_amount)}</b></p><p class="total">المتبقي: ${formatMoney(remaining)}</p><script>window.print();</script></body></html>`;const w=window.open('','_blank','width=900,height=900');if(!w){alert('يرجى السماح بالنوافذ المنبثقة للطباعة.');return}w.document.write(html);w.document.close()}
async function loadWorkOrders(){
  const search=(document.getElementById('customer-search')?.value||'').trim().toLowerCase();
  const {data,error}=await supabaseClient.from('work_orders').select('*, paper_sizes(name), print_types(name), order_statuses(name)').order('order_no',{ascending:false});
  const tbody=document.getElementById('work-orders-table-body');
  tbody.innerHTML='';
  if(error){tbody.appendChild(buildSafeRow(['تعذّر تحميل الطلبات: '+error.message]));return}
  const all=data||[];

  // احسب إجمالي المقبوضات للعرض من العربون وجميع الدفعات المسجلة.
  // هذا لا ينشئ سجلات مالية؛ يقرأ السجلات الموجودة فقط.
  const orderIds = all.map(r => r.id).filter(Boolean);
  const collectedByOrder = {};
  if (orderIds.length) {
    const { data: payments, error: paymentsError } = await supabaseClient
      .from('work_order_payments')
      .select('work_order_id, amount')
      .in('work_order_id', orderIds);

    if (paymentsError) {
      tbody.appendChild(buildSafeRow([
        'تعذّر تحميل دفعات الطلبات: ' + paymentsError.message
      ]));
      return;
    }

    (payments || []).forEach(payment => {
      const key = String(payment.work_order_id);
      collectedByOrder[key] =
        (collectedByOrder[key] || 0) + (Number(payment.amount) || 0);
    });
  }

  all.forEach(row => {
    const deposit = Math.max(0, Number(row.deposit_amount) || 0);
    const laterPayments = Math.max(0, Number(collectedByOrder[String(row.id)] || 0));
    row.paid_amount = Math.max(
      Number(row.paid_amount) || 0,
      deposit + laterPayments
    );
    row.remaining_amount = Math.max(
      0,
      (Number(row.net_total) || 0) - row.paid_amount
    );
  });

  window.__workOrdersCache=all;
  const rows=search?all.filter(r=>String(r.customer_name||'').toLowerCase().includes(search)||String(r.customer_phone||'').toLowerCase().includes(search)):all;
  renderCustomerHistory(search,all);
  rows.forEach(row=>{
    const status=row.order_statuses?.name||'جديد';
    const remaining=Math.max(0,Number(row.net_total||0)-Number(row.paid_amount||0));
    const items=parseOrderItems(row);
    const totalQty=items.reduce((s,x)=>s+(Number(x.quantity)||0),0);
    const itemText=items.map(itemLabel).join('، ');
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>#${escapeHtml(row.order_no)}</td><td>${escapeHtml(row.customer_name)}</td><td>${row.customer_phone?`<a class="phone-link" href="tel:${escapeHtml(row.customer_phone)}">${escapeHtml(row.customer_phone)}</a>`:'—'}</td><td class="work-items-summary">${escapeHtml(itemText||'—')}</td><td>${escapeHtml(totalQty)}</td><td>${formatMoney(row.net_total)}</td><td>${formatMoney(row.paid_amount)}</td><td>${formatMoney(remaining)}</td><td><span class="status-badge ${getStatusClass(status)}">${escapeHtml(status)}</span></td><td><div class="order-actions"><select class="order-status-select" data-id="${escapeHtml(row.id)}"><option value="">تغيير الحالة</option>${statusOptions(row.status_id)}</select><button type="button" class="print-order-btn" data-id="${escapeHtml(row.id)}">طباعة</button><button type="button" class="delete-work-order-btn" data-id="${escapeHtml(row.id)}">حذف</button></div></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('.order-status-select').forEach(el=>el.addEventListener('change',()=>changeOrderStatus(el.dataset.id,el.value)));
  tbody.querySelectorAll('.print-order-btn').forEach(btn=>btn.addEventListener('click',()=>{const row=all.find(x=>String(x.id)===String(btn.dataset.id));if(row)printOrder(row)}));
  tbody.querySelectorAll('.delete-work-order-btn').forEach(btn=>btn.addEventListener('click',async()=>{
    if(!confirm('تأكيد حذف طلب العمل؟'))return;
    const id=btn.dataset.id;
    const {error}=await supabaseClient.from('work_orders').delete().eq('id',id);
    if(!error){await logActivity('delete','work_orders',id);await loadWorkOrders()}else alert('تعذّر الحذف: '+error.message)
  }));
}
function renderCustomerHistory(search,rows){const box=document.getElementById('customer-history');if(!box)return;if(!search){box.hidden=true;box.innerHTML='';return}const matched=rows.filter(r=>String(r.customer_name||'').toLowerCase().includes(search)||String(r.customer_phone||'').toLowerCase().includes(search));const total=matched.reduce((s,r)=>s+Number(r.net_total||0),0);const paid=matched.reduce((s,r)=>s+Number(r.paid_amount||0),0);const qty=matched.reduce((s,r)=>s+parseOrderItems(r).reduce((a,x)=>a+(Number(x.quantity)||0),0),0);const types={};matched.forEach(r=>parseOrderItems(r).forEach(x=>{const k=x.work_type||'غير محدد';types[k]=(types[k]||0)+(Number(x.quantity)||0)}));const typeText=Object.entries(types).map(([k,v])=>`${k}: ${v}`).join('، ');box.hidden=false;box.innerHTML=`<div><strong>سجل الزبون</strong><span>${matched.length} طلب</span></div><div>إجمالي الكمية: <b>${qty.toLocaleString('en-US')}</b></div><div>إجمالي الأعمال: <b>${formatMoney(total)}</b></div><div>العربون: <b>${formatMoney(paid)}</b></div><div>المتبقي: <b>${formatMoney(Math.max(0,total-paid))}</b></div><div class="customer-types">الأنواع: <b>${escapeHtml(typeText||'—')}</b></div>`}
