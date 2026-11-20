/**
 * وحدة التحكم الرئيسية لتطبيق ميزان الحديد للجمالونات
 */

(function () {
  'use strict';

  const WORKSHOP_STORAGE_KEY = 'mizan_workshop_profile_v1';
  const QUOTES_STORAGE_KEY = 'mizan_saved_quotes_v1';
  const THEME_STORAGE_KEY = 'mizan_theme_v1';

  const DEFAULT_WORKSHOP = {
    name: 'ميزان الحديد للجمالونات',
    tagline: 'تصنيع وتركيب جميع أنواع الجمالونات والهناجر المعدنية — بأسعار السوق المصري اليوم',
    phone: '',
    whatsapp: '',
    notes: '• العرض صالح لمدة 48 ساعة نظراً لتغير أسعار الحديد والصاج يومياً في السوق المصري.\n• الأسعار تشمل التوريد والتصنيع والتركيب حسب المواصفات المذكورة أعلاه، ولا تشمل الأعمال الخرسانية ما لم يُذكر خلاف ذلك.\n• الدفعة المقدمة 50% عند التعاقد والباقي حسب مراحل التوريد والتركيب.'
  };

  const PRESETS = {
    small: { length: 10, width: 8, height: 4, trussDuty: 'light', steelGrade: 'light', sheetType: 'galvanized_05', roofShape: 'gable', wallCladding: 'none', baySpacing: 5 },
    medium: { length: 20, width: 12, height: 6, trussDuty: 'medium', steelGrade: 'medium', sheetType: 'colored_05', roofShape: 'gable', wallCladding: 'partial', brickWallHeight: 3, baySpacing: 5 },
    large: { length: 40, width: 20, height: 8, trussDuty: 'heavy', steelGrade: 'heavy', sheetType: 'sandwich_5', roofShape: 'gable', wallCladding: 'full', baySpacing: 6 },
    farm: { length: 30, width: 14, height: 4.5, trussDuty: 'light', steelGrade: 'medium', sheetType: 'colored_05', roofShape: 'gable', wallCladding: 'partial', brickWallHeight: 2.5, baySpacing: 5 }
  };

  // الحالة الحالية للتطبيق
  const state = {
    role: 'workshop', // 'workshop' | 'client'
    isLockedClientUrl: false,
    blueprintView: 'isometric', // 'isometric' | 'elevation'
    config: {
      length: 20,
      width: 12,
      height: 6,
      trussDuty: 'medium',
      steelGrade: 'medium',
      sheetType: 'colored_05',
      roofShape: 'gable',
      wallCladding: 'none',
      brickWallHeight: 3,
      slopePercent: 12,
      baySpacing: 5,
      steelWastePct: 5,
      sheetWastePct: 8,
      includeAccessories: true,
      includeGutters: false,
      // المصنعية (الحداد)
      laborMode: 'perUnit', // 'perUnit' | 'lump' | 'percent'
      laborPerTon: 14500,
      laborSheetPerM2: 32,
      laborLump: 95000,
      laborPercent: 25,
      transportCost: 0,
      clientName: '',
      hideLaborDetail: false
    },
    workshop: loadWorkshop(),
    savedQuotes: loadSavedQuotes(),
    lastCalc: null
  };

  const priceManager = new window.MizanPrices.PriceManager();

  // ---------- دوال مساعدة للتنسيق ----------
  function fmtMoney(n) {
    return `${Math.round(Number(n) || 0).toLocaleString('en-US')} ج.م`;
  }

  function fmtNum(n, decimals = 0) {
    return (Number(n) || 0).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function $(id) {
    return document.getElementById(id);
  }

  let toastTimer = null;
  function showToast(msg) {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  function loadWorkshop() {
    try {
      const raw = localStorage.getItem(WORKSHOP_STORAGE_KEY);
      if (!raw) return Object.assign({}, DEFAULT_WORKSHOP);
      return Object.assign({}, DEFAULT_WORKSHOP, JSON.parse(raw));
    } catch (_) {
      return Object.assign({}, DEFAULT_WORKSHOP);
    }
  }

  function saveWorkshop(ws) {
    state.workshop = Object.assign({}, DEFAULT_WORKSHOP, ws);
    try {
      localStorage.setItem(WORKSHOP_STORAGE_KEY, JSON.stringify(state.workshop));
    } catch (_) {}
  }

  function loadSavedQuotes() {
    try {
      const raw = localStorage.getItem(QUOTES_STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function persistSavedQuotes() {
    try {
      localStorage.setItem(QUOTES_STORAGE_KEY, JSON.stringify(state.savedQuotes));
    } catch (_) {}
    updateSavedCount();
  }

  function updateSavedCount() {
    const el = $('savedQuotesCount');
    if (el) el.textContent = String(state.savedQuotes.length);
  }

  // ---------- قراءة بارامترات الرابط (رابط العميل / مقايسة جاهزة) ----------
  function applyUrlParams() {
    const params = new URLSearchParams(window.location.search);
    if (!params.toString()) return;

    if (params.get('mode') === 'client') {
      state.role = 'client';
      state.isLockedClientUrl = true;
    }

    const numKeys = [
      ['l', 'length'],
      ['w', 'width'],
      ['h', 'height'],
      ['slope', 'slopePercent'],
      ['bay', 'baySpacing'],
      ['bh', 'brickWallHeight']
    ];
    numKeys.forEach(([p, k]) => {
      const val = Number(params.get(p));
      if (val > 0) state.config[k] = val;
    });

    const strKeys = [
      ['duty', 'trussDuty'],
      ['grade', 'steelGrade'],
      ['sheet', 'sheetType'],
      ['roof', 'roofShape'],
      ['wall', 'wallCladding'],
      ['client', 'clientName']
    ];
    strKeys.forEach(([p, k]) => {
      const val = params.get(p);
      if (val) state.config[k] = val;
    });

    if (params.get('gutters') === '1') state.config.includeGutters = true;

    // بيانات الورشة المضمّنة في رابط العميل
    if (params.get('ws')) state.workshop.name = params.get('ws');
    if (params.get('wa')) state.workshop.whatsapp = params.get('wa');
    if (params.get('ph')) state.workshop.phone = params.get('ph');

    // أسعار اليوم المضمّنة من الورشة
    priceManager.applyUrlPriceOverrides(params);
  }

  // ---------- مزامنة عناصر الواجهة مع الحالة ----------
  function syncInputsFromState() {
    const c = state.config;
    $('inputLength').value = c.length;
    $('rangeLength').value = Math.min(80, Math.max(4, c.length));
    $('inputWidth').value = c.width;
    $('rangeWidth').value = Math.min(40, Math.max(3, c.width));
    $('inputHeight').value = c.height;
    $('rangeHeight').value = Math.min(14, Math.max(2.5, c.height));

    $('inputBrickHeight').value = c.brickWallHeight;
    $('inputSlope').value = c.slopePercent;
    $('inputBaySpacing').value = c.baySpacing;
    $('inputSteelWaste').value = c.steelWastePct;
    $('inputSheetWaste').value = c.sheetWastePct;
    $('chkAccessories').checked = c.includeAccessories;
    $('chkGutters').checked = c.includeGutters;

    $('inputLaborPerTon').value = c.laborPerTon;
    $('inputLaborSheetM2').value = c.laborSheetPerM2;
    $('inputLaborLump').value = c.laborLump;
    $('inputLaborPercent').value = c.laborPercent;
    $('inputTransportCost').value = c.transportCost;
    $('inputClientName').value = c.clientName;
    $('chkHideLaborDetail').checked = c.hideLaborDetail;

    // تحديث بطاقات الاختيار
    ['trussDuty', 'steelGrade', 'sheetType', 'roofShape', 'wallCladding'].forEach((group) => {
      document.querySelectorAll(`.choice-card[data-group="${group}"]`).forEach((card) => {
        const isSel = card.dataset.value === c[group];
        card.classList.toggle('selected', isSel);
        const radio = card.querySelector('input[type="radio"]');
        if (radio) radio.checked = isSel;
      });
    });

    $('brickWallHeightWrap').classList.toggle('hidden', c.wallCladding !== 'partial');
    syncLaborTabs();
  }

  function syncLaborTabs() {
    const mode = state.config.laborMode;
    document.querySelectorAll('.labor-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.laborMode === mode);
    });
    $('laborInputsPerUnit').classList.toggle('hidden', mode !== 'perUnit');
    $('laborInputsLump').classList.toggle('hidden', mode !== 'lump');
    $('laborInputsPercent').classList.toggle('hidden', mode !== 'percent');
  }

  function applyRoleUI() {
    const isClient = state.role === 'client';

    document.querySelectorAll('.workshop-only').forEach((el) => {
      el.classList.toggle('hidden', isClient);
    });
    document.querySelectorAll('.client-only').forEach((el) => {
      el.classList.toggle('hidden', !isClient);
    });

    $('clientBanner').classList.toggle('hidden', !isClient);
    $('clientBannerWorkshop').textContent = state.workshop.name;

    // إذا كان العميل فتح رابطاً مخصصاً (?mode=client)، نخفي زر التبديل لوضع الورشة
    $('roleSwitchWrap').classList.toggle('hidden', state.isLockedClientUrl);

    $('btnRoleWorkshop').classList.toggle('active', !isClient);
    $('btnRoleClient').classList.toggle('active', isClient);

    // تعديل زر الواتساب والطباعة حسب الوضع
    $('btnSendWhatsApp').classList.toggle('hidden', isClient);
  }

  function applyWorkshopBranding() {
    $('headerWorkshopName').textContent = state.workshop.name || DEFAULT_WORKSHOP.name;
    $('headerWorkshopSub').textContent = state.workshop.tagline || DEFAULT_WORKSHOP.tagline;
    $('clientBannerWorkshop').textContent = state.workshop.name || DEFAULT_WORKSHOP.name;
    $('footerWorkshopLine').textContent = `${state.workshop.name}${state.workshop.phone ? ' • ت: ' + state.workshop.phone : ''}`;
  }

  // ---------- تحديث شريط وبطاقات أسعار اليوم ----------
  function renderMarketPrices(priceState, isLoading) {
    $('marketDateLabel').textContent = window.MizanPrices.formatArabicDate(priceState.date);
    $('tickLight').textContent = fmtNum(priceState.steel.light.price);
    $('tickMedium').textContent = fmtNum(priceState.steel.medium.price);
    $('tickHeavy').textContent = fmtNum(priceState.steel.heavy.price);
    $('tickSheet').textContent = fmtNum(priceState.sheets.colored_05.price);

    $('cardPriceLight').textContent = `${fmtNum(priceState.steel.light.price)} ج.م / طن`;
    $('cardPriceMedium').textContent = `${fmtNum(priceState.steel.medium.price)} ج.م / طن`;
    $('cardPriceHeavy').textContent = `${fmtNum(priceState.steel.heavy.price)} ج.م / طن`;

    Object.keys(priceState.sheets).forEach((k) => {
      const el = $(`cardSheet_${k}`);
      if (el) el.textContent = `${fmtNum(priceState.sheets[k].price)} ج.م / م²`;
    });

    $('priceSourceNote').textContent = `${priceState.source} — ${window.MizanPrices.formatArabicDate(priceState.date)}`;

    const spinner = $('refreshSpinner');
    if (spinner) {
      spinner.textContent = isLoading ? '⏳' : '↻';
    }
  }

  // ---------- الحساب الشامل وتحديث كل النتائج والمخطط ----------
  function recalculateAndRender() {
    const priceState = priceManager.getState();
    const calc = window.MizanCalculator.calculateTrussBudget(state.config, priceState);
    state.lastCalc = calc;

    // 1. شريط المساحات
    $('lblFloorArea').textContent = `${fmtNum(calc.geometry.floorArea, 0)} م²`;
    $('lblRoofArea').textContent = `${fmtNum(calc.geometry.netRoofArea, 0)} م²`;
    $('lblPeakHeight').textContent = `${fmtNum(calc.geometry.peakHeight, 1)} م`;
    $('lblFramesCount').textContent = `${calc.geometry.numFrames} فريم (${calc.geometry.totalColumnsCount} عمود)`;

    // 2. المخطط الهندسي التفاعلي
    const svgHtml = state.blueprintView === 'elevation'
      ? window.MizanBlueprint.renderElevation(calc)
      : window.MizanBlueprint.renderIsometric(calc);
    $('blueprintStage').innerHTML = svgHtml;

    // 3. بطاقات KPI الرئيسية
    $('kpiSteelTons').textContent = `${fmtNum(calc.weights.totalSteelTons, 2)} طن`;
    $('kpiSteelKg').textContent = `${fmtNum(calc.weights.totalSteelKg, 0)} كجم (${fmtNum(calc.weights.steelKgPerM2, 1)} كجم/م²)`;

    $('kpiSheetArea').textContent = `${fmtNum(calc.geometry.totalSheetAreaWithWaste, 0)} م²`;
    $('kpiSheetCount').textContent = `حوالي ${fmtNum(calc.geometry.estimatedSheetsCount, 0)} لوح (قياسي 6م)`;

    $('kpiMaterialsCost').textContent = fmtMoney(calc.costs.materialsSubtotal);
    $('kpiMaterialsPerM2').textContent = `${fmtMoney(calc.costs.materialsPerM2)} / م² خامات`;

    // 4. الإجمالي النهائي شامل المصنعية (لصاحب الورشة)
    $('lblGrandTotal').textContent = fmtMoney(calc.costs.grandTotal);
    $('lblGrandTotalPerM2').textContent = `${fmtMoney(calc.costs.grandTotalPerM2)} / م²`;
    $('lblLaborOnlyTotal').textContent = fmtMoney(calc.costs.workshopExtrasTotal);

    // 5. مقاسات القطاعات الاسترشادية المقترحة
    $('specColumn').textContent = calc.sections.columnSpec;
    $('specTruss').textContent = calc.sections.trussSpec;
    $('specPurlin').textContent = calc.sections.purlinSpec;
    $('specBasePlate').textContent = calc.sections.basePlateSpec;

    // 6. التنبيهات الهندسية
    const notesWrap = $('engineeringNotes');
    if (calc.notes.length > 0) {
      notesWrap.classList.remove('hidden');
      notesWrap.innerHTML = calc.notes.map((n) => `
        <div class="note-alert ${n.type}">
          <span>${n.type === 'warn' ? '⚠️' : 'ℹ️'}</span>
          <span>${escapeHtml(n.text)}</span>
        </div>
      `).join('');
    } else {
      notesWrap.classList.add('hidden');
      notesWrap.innerHTML = '';
    }

    // 7. جدول تفصيل الكميات (BOQ)
    renderBoqTable(calc);
  }

  function renderBoqTable(calc) {
    const isClient = state.role === 'client';
    const w = calc.weights;
    const g = calc.geometry;
    const c = calc.costs;
    const tonPrice = c.steelPricePerTon;
    const rows = [];

    // مجموعة الحديد
    rows.push(`<tr class="group-row"><td colspan="3">أولاً: هيكل الحديد (${escapeHtml(calc.input.grade.shortName)} — ${fmtNum(tonPrice)} ج/طن)</td></tr>`);
    rows.push(`<tr><td>الأعمدة الرئيسية وأعمدة الرياح (${g.totalColumnsCount} عمود)</td><td class="num-col">${fmtNum(w.columnsKg, 0)} كجم</td><td class="num-col">${fmtMoney((w.columnsKg / 1000) * tonPrice)}</td></tr>`);
    rows.push(`<tr><td>الجمالونات والمقصات العلوية (${g.numFrames} فريم)</td><td class="num-col">${fmtNum(w.raftersKg, 0)} كجم</td><td class="num-col">${fmtMoney((w.raftersKg / 1000) * tonPrice)}</td></tr>`);
    rows.push(`<tr><td>مدادات السقف ${w.sideGirtsKg > 0 ? 'ومدادات الأجناب' : ''} (${g.purlinLines} خط)</td><td class="num-col">${fmtNum(w.purlinsTotalKg, 0)} كجم</td><td class="num-col">${fmtMoney((w.purlinsTotalKg / 1000) * tonPrice)}</td></tr>`);
    rows.push(`<tr><td>الشدادات والشكالات ومقاومة الرياح</td><td class="num-col">${fmtNum(w.bracingKg, 0)} كجم</td><td class="num-col">${fmtMoney((w.bracingKg / 1000) * tonPrice)}</td></tr>`);
    rows.push(`<tr><td>بليتات القواعد والوصلات والاستيفنرات</td><td class="num-col">${fmtNum(w.platesKg, 0)} كجم</td><td class="num-col">${fmtMoney((w.platesKg / 1000) * tonPrice)}</td></tr>`);
    if (w.wasteSteelKg > 0) {
      rows.push(`<tr><td>هالك التقطيع والتشغيل (${calc.input.steelWastePct}%)</td><td class="num-col">${fmtNum(w.wasteSteelKg, 0)} كجم</td><td class="num-col">${fmtMoney((w.wasteSteelKg / 1000) * tonPrice)}</td></tr>`);
    }
    rows.push(`<tr class="subtotal-row"><td>إجمالي الحديد</td><td class="num-col">${fmtNum(w.totalSteelTons, 2)} طن</td><td class="num-col">${fmtMoney(c.steelCost)}</td></tr>`);

    // مجموعة الصاج
    rows.push(`<tr class="group-row"><td colspan="3">ثانياً: التغطيات (${escapeHtml(calc.input.sheetObj.name)} — ${fmtNum(c.sheetPricePerM2)} ج/م²)</td></tr>`);
    rows.push(`<tr><td>صاج السقف (شامل التداخل والهالك ${calc.input.sheetWastePct}%)</td><td class="num-col">${fmtNum(g.roofSheetAreaWithWaste, 0)} م²</td><td class="num-col">${fmtMoney(c.roofSheetCost)}</td></tr>`);
    if (g.wallSheetAreaWithWaste > 0) {
      rows.push(`<tr><td>صاج تقفيل الأجناب (${escapeHtml(calc.input.wallMode.name)})</td><td class="num-col">${fmtNum(g.wallSheetAreaWithWaste, 0)} م²</td><td class="num-col">${fmtMoney(c.wallSheetCost)}</td></tr>`);
    }
    rows.push(`<tr class="subtotal-row"><td>إجمالي الصاج (~${fmtNum(g.estimatedSheetsCount, 0)} لوح)</td><td class="num-col">${fmtNum(g.totalSheetAreaWithWaste, 0)} م²</td><td class="num-col">${fmtMoney(c.totalSheetCost)}</td></tr>`);

    // مجموعة المستلزمات والإكسسوارات
    if (c.totalAccessoriesCost > 0) {
      rows.push(`<tr class="group-row"><td colspan="3">ثالثاً: المستلزمات والإكسسوارات</td></tr>`);
      if (calc.input.includeAccessories) {
        rows.push(`<tr><td>دهان برايمر أوكسيد + بوية ضد الصدأ</td><td class="num-col">${fmtNum(w.totalSteelTons, 2)} طن</td><td class="num-col">${fmtMoney(c.paintCost)}</td></tr>`);
        rows.push(`<tr><td>سلك لحام وأسطوانات قطعية ومستهلكات</td><td class="num-col">${fmtNum(w.totalSteelTons, 2)} طن</td><td class="num-col">${fmtMoney(c.weldingCost)}</td></tr>`);
        rows.push(`<tr><td>مسامير تثبيت صاج بوردة كاوتش</td><td class="num-col">${fmtNum(g.totalSheetAreaWithWaste, 0)} م²</td><td class="num-col">${fmtMoney(c.fastenersCost)}</td></tr>`);
        rows.push(`<tr><td>أطقم أنكر بولت لتثبيت القواعد</td><td class="num-col">${g.totalColumnsCount} طقم</td><td class="num-col">${fmtMoney(c.anchorsCost)}</td></tr>`);
      }
      if (calc.input.includeGutters && c.guttersCost > 0) {
        rows.push(`<tr><td>مجاري صرف مياه أمطار (مزاريب صاج محمل)</td><td class="num-col">${fmtNum(g.guttersLength, 0)} م.ط</td><td class="num-col">${fmtMoney(c.guttersCost)}</td></tr>`);
      }
    }

    // إجمالي الخامات
    rows.push(`<tr class="subtotal-row"><td>إجمالي تكلفة الخامات (حديد + صاج + مستلزمات)</td><td class="num-col">${fmtNum(g.floorArea, 0)} م²</td><td class="num-col">${fmtMoney(c.materialsSubtotal)}</td></tr>`);

    // المصنعية والإجمالي النهائي (في وضع صاحب الورشة)
    if (!isClient) {
      rows.push(`<tr class="group-row"><td colspan="3">رابعاً: المصنعية والتنفيذ (حساب الورشة)</td></tr>`);
      rows.push(`<tr><td>${escapeHtml(c.laborLabel)}</td><td class="num-col">—</td><td class="num-col">${fmtMoney(c.laborCost)}</td></tr>`);
      if (c.transportCost > 0) {
        rows.push(`<tr><td>النقل والونش والتعتيق للموقع</td><td class="num-col">—</td><td class="num-col">${fmtMoney(c.transportCost)}</td></tr>`);
      }
      rows.push(`<tr class="total-row"><td>الإجمالي النهائي الشامل للعميل</td><td class="num-col">${fmtMoney(c.grandTotalPerM2)}/م²</td><td class="num-col">${fmtMoney(c.grandTotal)}</td></tr>`);
    }

    $('boqTableBody').innerHTML = rows.join('');
  }

  // ---------- بناء عرض السعر الرسمي للطباعة (PDF) ----------
  function buildPrintSheet() {
    const calc = state.lastCalc;
    if (!calc) return;
    const ws = state.workshop;
    const isClient = state.role === 'client';
    const hideLabor = !isClient && state.config.hideLaborDetail;
    const priceState = priceManager.getState();
    const todayAr = window.MizanPrices.formatArabicDate(priceState.date);
    const quoteNumber = `Q-${new Date().getFullYear().toString().slice(-2)}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${Math.floor(100 + Math.random() * 900)}`;

    const displayFinalTotal = isClient ? calc.costs.materialsSubtotal : calc.costs.grandTotal;
    const displayFinalLabel = isClient ? 'ميزانية الخامات التقديرية (بدون مصنعية)' : 'الإجمالي النهائي الشامل (خامات + تصنيع وتركيب)';
    const displayPerM2 = isClient ? calc.costs.materialsPerM2 : calc.costs.grandTotalPerM2;

    const svgElevation = window.MizanBlueprint.renderElevation(calc);

    const rowsHtml = hideLabor
      ? `
        <tr><td>هيكل الجمالون المعدني الكامل (${escapeHtml(calc.input.grade.name)} — ${escapeHtml(calc.input.duty.shortName)})</td><td>${fmtNum(calc.weights.totalSteelTons, 2)} طن (${fmtNum(calc.weights.totalSteelKg, 0)} كجم)</td><td>مشمول بالإجمالي</td></tr>
        <tr><td>تغطية السقف ${calc.geometry.wallSheetAreaWithWaste > 0 ? 'والأجناب ' : ''}(${escapeHtml(calc.input.sheetObj.name)})</td><td>${fmtNum(calc.geometry.totalSheetAreaWithWaste, 0)} م² (~${calc.geometry.estimatedSheetsCount} لوح)</td><td>مشمول بالإجمالي</td></tr>
        <tr><td>المستلزمات والدهان ضد الصدأ ومسكات التثبيت والأنكر بولت</td><td>كامل المشروع</td><td>مشمول بالإجمالي</td></tr>
        <tr><td>التصنيع بالورشة والتوريد والتركيب في الموقع</td><td>كامل المشروع</td><td>مشمول بالإجمالي</td></tr>
        <tr class="print-total-row"><td colspan="2">${displayFinalLabel}</td><td>${fmtMoney(displayFinalTotal)}</td></tr>
      `
      : `
        <tr><td>الأعمدة الرئيسية وأعمدة الرياح (${calc.geometry.totalColumnsCount} عمود)</td><td>${fmtNum(calc.weights.columnsKg, 0)} كجم</td><td>${fmtMoney((calc.weights.columnsKg / 1000) * calc.costs.steelPricePerTon)}</td></tr>
        <tr><td>الجمالونات والمقصات العلوية (${calc.geometry.numFrames} فريم)</td><td>${fmtNum(calc.weights.raftersKg, 0)} كجم</td><td>${fmtMoney((calc.weights.raftersKg / 1000) * calc.costs.steelPricePerTon)}</td></tr>
        <tr><td>المدادات والشدادات والبليتات وهالك التشغيل</td><td>${fmtNum(calc.weights.purlinsTotalKg + calc.weights.bracingKg + calc.weights.platesKg + calc.weights.wasteSteelKg, 0)} كجم</td><td>${fmtMoney(((calc.weights.purlinsTotalKg + calc.weights.bracingKg + calc.weights.platesKg + calc.weights.wasteSteelKg) / 1000) * calc.costs.steelPricePerTon)}</td></tr>
        <tr><td><strong>إجمالي الحديد (${escapeHtml(calc.input.grade.shortName)})</strong></td><td><strong>${fmtNum(calc.weights.totalSteelTons, 2)} طن</strong></td><td><strong>${fmtMoney(calc.costs.steelCost)}</strong></td></tr>
        <tr><td>التغطيات: ${escapeHtml(calc.input.sheetObj.name)} (${escapeHtml(calc.input.wallMode.name)})</td><td>${fmtNum(calc.geometry.totalSheetAreaWithWaste, 0)} م² (~${calc.geometry.estimatedSheetsCount} لوح)</td><td>${fmtMoney(calc.costs.totalSheetCost)}</td></tr>
        ${calc.costs.totalAccessoriesCost > 0 ? `<tr><td>المستلزمات (برايمر وبوية + لحام + مسامير + أنكر بولت${calc.input.includeGutters ? ' + مزاريب' : ''})</td><td>كامل المشروع</td><td>${fmtMoney(calc.costs.totalAccessoriesCost)}</td></tr>` : ''}
        <tr><td><strong>إجمالي تكلفة الخامات</strong></td><td>${fmtNum(calc.geometry.floorArea, 0)} م²</td><td><strong>${fmtMoney(calc.costs.materialsSubtotal)}</strong></td></tr>
        ${!isClient ? `<tr><td>المصنعية (${escapeHtml(calc.costs.laborLabel)})${calc.costs.transportCost > 0 ? ' + النقل والونش' : ''}</td><td>شامل التنفيذ</td><td>${fmtMoney(calc.costs.workshopExtrasTotal)}</td></tr>` : ''}
        <tr class="print-total-row"><td colspan="2">${displayFinalLabel}</td><td>${fmtMoney(displayFinalTotal)}</td></tr>
      `;

    const termsHtml = escapeHtml(ws.notes || DEFAULT_WORKSHOP.notes).replace(/\n/g, '<br/>');

    $('printSheet').innerHTML = `
      <div class="print-header">
        <div>
          <h1 class="print-workshop-name">${escapeHtml(ws.name)}</h1>
          <div style="font-size: 0.86rem; color: #475569; margin-top: 2px;">${escapeHtml(ws.tagline)}</div>
          ${ws.phone ? `<div style="font-size: 0.86rem; font-weight: 700; margin-top: 4px;">تليفون / واتساب: ${escapeHtml(ws.phone)}</div>` : ''}
        </div>
        <div class="print-meta-box">
          <div style="font-size: 1.05rem; font-weight: 900; color: #d97706;">عرض سعر ومقايسة جمالون</div>
          <div>رقم العرض: <strong>${quoteNumber}</strong></div>
          <div>التاريخ: <strong>${todayAr}</strong></div>
          ${state.config.clientName ? `<div>مقدم إلى: <strong>${escapeHtml(state.config.clientName)}</strong></div>` : ''}
        </div>
      </div>

      <div class="print-summary-strip tabular">
        <div class="print-kpi"><span>الأبعاد (طول × عرض × ارتفاع)</span><strong>${calc.input.length} × ${calc.input.width} × ${calc.input.height} م</strong></div>
        <div class="print-kpi"><span>المساحة الأرضية</span><strong>${fmtNum(calc.geometry.floorArea, 0)} م²</strong></div>
        <div class="print-kpi"><span>إجمالي الحديد المطلوب</span><strong>${fmtNum(calc.weights.totalSteelTons, 2)} طن</strong></div>
        <div class="print-kpi"><span>متوسط سعر المتر المربع</span><strong>${fmtMoney(displayPerM2)}</strong></div>
      </div>

      <div class="print-blueprint-wrap">${svgElevation}</div>

      <table class="print-table tabular">
        <thead>
          <tr>
            <th>البند والمواصفات</th>
            <th>الكمية</th>
            <th>القيمة التقديرية</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>

      <div style="font-size: 0.82rem; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; margin-bottom: 10px;">
        <strong>المواصفات الاسترشادية للقطاعات:</strong>
        الأعمدة: ${escapeHtml(calc.sections.columnSpec)} |
        المقصات: ${escapeHtml(calc.sections.trussSpec)} |
        المدادات: ${escapeHtml(calc.sections.purlinSpec)}
      </div>

      <div class="print-terms">
        <strong>الشروط والملاحظات:</strong><br/>
        ${termsHtml}
      </div>
    `;
  }

  // ---------- روابط المشاركة والواتساب ----------
  function buildShareUrl(forClient, includeCurrentSpecs) {
    const base = `${window.location.origin}${window.location.pathname}`;
    const params = new URLSearchParams();
    if (forClient) params.set('mode', 'client');

    if (state.workshop.name && state.workshop.name !== DEFAULT_WORKSHOP.name) {
      params.set('ws', state.workshop.name);
    }
    if (state.workshop.whatsapp) params.set('wa', state.workshop.whatsapp);
    if (state.workshop.phone) params.set('ph', state.workshop.phone);

    // تمرير الأسعار اليدوية للعميل إن كانت معدلة
    const ps = priceManager.getState();
    if (ps.isCustom) {
      params.set('psl', ps.steel.light.price);
      params.set('psm', ps.steel.medium.price);
      params.set('psh', ps.steel.heavy.price);
      params.set('pg4', ps.sheets.galvanized_04.price);
      params.set('pg5', ps.sheets.galvanized_05.price);
      params.set('pc5', ps.sheets.colored_05.price);
      params.set('pc7', ps.sheets.colored_07.price);
      params.set('ps5', ps.sheets.sandwich_5.price);
      params.set('ps10', ps.sheets.sandwich_10.price);
    }

    if (includeCurrentSpecs) {
      const c = state.config;
      params.set('l', c.length);
      params.set('w', c.width);
      params.set('h', c.height);
      params.set('duty', c.trussDuty);
      params.set('grade', c.steelGrade);
      params.set('sheet', c.sheetType);
      params.set('roof', c.roofShape);
      params.set('wall', c.wallCladding);
      if (c.wallCladding === 'partial') params.set('bh', c.brickWallHeight);
      if (c.includeGutters) params.set('gutters', '1');
    }

    return `${base}?${params.toString()}`;
  }

  function sendWhatsAppMessage(asClientRequest) {
    const calc = state.lastCalc;
    if (!calc) return;
    const ws = state.workshop;
    const hideLabor = !asClientRequest && state.config.hideLaborDetail;
    const lines = [];

    if (asClientRequest) {
      lines.push(`السلام عليكم، محتاج تسعيرة نهائية لجمالون بالمقاسات التالية:`);
      lines.push(`📐 الأبعاد: طول ${calc.input.length}م × عرض ${calc.input.width}م × ارتفاع ${calc.input.height}م (مساحة ${fmtNum(calc.geometry.floorArea)} م²)`);
      lines.push(`🏗 نوع الجمالون: ${calc.input.duty.shortName}`);
      lines.push(`⚙ نوع الحديد: ${calc.input.grade.shortName} (تقريباً ${fmtNum(calc.weights.totalSteelTons, 2)} طن)`);
      lines.push(`🧱 نوع الصاج: ${calc.input.sheetObj.name} (${fmtNum(calc.geometry.totalSheetAreaWithWaste, 0)} م²)`);
      lines.push(`🏠 السقف والأجناب: ${calc.input.roofShape.name} — ${calc.input.wallMode.name}`);
      lines.push(`💰 تقدير الخامات بأسعار اليوم: ${fmtMoney(calc.costs.materialsSubtotal)}`);
      if (window.location.protocol.startsWith('http')) {
        lines.push(``);
        lines.push(`🔗 رابط فتح المقاسات مباشرة لإضافة المصنعية:`);
        lines.push(buildShareUrl(false, true));
      }
    } else {
      lines.push(`*عرض سعر جمالون — ${ws.name}*`);
      if (state.config.clientName) lines.push(`👤 العميل: ${state.config.clientName}`);
      lines.push(`📅 التاريخ: ${window.MizanPrices.formatArabicDate(priceManager.getState().date)}`);
      lines.push(`————————————`);
      lines.push(`📐 المقاسات: ${calc.input.length}م طول × ${calc.input.width}م عرض × ${calc.input.height}م ارتفاع (${fmtNum(calc.geometry.floorArea)} م²)`);
      lines.push(`🏗 المواصفات: ${calc.input.duty.shortName} | ${calc.input.grade.shortName}`);
      lines.push(`🏠 السقف والأجناب: ${calc.input.roofShape.name} | ${calc.input.wallMode.name}`);
      lines.push(`⚖ كمية الحديد المقدرة: *${fmtNum(calc.weights.totalSteelTons, 2)} طن* (${fmtNum(calc.weights.totalSteelKg, 0)} كجم)`);
      lines.push(`🧱 كمية الصاج (${calc.input.sheetObj.shortName}): *${fmtNum(calc.geometry.totalSheetAreaWithWaste, 0)} م²* (~${calc.geometry.estimatedSheetsCount} لوح)`);
      lines.push(`————————————`);
      if (!hideLabor) {
        lines.push(`• تكلفة الخامات (حديد + صاج + مستلزمات): ${fmtMoney(calc.costs.materialsSubtotal)}`);
        lines.push(`• المصنعية والتنفيذ${calc.costs.transportCost > 0 ? ' والنقل' : ''}: ${fmtMoney(calc.costs.workshopExtrasTotal)}`);
      }
      lines.push(`✅ *الإجمالي النهائي الشامل: ${fmtMoney(calc.costs.grandTotal)}*`);
      lines.push(`(بمتوسط ${fmtMoney(calc.costs.grandTotalPerM2)} للمتر المربع)`);
      if (ws.phone) lines.push(`📞 للتواصل: ${ws.phone}`);
    }

    const encoded = encodeURIComponent(lines.join('\n'));
    const cleanWa = String(ws.whatsapp || '').replace(/[^\d]/g, '');
    const waUrl = (asClientRequest && cleanWa)
      ? `https://wa.me/${cleanWa}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;

    window.open(waUrl, '_blank', 'noopener');
  }

  // ---------- النوافذ المنبثقة (Modals) ----------
  function openModal(id) {
    const el = $(id);
    if (el) el.classList.add('open');
  }

  function closeModal(id) {
    const el = $(id);
    if (el) el.classList.remove('open');
  }

  function populatePriceModal() {
    const ps = priceManager.getState();
    $('modalPriceSource').textContent = ps.source;
    $('modalPriceUpdatedAt').textContent = `آخر تحديث: ${window.MizanPrices.formatArabicDate(ps.date)} • ${window.MizanPrices.formatArabicTime(ps.updatedAt)}`;
    $('priceSparklineWrap').innerHTML = window.MizanBlueprint.renderSparkline(ps.history);

    $('editSteelLight').value = ps.steel.light.price;
    $('editSteelMedium').value = ps.steel.medium.price;
    $('editSteelHeavy').value = ps.steel.heavy.price;

    $('editSheetGalv04').value = ps.sheets.galvanized_04.price;
    $('editSheetGalv05').value = ps.sheets.galvanized_05.price;
    $('editSheetCol05').value = ps.sheets.colored_05.price;
    $('editSheetCol07').value = ps.sheets.colored_07.price;
    $('editSheetSand5').value = ps.sheets.sandwich_5.price;
    $('editSheetSand10').value = ps.sheets.sandwich_10.price;
  }

  function populateWorkshopModal() {
    $('wsName').value = state.workshop.name;
    $('wsTagline').value = state.workshop.tagline;
    $('wsPhone').value = state.workshop.phone;
    $('wsWhatsapp').value = state.workshop.whatsapp;
    $('wsNotes').value = state.workshop.notes;
  }

  function renderSavedQuotesModal() {
    const container = $('savedQuotesList');
    if (state.savedQuotes.length === 0) {
      container.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 24px 0;">لا توجد مقايسات محفوظة بعد. اضغط "حفظ المقايسة في السجل" لحفظ أي عميل والرجوع إليه لاحقاً.</p>`;
      return;
    }

    container.innerHTML = state.savedQuotes.map((q) => `
      <div class="saved-quote-item">
        <div class="saved-quote-meta">
          <h4>${escapeHtml(q.clientName || 'مقايسة بدون اسم')} — ${q.config.length}×${q.config.width}×${q.config.height} م</h4>
          <p class="tabular">${escapeHtml(q.dateLabel)} • حديد: ${fmtNum(q.steelTons, 2)} طن • الإجمالي: <strong>${fmtMoney(q.grandTotal)}</strong></p>
        </div>
        <div class="saved-quote-actions">
          <button type="button" class="mini-btn" data-load-quote="${q.id}">فتح</button>
          <button type="button" class="mini-btn danger" data-delete-quote="${q.id}">حذف</button>
        </div>
      </div>
    `).join('');
  }

  // ---------- ربط الأحداث ----------
  function bindEvents() {
    // ربط الأبعاد (حقل الرقم + المنزلق)
    function bindDimPair(inputId, rangeId, key) {
      $(inputId).addEventListener('input', (e) => {
        const val = Number(e.target.value);
        if (val > 0) {
          state.config[key] = val;
          $(rangeId).value = Math.min(Number($(rangeId).max), Math.max(Number($(rangeId).min), val));
          recalculateAndRender();
        }
      });
      $(rangeId).addEventListener('input', (e) => {
        const val = Number(e.target.value);
        state.config[key] = val;
        $(inputId).value = val;
        recalculateAndRender();
      });
    }

    bindDimPair('inputLength', 'rangeLength', 'length');
    bindDimPair('inputWidth', 'rangeWidth', 'width');
    bindDimPair('inputHeight', 'rangeHeight', 'height');

    // قوالب المقاسات الجاهزة
    document.querySelectorAll('.preset-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = PRESETS[btn.dataset.preset];
        if (!preset) return;
        Object.assign(state.config, preset);
        const duty = window.MizanCalculator.DUTY_PROFILES[state.config.trussDuty];
        if (duty) {
          state.config.laborPerTon = duty.defaultLaborPerTon;
          state.config.laborSheetPerM2 = state.config.sheetType.startsWith('sandwich') ? 55 : duty.defaultSheetLaborM2;
        }
        syncInputsFromState();
        recalculateAndRender();
        showToast('تم تحميل المقاسات الجاهزة بنجاح');
      });
    });

    // بطاقات الاختيار (نوع الجمالون، نوع الحديد، نوع الصاج، شكل السقف، تقفيل الجوانب)
    document.querySelectorAll('.choice-card').forEach((card) => {
      card.addEventListener('click', () => {
        const group = card.dataset.group;
        const val = card.dataset.value;
        if (!group || !val) return;
        state.config[group] = val;

        // ضبط المصنعية الافتراضية الذكية عند تغيير نوع الجمالون أو الصاج
        if (group === 'trussDuty') {
          const duty = window.MizanCalculator.DUTY_PROFILES[val];
          if (duty) {
            state.config.baySpacing = duty.defaultBay;
            state.config.laborPerTon = duty.defaultLaborPerTon;
            if (!state.config.sheetType.startsWith('sandwich')) {
              state.config.laborSheetPerM2 = duty.defaultSheetLaborM2;
            }
          }
        }
        if (group === 'sheetType') {
          const duty = window.MizanCalculator.DUTY_PROFILES[state.config.trussDuty];
          state.config.laborSheetPerM2 = val.startsWith('sandwich') ? 55 : (duty ? duty.defaultSheetLaborM2 : 32);
        }

        syncInputsFromState();
        recalculateAndRender();
      });
    });

    // خيارات فرعية ومتقدمة
    const numericBindings = [
      ['inputBrickHeight', 'brickWallHeight'],
      ['inputSlope', 'slopePercent'],
      ['inputBaySpacing', 'baySpacing'],
      ['inputSteelWaste', 'steelWastePct'],
      ['inputSheetWaste', 'sheetWastePct'],
      ['inputLaborPerTon', 'laborPerTon'],
      ['inputLaborSheetM2', 'laborSheetPerM2'],
      ['inputLaborLump', 'laborLump'],
      ['inputLaborPercent', 'laborPercent'],
      ['inputTransportCost', 'transportCost']
    ];
    numericBindings.forEach(([id, key]) => {
      $(id).addEventListener('input', (e) => {
        const val = Number(e.target.value);
        if (!Number.isNaN(val) && val >= 0) {
          state.config[key] = val;
          recalculateAndRender();
        }
      });
    });

    $('chkAccessories').addEventListener('change', (e) => {
      state.config.includeAccessories = e.target.checked;
      recalculateAndRender();
    });
    $('chkGutters').addEventListener('change', (e) => {
      state.config.includeGutters = e.target.checked;
      recalculateAndRender();
    });
    $('inputClientName').addEventListener('input', (e) => {
      state.config.clientName = e.target.value;
    });
    $('chkHideLaborDetail').addEventListener('change', (e) => {
      state.config.hideLaborDetail = e.target.checked;
    });

    // تبديل أوضاع حساب المصنعية
    document.querySelectorAll('.labor-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const prevCalc = state.lastCalc;
        state.config.laborMode = btn.dataset.laborMode;
        // عند الانتقال للمقطوعية نضع أقرب رقم للمصنعية المحسوبة حالياً ليسهل على الحداد التعديل
        if (state.config.laborMode === 'lump' && prevCalc && prevCalc.costs.laborCost > 0) {
          state.config.laborLump = Math.round(prevCalc.costs.laborCost / 500) * 500;
          $('inputLaborLump').value = state.config.laborLump;
        }
        syncLaborTabs();
        recalculateAndRender();
      });
    });

    // تبديل عرض المخطط (ثلاثي الأبعاد / مقطع أمامي)
    document.querySelectorAll('.view-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.blueprintView = btn.dataset.view;
        document.querySelectorAll('.view-tab').forEach((t) => t.classList.toggle('active', t === btn));
        recalculateAndRender();
      });
    });

    // تبديل وضع صاحب الورشة / معاينة رابط العميل
    $('btnRoleWorkshop').addEventListener('click', () => {
      state.role = 'workshop';
      applyRoleUI();
      recalculateAndRender();
    });
    $('btnRoleClient').addEventListener('click', () => {
      state.role = 'client';
      applyRoleUI();
      recalculateAndRender();
    });

    // الوضع الليلي / النهاري
    $('btnToggleTheme').addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      $('btnToggleTheme').textContent = next === 'dark' ? '☀️' : '🌙';
      try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch (_) {}
    });

    // تحديث أسعار السوق المصري اليوم
    $('btnRefreshPrices').addEventListener('click', async () => {
      await priceManager.refreshDailyPrices(true);
      showToast('تم تحديث أسعار الحديد والصاج اليوم في السوق المصري ✓');
    });

    // نافذة جدول وتعديل الأسعار
    $('btnOpenPriceModal').addEventListener('click', () => {
      populatePriceModal();
      openModal('modalPrices');
    });
    $('btnSaveManualPrices').addEventListener('click', async () => {
      await priceManager.saveManualPrices({
        steel: {
          light: $('editSteelLight').value,
          medium: $('editSteelMedium').value,
          heavy: $('editSteelHeavy').value
        },
        sheets: {
          galvanized_04: $('editSheetGalv04').value,
          galvanized_05: $('editSheetGalv05').value,
          colored_05: $('editSheetCol05').value,
          colored_07: $('editSheetCol07').value,
          sandwich_5: $('editSheetSand5').value,
          sandwich_10: $('editSheetSand10').value
        }
      });
      closeModal('modalPrices');
      showToast('تم حفظ أسعار اليوم الخاصة بالورشة ✓');
    });
    $('btnResetMarketPrices').addEventListener('click', async () => {
      await priceManager.resetToMarketPrices();
      populatePriceModal();
      showToast('تمت استعادة أسعار السوق المصري التلقائية');
    });

    // نافذة إعدادات الورشة
    $('btnOpenWorkshopSettings').addEventListener('click', () => {
      populateWorkshopModal();
      openModal('modalWorkshop');
    });
    $('btnSaveWorkshop').addEventListener('click', () => {
      saveWorkshop({
        name: $('wsName').value.trim() || DEFAULT_WORKSHOP.name,
        tagline: $('wsTagline').value.trim() || DEFAULT_WORKSHOP.tagline,
        phone: $('wsPhone').value.trim(),
        whatsapp: $('wsWhatsapp').value.trim(),
        notes: $('wsNotes').value.trim() || DEFAULT_WORKSHOP.notes
      });
      applyWorkshopBranding();
      closeModal('modalWorkshop');
      showToast('تم حفظ بيانات الورشة بنجاح ✓');
    });

    // نافذة مشاركة الرابط للعميل
    $('btnOpenShareModal').addEventListener('click', () => {
      $('shareLinkClient').value = buildShareUrl(true, false);
      $('shareLinkPrefilled').value = buildShareUrl(true, true);
      openModal('modalShare');
    });

    document.querySelectorAll('[data-copy-target]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const input = $(btn.dataset.copyTarget);
        if (!input) return;
        try {
          await navigator.clipboard.writeText(input.value);
          showToast('تم نسخ الرابط — يمكنك إرساله للعميل الآن ✓');
        } catch (_) {
          input.select();
          document.execCommand('copy');
          showToast('تم نسخ الرابط ✓');
        }
      });
    });

    // حفظ المقايسة وسجل المقايسات
    $('btnSaveQuote').addEventListener('click', () => {
      const calc = state.lastCalc;
      if (!calc) return;
      const item = {
        id: String(Date.now()),
        dateLabel: window.MizanPrices.formatArabicDate(new Date().toISOString()),
        clientName: state.config.clientName.trim() || `جمالون ${state.config.length}×${state.config.width}م`,
        steelTons: calc.weights.totalSteelTons,
        grandTotal: calc.costs.grandTotal,
        config: JSON.parse(JSON.stringify(state.config))
      };
      state.savedQuotes.unshift(item);
      state.savedQuotes = state.savedQuotes.slice(0, 30);
      persistSavedQuotes();
      showToast('تم حفظ المقايسة في السجل ✓');
    });

    $('btnOpenHistory').addEventListener('click', () => {
      renderSavedQuotesModal();
      openModal('modalHistory');
    });

    $('savedQuotesList').addEventListener('click', (e) => {
      const loadId = e.target.getAttribute('data-load-quote');
      const delId = e.target.getAttribute('data-delete-quote');
      if (loadId) {
        const found = state.savedQuotes.find((q) => q.id === loadId);
        if (found) {
          state.config = Object.assign({}, state.config, found.config);
          syncInputsFromState();
          recalculateAndRender();
          closeModal('modalHistory');
          showToast('تم تحميل المقايسة المحفوظة');
        }
      } else if (delId) {
        state.savedQuotes = state.savedQuotes.filter((q) => q.id !== delId);
        persistSavedQuotes();
        renderSavedQuotesModal();
      }
    });

    // الطباعة والواتساب
    $('btnPrintQuote').addEventListener('click', () => {
      buildPrintSheet();
      window.print();
    });
    $('btnSendWhatsApp').addEventListener('click', () => sendWhatsAppMessage(false));
    $('btnClientSendWa').addEventListener('click', () => sendWhatsAppMessage(true));
    $('btnClientSendWaTop').addEventListener('click', () => sendWhatsAppMessage(true));

    // إغلاق النوافذ المنبثقة
    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
    });
    document.querySelectorAll('.modal-backdrop').forEach((bg) => {
      bg.addEventListener('click', (e) => {
        if (e.target === bg) bg.classList.remove('open');
      });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop.open').forEach((m) => m.classList.remove('open'));
      }
    });
  }

  // ---------- التهيئة عند فتح الصفحة ----------
  function init() {
    // استعادة الثيم المحفوظ
    try {
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        $('btnToggleTheme').textContent = '☀️';
      }
    } catch (_) {}

    applyUrlParams();
    applyWorkshopBranding();
    applyRoleUI();
    updateSavedCount();
    syncInputsFromState();
    bindEvents();

    // الاشتراك في تحديثات الأسعار اليومية
    priceManager.subscribe((priceState, isLoading) => {
      renderMarketPrices(priceState, isLoading);
      recalculateAndRender();
    });

    renderMarketPrices(priceManager.getState(), false);
    recalculateAndRender();

    // فحص وتحديث أسعار اليوم تلقائياً عند الفتح إذا تغير اليوم
    if (priceManager.needsDailyRefresh()) {
      priceManager.refreshDailyPrices(false);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
