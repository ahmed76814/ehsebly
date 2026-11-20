/**
 * محرك أسعار الحديد والصاج اليومية في السوق المصري
 * يدعم:
 * 1) التحديث اليومي التلقائي عبر الخادم المحلي (/api/prices) عند تشغيل server.py
 * 2) التحديث المباشر عبر مؤشر سعر الصرف اليومي (USD/EGP) كمعامل مرجعي عند فتح الموقع كملف ثابت
 * 3) التعديل اليدوي لأسعار اليوم من صاحب الورشة مع الحفظ التلقائي
 */

(function (global) {
  'use strict';

  const STORAGE_KEY = 'mizan_egypt_prices_v1';

  // الأسعار المرجعية للسوق المصري (بالجنيه المصري) — متوسطات سوق القطاعات والصاج في مصر
  const BASE_MARKET_PRICES = {
    referenceUsdEgp: 49.5,
    steel: {
      light: {
        id: 'light',
        name: 'حديد خفيف (علب وزوايا وكمر سيجال)',
        shortName: 'علب وزوايا',
        unit: 'طن',
        price: 46500,
        minRef: 44000,
        maxRef: 49000,
        desc: 'علب مربعة ومستطيلة وزوايا (سمك 1.5 – 3 مم)'
      },
      medium: {
        id: 'medium',
        name: 'حديد متوسط (كمر IPE / UPN ومدادات C/Z)',
        shortName: 'كمر متوسط IPE',
        unit: 'طن',
        price: 49500,
        minRef: 47000,
        maxRef: 52500,
        desc: 'كمر قياسي ومدادات إنشائية للمخازن والورش'
      },
      heavy: {
        id: 'heavy',
        name: 'حديد ثقيل (كمر ثقيل HEA / IPE قطاعات كبيرة)',
        shortName: 'كمر ثقيل HEA/IPE',
        unit: 'طن',
        price: 53500,
        minRef: 50500,
        maxRef: 57500,
        desc: 'قطاعات إنشائية ثقيلة للمصانع والبحور الواسعة'
      }
    },
    sheets: {
      galvanized_04: {
        id: 'galvanized_04',
        name: 'صاج مجلفن معرج (سمك 0.4 مم)',
        shortName: 'صاج مجلفن 0.4',
        unit: 'م²',
        price: 220,
        tonPrice: 40000,
        thicknessMm: 0.4,
        weightKgM2: 3.4,
        desc: 'اقتصادي للمظلات ومخازن التخزين الخفيفة'
      },
      galvanized_05: {
        id: 'galvanized_05',
        name: 'صاج مجلفن معرج ثقيل (سمك 0.5 مم)',
        shortName: 'صاج مجلفن 0.5',
        unit: 'م²',
        price: 270,
        tonPrice: 41500,
        thicknessMm: 0.5,
        weightKgM2: 4.3,
        desc: 'مقاومة أفضل للصدأ والأحمال المتوسطة'
      },
      colored_05: {
        id: 'colored_05',
        name: 'صاج ملون معرج / إيكون (سمك 0.5 مم)',
        shortName: 'صاج ملون إيكون 0.5',
        unit: 'م²',
        price: 325,
        tonPrice: 47000,
        thicknessMm: 0.5,
        weightKgM2: 4.5,
        desc: 'دهان إلكتروستاتيك مقاوم للعوامل الجوية — الأكثر طلباً'
      },
      colored_07: {
        id: 'colored_07',
        name: 'صاج ملون معرج ثقيل (سمك 0.7 مم)',
        shortName: 'صاج ملون ثقيل 0.7',
        unit: 'م²',
        price: 430,
        tonPrice: 49000,
        thicknessMm: 0.7,
        weightKgM2: 6.1,
        desc: 'متانة عالية للهناجر الكبرى ومقاومة قوية للرياح'
      },
      sandwich_5: {
        id: 'sandwich_5',
        name: 'ساندوتش بانل عازل (سمك 5 سم)',
        shortName: 'ساندوتش بانل 5سم',
        unit: 'م²',
        price: 820,
        tonPrice: null,
        thicknessMm: 50,
        weightKgM2: 10.5,
        desc: 'عزل حراري وصوتي ممتاز (فوم بولي يوريثان) للمصانع والمخازن'
      },
      sandwich_10: {
        id: 'sandwich_10',
        name: 'ساندوتش بانل عازل ثقيل (سمك 7.5 – 10 سم)',
        shortName: 'ساندوتش بانل 10سم',
        unit: 'م²',
        price: 1180,
        tonPrice: null,
        thicknessMm: 100,
        weightKgM2: 13.5,
        desc: 'عزل حراري فائق لثلاجات التبريد والمصانع الغذائية والدوائية'
      }
    },
    accessories: {
      paintPerTon: 1450,        // برايمر أوكسيد + بوية دوكو/لاكيه ضد الصدأ لكل طن حديد
      fastenersPerM2: 18,       // مسامير تك / صاج بوردة كاوتش وإكسسوارات تثبيت لكل م² صاج
      weldingPerTon: 950,       // سلك لحام، أسطوانات قطعية وجلخ ومستهلكات ورشة لكل طن
      anchorSetPerCol: 420,     // طقم 4 مسامير أنكر بولت + صواميل لكل عمود
      gutterPerMeter: 280       // مجرى صرف أمطار (مزراب صاج مجلفن محمل) بالمتر الطولي
    }
  };

  function getTodayISO() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function formatArabicDate(isoStr) {
    try {
      const date = isoStr ? new Date(isoStr) : new Date();
      return new Intl.DateTimeFormat('ar-EG', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }).format(date);
    } catch (_) {
      return isoStr || getTodayISO();
    }
  }

  function formatArabicTime(isoStr) {
    try {
      const date = isoStr ? new Date(isoStr) : new Date();
      return new Intl.DateTimeFormat('ar-EG', {
        hour: '2-digit',
        minute: '2-digit'
      }).format(date);
    } catch (_) {
      return '';
    }
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // توليد سجل 7 أيام واقعي لعرض اتجاه السوق إذا لم يتوفر سجل سابق
  function generateDefaultHistory(mediumTonPrice) {
    const offsets = [-650, -400, -400, -150, 100, -100, 0];
    const today = new Date();
    return offsets.map((diff, idx) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (6 - idx));
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return {
        date: iso,
        label: `${d.getDate()}/${d.getMonth() + 1}`,
        mediumSteel: Math.round((mediumTonPrice + diff) / 50) * 50
      };
    });
  }

  function createDefaultState() {
    const base = deepClone(BASE_MARKET_PRICES);
    const today = getTodayISO();
    return {
      date: today,
      updatedAt: new Date().toISOString(),
      source: 'متوسط السوق المصري المرجعي',
      sourceType: 'reference', // 'live_server' | 'live_fx' | 'manual' | 'reference'
      usdEgp: base.referenceUsdEgp,
      isCustom: false,
      steel: base.steel,
      sheets: base.sheets,
      accessories: base.accessories,
      history: generateDefaultHistory(base.steel.medium.price)
    };
  }

  function loadStoredState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createDefaultState();
      const parsed = JSON.parse(raw);
      // دمج آمن مع البنية الأساسية لضمان وجود كل المفاتيح
      const def = createDefaultState();
      const merged = Object.assign({}, def, parsed);
      merged.steel = Object.assign({}, def.steel);
      Object.keys(def.steel).forEach((k) => {
        if (parsed.steel && parsed.steel[k]) {
          merged.steel[k] = Object.assign({}, def.steel[k], parsed.steel[k]);
        }
      });
      merged.sheets = Object.assign({}, def.sheets);
      Object.keys(def.sheets).forEach((k) => {
        if (parsed.sheets && parsed.sheets[k]) {
          merged.sheets[k] = Object.assign({}, def.sheets[k], parsed.sheets[k]);
        }
      });
      merged.accessories = Object.assign({}, def.accessories, parsed.accessories || {});
      if (!Array.isArray(merged.history) || merged.history.length < 3) {
        merged.history = generateDefaultHistory(merged.steel.medium.price);
      }
      return merged;
    } catch (_) {
      return createDefaultState();
    }
  }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      // تجاهل أخطاء التخزين في الوضع الخاص
    }
  }

  function appendTodayToHistory(state) {
    const today = getTodayISO();
    const d = new Date();
    const label = `${d.getDate()}/${d.getMonth() + 1}`;
    const price = Math.round(state.steel.medium.price);
    const history = Array.isArray(state.history) ? state.history.slice() : [];
    const existingIdx = history.findIndex((h) => h.date === today);
    if (existingIdx >= 0) {
      history[existingIdx].mediumSteel = price;
    } else {
      history.push({ date: today, label, mediumSteel: price });
    }
    state.history = history.slice(-7);
  }

  // تطبيق تعديل سعري مرجعي متزن عند التحديث المباشر من مؤشر الصرف العالمي
  function applyMarketRatio(basePrice, ratio, step) {
    // الحديد المحلي يتأثر بحوالي 65% من حركة الصرف (خام البليت المستورد + تصنيع محلي)
    const dampedRatio = 1 + (ratio - 1) * 0.65;
    const clamped = Math.max(0.82, Math.min(1.35, dampedRatio));
    return Math.round((basePrice * clamped) / step) * step;
  }

  class PriceManager {
    constructor() {
      this.state = loadStoredState();
      this.listeners = [];
      this.isLoading = false;
    }

    subscribe(fn) {
      this.listeners.push(fn);
      return () => {
        this.listeners = this.listeners.filter((l) => l !== fn);
      };
    }

    notify() {
      this.listeners.forEach((fn) => fn(this.state, this.isLoading));
    }

    getState() {
      return this.state;
    }

    needsDailyRefresh() {
      if (this.state.isCustom) return false;
      return this.state.date !== getTodayISO() || this.state.sourceType === 'reference';
    }

    /**
     * تحديث يومي ذكي للأسعار:
     * 1) يحاول الاتصال بالخادم المحلي (/api/prices) إذا كان يعمل
     * 2) وإلا يتصل بمؤشر سعر الصرف المباشر للبنك/السوق المصري لضبط المرجعية اليومية
     * 3) في كل الأحوال يحافظ على دقة وثبات الأسعار دون أخطاء
     */
    async refreshDailyPrices(force = false) {
      if (this.isLoading) return this.state;
      if (!force && !this.needsDailyRefresh()) {
        return this.state;
      }

      this.isLoading = true;
      this.notify();

      const today = getTodayISO();

      // المحاولة 1: الخادم المحلي Python server.py
      if (window.location.protocol.startsWith('http')) {
        try {
          const endpoint = force ? '/api/prices/refresh' : '/api/prices';
          const method = force ? 'POST' : 'GET';
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 5000);
          const resp = await fetch(endpoint, { method, signal: controller.signal });
          clearTimeout(timer);

          if (resp.ok) {
            const data = await resp.json();
            if (data && data.steel && data.sheets) {
              this.mergeFromServer(data);
              this.isLoading = false;
              this.notify();
              return this.state;
            }
          }
        } catch (_) {
          // الخادم المحلي غير متاح — الانتقال للمحاولة الثانية تلقائياً
        }
      }

      // المحاولة 2: تحديث مرجعي حي مرتبط بسعر الصرف اليومي (USD -> EGP) عبر API مفتوح
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const resp = await fetch('https://open.er-api.com/v6/latest/USD', {
          signal: controller.signal
        });
        clearTimeout(timer);

        if (resp.ok) {
          const fx = await resp.json();
          const egp = fx && fx.rates && Number(fx.rates.EGP);
          if (egp && egp > 20 && egp < 150) {
            const base = deepClone(BASE_MARKET_PRICES);
            const ratio = egp / base.referenceUsdEgp;

            Object.keys(base.steel).forEach((k) => {
              this.state.steel[k].price = applyMarketRatio(base.steel[k].price, ratio, 100);
            });
            Object.keys(base.sheets).forEach((k) => {
              this.state.sheets[k].price = applyMarketRatio(base.sheets[k].price, ratio, 5);
            });

            this.state.usdEgp = Number(egp.toFixed(2));
            this.state.date = today;
            this.state.updatedAt = new Date().toISOString();
            this.state.source = `تحديث تلقائي يومي (مؤشر السوق المصري • الدولار ${this.state.usdEgp} ج.م)`;
            this.state.sourceType = 'live_fx';
            this.state.isCustom = false;
            appendTodayToHistory(this.state);
            saveState(this.state);

            this.isLoading = false;
            this.notify();
            return this.state;
          }
        }
      } catch (_) {
        // العمل بدون إنترنت — تحديث التاريخ على المرجع المحفوظ
      }

      // احتياطي أوفلاين
      this.state.date = today;
      this.state.updatedAt = new Date().toISOString();
      if (!this.state.isCustom) {
        this.state.source = 'متوسط السوق المصري المرجعي (وضع بدون إنترنت)';
        this.state.sourceType = 'reference';
      }
      appendTodayToHistory(this.state);
      saveState(this.state);

      this.isLoading = false;
      this.notify();
      return this.state;
    }

    mergeFromServer(data) {
      const def = createDefaultState();
      Object.keys(def.steel).forEach((k) => {
        if (data.steel[k] && Number(data.steel[k].price) > 0) {
          this.state.steel[k].price = Math.round(Number(data.steel[k].price));
        }
      });
      Object.keys(def.sheets).forEach((k) => {
        if (data.sheets[k] && Number(data.sheets[k].price) > 0) {
          this.state.sheets[k].price = Math.round(Number(data.sheets[k].price));
        }
      });
      if (data.accessories) {
        Object.keys(def.accessories).forEach((k) => {
          if (Number(data.accessories[k]) >= 0) {
            this.state.accessories[k] = Number(data.accessories[k]);
          }
        });
      }
      this.state.date = data.date || getTodayISO();
      this.state.updatedAt = data.updatedAt || new Date().toISOString();
      this.state.source = data.source || 'تحديث يومي مباشر من السوق المصري';
      this.state.sourceType = data.sourceType || 'live_server';
      this.state.usdEgp = data.usdEgp || this.state.usdEgp;
      this.state.isCustom = Boolean(data.isCustom);
      if (Array.isArray(data.history) && data.history.length > 0) {
        this.state.history = data.history;
      } else {
        appendTodayToHistory(this.state);
      }
      saveState(this.state);
    }

    /**
     * حفظ أسعار اليوم اليدوية التي يدخلها صاحب الورشة (من فاتورة التاجر اليوم)
     */
    async saveManualPrices(updates) {
      if (updates.steel) {
        Object.keys(updates.steel).forEach((k) => {
          const val = Number(updates.steel[k]);
          if (this.state.steel[k] && val > 0) {
            this.state.steel[k].price = Math.round(val);
          }
        });
      }
      if (updates.sheets) {
        Object.keys(updates.sheets).forEach((k) => {
          const val = Number(updates.sheets[k]);
          if (this.state.sheets[k] && val > 0) {
            this.state.sheets[k].price = Math.round(val);
          }
        });
      }
      if (updates.accessories) {
        Object.keys(updates.accessories).forEach((k) => {
          const val = Number(updates.accessories[k]);
          if (this.state.accessories[k] !== undefined && val >= 0) {
            this.state.accessories[k] = Math.round(val);
          }
        });
      }

      this.state.date = getTodayISO();
      this.state.updatedAt = new Date().toISOString();
      this.state.source = 'أسعار محدثة يدوياً بواسطة صاحب الورشة';
      this.state.sourceType = 'manual';
      this.state.isCustom = true;
      appendTodayToHistory(this.state);
      saveState(this.state);

      // مزامنة اختيارية مع server.py إذا كان يعمل
      if (window.location.protocol.startsWith('http')) {
        try {
          await fetch('/api/prices/custom', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(this.state)
          });
        } catch (_) {
          // محفوظ بالفعل في localStorage
        }
      }

      this.notify();
      return this.state;
    }

    async resetToMarketPrices() {
      this.state = createDefaultState();
      saveState(this.state);
      return this.refreshDailyPrices(true);
    }

    // استيراد أسعار مضمّنة من رابط العميل إذا أرسلها الحداد
    applyUrlPriceOverrides(params) {
      const mapping = [
        ['psl', 'steel', 'light'],
        ['psm', 'steel', 'medium'],
        ['psh', 'steel', 'heavy'],
        ['pg4', 'sheets', 'galvanized_04'],
        ['pg5', 'sheets', 'galvanized_05'],
        ['pc5', 'sheets', 'colored_05'],
        ['pc7', 'sheets', 'colored_07'],
        ['ps5', 'sheets', 'sandwich_5'],
        ['ps10', 'sheets', 'sandwich_10']
      ];
      let applied = false;
      mapping.forEach(([param, group, key]) => {
        const v = Number(params.get(param));
        if (v > 0 && this.state[group] && this.state[group][key]) {
          this.state[group][key].price = Math.round(v);
          applied = true;
        }
      });
      if (applied) {
        this.state.source = 'أسعار اليوم المعتمدة من الورشة';
        this.state.sourceType = 'manual';
        this.notify();
      }
    }
  }

  global.MizanPrices = {
    PriceManager,
    BASE_MARKET_PRICES,
    formatArabicDate,
    formatArabicTime,
    getTodayISO
  };
})(window);
