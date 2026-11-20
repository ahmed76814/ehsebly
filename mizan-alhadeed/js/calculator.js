/**
 * المحرك الهندسي لحساب كميات الحديد والصاج وميزانية الجمالونات والهناجر
 * مبني على معايير وتجارب ورش الحدادة والإنشاءات المعدنية في السوق المصري
 */

(function (global) {
  'use strict';

  const DUTY_PROFILES = {
    light: {
      id: 'light',
      name: 'جمالون خفيف (تخزين / مظلات)',
      shortName: 'خفيف للتخزين',
      desc: 'مناسب للمظلات، الجراجات، مخازن التخزين الخفيفة والمزارع',
      factor: 0.78,
      defaultBay: 5.0,
      defaultLaborPerTon: 11500,
      defaultSheetLaborM2: 25
    },
    medium: {
      id: 'medium',
      name: 'جمالون متوسط (ورش / مخازن تجارية)',
      shortName: 'متوسط للورش والمخازن',
      desc: 'الأكثر شيوعاً للمخازن التجارية والورش والمعارض والهناجر القياسية',
      factor: 1.0,
      defaultBay: 5.0,
      defaultLaborPerTon: 14500,
      defaultSheetLaborM2: 32
    },
    heavy: {
      id: 'heavy',
      name: 'جمالون ثقيل (مصانع / أحمال عالية)',
      shortName: 'ثقيل للمصانع والهناجر الكبرى',
      desc: 'للمصانع والبحور الواسعة والأحمال الثقيلة أو التجهيز لونش علوي',
      factor: 1.34,
      defaultBay: 6.0,
      defaultLaborPerTon: 17500,
      defaultSheetLaborM2: 45
    }
  };

  const STEEL_GRADE_PROFILES = {
    light: {
      id: 'light',
      name: 'حديد خفيف (علب وزوايا)',
      shortName: 'حديد خفيف (علب وزوايا)',
      desc: 'علب مربعة ومستطيلة + زوايا + كمر سيجال خفيف — أوفر في الميزانية',
      factor: 0.85,
      purlinKgM: 4.4,
      girtKgM: 3.8
    },
    medium: {
      id: 'medium',
      name: 'حديد متوسط (كمر IPE / UPN)',
      shortName: 'حديد متوسط (كمر قياسي)',
      desc: 'كمر قياسي IPE/UPN للأعمدة والمقصات + مدادات C/Z — توازن ممتاز',
      factor: 1.0,
      purlinKgM: 5.8,
      girtKgM: 4.9
    },
    heavy: {
      id: 'heavy',
      name: 'حديد ثقيل (كمر ثقيل HEA / IPE)',
      shortName: 'حديد ثقيل (قطاعات إنشائية محملة)',
      desc: 'قطاعات كمر ثقيلة محملة تتحمل الرياح والأحمال لسنوات طويلة',
      factor: 1.28,
      purlinKgM: 7.8,
      girtKgM: 6.4
    }
  };

  const ROOF_SHAPES = {
    gable: {
      id: 'gable',
      name: 'جمالون هرمي (ميلين)',
      factor: 1.0,
      desc: 'الشكل الكلاسيكي لتصريف الأمطار من الجانبين'
    },
    mono: {
      id: 'mono',
      name: 'ميل واحد (شطف واحد)',
      factor: 0.94,
      desc: 'مثالي للهناجر الملاصقة لمبنى قائم أو المساحات المحدودة'
    },
    arched: {
      id: 'arched',
      name: 'جمالون مقوس (قبة)',
      factor: 1.07,
      desc: 'شكل مقوس يعطي ارتفاعاً إضافياً ومتانة عالية ضد الرياح'
    }
  };

  const WALL_CLADDING = {
    none: {
      id: 'none',
      name: 'سقف فقط (بدون أجناب صاج)',
      desc: 'مظلة مفتوحة أو سيتم بناء الجوانب بالكامل بالطوب'
    },
    partial: {
      id: 'partial',
      name: 'تقفيل جزئي (فوق مباني طوب)',
      desc: 'تغطية الجزء العلوي بالصاج فوق سور طوب بارتفاع محدد'
    },
    full: {
      id: 'full',
      name: 'تقفيل كامل للأجناب بالصاج',
      desc: 'هنجر مقفول بالكامل صاج من جميع الجوانب (مع حساب فتحة البوابة)'
    }
  };

  /**
   * اقتراح قطاعات الحديد الاسترشادية المناسبة للمقاس والنوع
   */
  function recommendSections(config, colKgPerM, rafterKgPerM) {
    const { steelGrade, trussDuty, width } = config;

    let columnSpec, trussSpec, purlinSpec, basePlateSpec;

    if (steelGrade === 'light' && trussDuty === 'light' && width <= 12) {
      columnSpec = 'علب 10×10 سم (سمك 3 مم) أو كمر IPE 140';
      trussSpec = 'جمالون زوايا مزدوجة 50×50×5 مم أو علب 6×12 سم';
      purlinSpec = 'علب 4×8 سم (سمك 2 مم) كل 1.35 م';
      basePlateSpec = 'بليت 25×25 سم (سمك 10 مم) + 4 أنكر بولت 16 مم';
    } else if (colKgPerM < 21) {
      columnSpec = 'كمر IPE 160 / 180 أو علب 12×12 سم (سمك 4 مم)';
      trussSpec = 'مقصات زوايا 60×60×6 مم أو كمر IPE 160';
      purlinSpec = 'علب 5×10 سم (سمك 2 مم) أو مدادات C120';
      basePlateSpec = 'بليت 30×30 سم (سمك 12 مم) + 4 أنكر بولت 16 مم';
    } else if (colKgPerM < 33) {
      columnSpec = 'كمر IPE 200 / 220 (أو IPE 240 للبحور الواسعة)';
      trussSpec = 'كمر IPE 180 / 200 أو جمالون زوايا مزدوجة 70×70×7 مم';
      purlinSpec = 'مدادات صاج مجلفن C140 / Z140 (سمك 2 مم)';
      basePlateSpec = 'بليت 35×35 سم (سمك 14 – 16 مم) + 4 أنكر بولت 20 مم';
    } else if (colKgPerM < 46) {
      columnSpec = 'كمر IPE 270 / 300 أو كمر HEA 200';
      trussSpec = 'كمر IPE 240 / 270 أو جمالون شبكي ثقيل زوايا 80×80×8 مم';
      purlinSpec = 'مدادات Z160 / C160 (سمك 2.5 مم)';
      basePlateSpec = 'بليت 40×40 سم (سمك 18 – 20 مم) + 6 أنكر بولت 22 مم';
    } else {
      columnSpec = 'كمر ثقيل HEA 220 / 240 أو IPE 330 / 360 (أو قطاعات مجمعة Built-up)';
      trussSpec = 'كمر IPE 300 / 330 أو جمالون ثقيل قطاعات Built-up / زوايا 100×100×10';
      purlinSpec = 'مدادات ثقيلة Z180 / Z200 (سمك 2.5 – 3 مم)';
      basePlateSpec = 'بليت 45×45 سم (سمك 20 – 25 مم) + 6 – 8 أنكر بولت 24 مم';
    }

    return { columnSpec, trussSpec, purlinSpec, basePlateSpec };
  }

  /**
   * الدالة الرئيسية لحساب الميزانية والكميات الكاملة للجمالون
   */
  function calculateTrussBudget(rawConfig, priceState) {
    // تنظيف وضبط المدخلات ضمن حدود واقعية آمنة
    const length = Math.max(4, Math.min(200, Number(rawConfig.length) || 20));
    const width = Math.max(3, Math.min(80, Number(rawConfig.width) || 12));
    const height = Math.max(2.5, Math.min(20, Number(rawConfig.height) || 6));

    const duty = DUTY_PROFILES[rawConfig.trussDuty] || DUTY_PROFILES.medium;
    const grade = STEEL_GRADE_PROFILES[rawConfig.steelGrade] || STEEL_GRADE_PROFILES.medium;
    const roofShape = ROOF_SHAPES[rawConfig.roofShape] || ROOF_SHAPES.gable;
    const wallMode = WALL_CLADDING[rawConfig.wallCladding] || WALL_CLADDING.none;

    const sheetObj = (priceState && priceState.sheets && priceState.sheets[rawConfig.sheetType])
      || (priceState && priceState.sheets && priceState.sheets.colored_05)
      || { id: 'colored_05', name: 'صاج ملون إيكون 0.5', price: 325, weightKgM2: 4.5 };

    const steelPriceObj = (priceState && priceState.steel && priceState.steel[grade.id])
      || { id: 'medium', name: 'حديد متوسط', price: 49500 };

    const accessoriesPrices = (priceState && priceState.accessories) || {
      paintPerTon: 1450,
      fastenersPerM2: 18,
      weldingPerTon: 950,
      anchorSetPerCol: 420,
      gutterPerMeter: 280
    };

    const slopePercent = Math.max(5, Math.min(35, Number(rawConfig.slopePercent) || 12));
    const baySpacingTarget = Math.max(3, Math.min(8, Number(rawConfig.baySpacing) || duty.defaultBay));
    const steelWastePct = Math.max(0, Math.min(15, rawConfig.steelWastePct !== undefined ? Number(rawConfig.steelWastePct) : 5));
    const sheetWastePct = Math.max(0, Math.min(20, rawConfig.sheetWastePct !== undefined ? Number(rawConfig.sheetWastePct) : 8));
    const brickWallHeight = Math.max(0.5, Math.min(height - 0.5, Number(rawConfig.brickWallHeight) || 3));
    const includeAccessories = rawConfig.includeAccessories !== false;
    const includeGutters = Boolean(rawConfig.includeGutters);

    // 1. الحسابات الهندسية للأبعاد والأسطح
    const floorArea = length * width;
    let ridgeRise = 0;
    let slopedWidth = width;
    let gableTrianglesArea = 0;

    if (roofShape.id === 'gable') {
      ridgeRise = (width / 2) * (slopePercent / 100);
      slopedWidth = 2 * Math.sqrt(Math.pow(width / 2, 2) + Math.pow(ridgeRise, 2));
      // مثلثين في الواجهة الأمامية والخلفية: 2 * (0.5 * W * rise) = W * rise
      gableTrianglesArea = width * ridgeRise;
    } else if (roofShape.id === 'mono') {
      ridgeRise = width * (slopePercent / 100);
      slopedWidth = Math.sqrt(Math.pow(width, 2) + Math.pow(ridgeRise, 2));
      gableTrianglesArea = width * ridgeRise;
    } else {
      // مقوس (Arched)
      ridgeRise = Math.max(1.2, width * 0.18);
      // طول القوس التقريبي لقوس دائري بارتفاع 0.18 من البحر
      slopedWidth = width * 1.11;
      gableTrianglesArea = 2 * (0.67 * width * ridgeRise);
    }

    const peakHeight = height + ridgeRise;

    // رفرفة السقف 30 سم من كل جهة لتصريف الأمطار
    const roofOverhang = 0.6;
    const netRoofArea = (length + 0.4) * (slopedWidth + roofOverhang);

    // حساب مساحة صاج الجوانب
    const perimeter = 2 * (length + width);
    let netWallSheetArea = 0;
    let coveredWallHeight = 0;
    let gateDeduction = 0;

    if (wallMode.id === 'partial') {
      coveredWallHeight = Math.max(0, height - brickWallHeight);
      netWallSheetArea = perimeter * coveredWallHeight + gableTrianglesArea;
    } else if (wallMode.id === 'full') {
      coveredWallHeight = height;
      // خصم فتحة بوابة دخول رئيسية تقريبية (مثلاً 4×4م للمساحات الكبيرة أو 3×3م للصغيرة)
      const gateW = Math.min(4.5, width * 0.35);
      const gateH = Math.min(4.5, height * 0.8);
      gateDeduction = gateW * gateH;
      netWallSheetArea = Math.max(0, perimeter * height + gableTrianglesArea - gateDeduction);
    }

    const totalNetSheetArea = netRoofArea + netWallSheetArea;
    const totalSheetAreaWithWaste = totalNetSheetArea * (1 + sheetWastePct / 100);
    // اللوح القياسي في السوق المصري: عرض صافي ~1 متر × طول 6 متر = 6 م²
    const estimatedSheetsCount = Math.ceil(totalSheetAreaWithWaste / 6);

    // 2. حساب عدد الفريمات والأعمدة والمدادات
    const numBays = Math.max(1, Math.round(length / baySpacingTarget));
    const actualBaySpacing = length / numBays;
    const numFrames = numBays + 1;
    const mainColumnsCount = numFrames * 2;

    // أعمدة رياح إضافية في الواجهتين إذا كان البحر أكبر من 10م والهنجر مقفول أجناب
    const windColumnsPerEnd = (wallMode.id !== 'none' && width > 10)
      ? Math.max(1, Math.floor(width / 6) - 1)
      : 0;
    const totalWindColumns = windColumnsPerEnd * 2;
    const totalColumnsCount = mainColumnsCount + totalWindColumns;

    // 3. حساب أوزان الحديد لكل عنصر بالكيلوجرام
    const intensity = duty.factor * grade.factor;
    const spanMult = 0.72 + (width / 18) * 0.48 + Math.pow(Math.max(0, width - 16) / 20, 1.35) * 0.45;
    const heightMult = 0.88 + (height / 6) * 0.14;
    // معامل إضافي بسيط للأحمال الميتة إذا كان السقف ساندوتش بانل ثقيل
    const sandwichLoadMult = sheetObj.id.startsWith('sandwich') ? 1.06 : 1.0;
    // معامل المسافة بين الأعمدة (الباكية الأوسع تحمل وزناً أكبر لكل فريم)
    const bayLoadMult = Math.pow(actualBaySpacing / 5.0, 0.55);

    // أ) الأعمدة الرئيسية
    const colKgPerM = 25.0 * intensity * (0.55 + 0.45 * spanMult) * heightMult * bayLoadMult;
    const mainColumnsKg = mainColumnsCount * height * colKgPerM;
    const windColAvgHeight = height + ridgeRise * 0.65;
    const windColumnsKg = totalWindColumns * windColAvgHeight * (colKgPerM * 0.55);
    const columnsKg = mainColumnsKg + windColumnsKg;

    // ب) الجمالونات / المقصات العلوية (Rafters / Trusses)
    const rafterKgPerM = 34.0 * intensity * spanMult * roofShape.factor * sandwichLoadMult * bayLoadMult;
    const raftersKg = numFrames * slopedWidth * rafterKgPerM;

    // ج) مدادات السقف (Purlins)
    const purlinSpacing = sheetObj.id.startsWith('sandwich') ? 1.5 : 1.35;
    const purlinLines = Math.ceil(slopedWidth / purlinSpacing) + 1;
    const roofPurlinsLength = purlinLines * length;
    const roofPurlinsKg = roofPurlinsLength * grade.purlinKgM * sandwichLoadMult;

    // د) مدادات الأجناب (Side Girts) إذا وجد تقفيل صاج
    let sideGirtsKg = 0;
    let sideGirtLines = 0;
    if (wallMode.id !== 'none' && coveredWallHeight > 0.5) {
      sideGirtLines = Math.max(2, Math.ceil(coveredWallHeight / 1.45));
      sideGirtsKg = sideGirtLines * perimeter * grade.girtKgM;
    }
    const purlinsTotalKg = roofPurlinsKg + sideGirtsKg;

    // هـ) الشدادات والشكالات ومقاومة الرياح (Bracing & Eave Struts)
    const primaryStructureKg = columnsKg + raftersKg;
    const bracingPct = duty.id === 'heavy' ? 0.125 : duty.id === 'medium' ? 0.11 : 0.095;
    const bracingKg = primaryStructureKg * bracingPct;

    // و) البليتات والقواعد والاستيفنرات والوصلات (Base Plates & Gussets)
    const platesPct = duty.id === 'heavy' ? 0.105 : duty.id === 'medium' ? 0.095 : 0.085;
    const platesKg = primaryStructureKg * platesPct;

    // صافي الحديد + نسبة الهالك
    const netSteelKg = columnsKg + raftersKg + purlinsTotalKg + bracingKg + platesKg;
    const wasteSteelKg = netSteelKg * (steelWastePct / 100);
    const totalSteelKg = netSteelKg + wasteSteelKg;
    const totalSteelTons = totalSteelKg / 1000;
    const steelKgPerM2 = totalSteelKg / floorArea;

    // وزن الصاج التقريبي (للعلم والنقل)
    const totalSheetWeightKg = totalSheetAreaWithWaste * (sheetObj.weightKgM2 || 4.5);

    // 4. حساب تكاليف الخامات (بالجنيه المصري)
    const steelPricePerTon = Number(steelPriceObj.price) || 49500;
    const steelCost = totalSteelTons * steelPricePerTon;

    const sheetPricePerM2 = Number(sheetObj.price) || 325;
    const roofSheetAreaWithWaste = netRoofArea * (1 + sheetWastePct / 100);
    const wallSheetAreaWithWaste = netWallSheetArea * (1 + sheetWastePct / 100);
    const roofSheetCost = roofSheetAreaWithWaste * sheetPricePerM2;
    const wallSheetCost = wallSheetAreaWithWaste * sheetPricePerM2;
    const totalSheetCost = roofSheetCost + wallSheetCost;

    // الإكسسوارات والمستلزمات (دهان + مسامير + سلك لحام + أنكر بولت + مزاريب)
    let paintCost = 0;
    let weldingCost = 0;
    let fastenersCost = 0;
    let anchorsCost = 0;
    let guttersCost = 0;
    let guttersLength = 0;

    if (includeAccessories) {
      paintCost = totalSteelTons * accessoriesPrices.paintPerTon;
      weldingCost = totalSteelTons * accessoriesPrices.weldingPerTon;
      fastenersCost = totalSheetAreaWithWaste * accessoriesPrices.fastenersPerM2;
      anchorsCost = totalColumnsCount * accessoriesPrices.anchorSetPerCol;
    }

    if (includeGutters) {
      guttersLength = roofShape.id === 'mono' ? length : length * 2;
      guttersCost = guttersLength * accessoriesPrices.gutterPerMeter;
    }

    const totalAccessoriesCost = paintCost + weldingCost + fastenersCost + anchorsCost + guttersCost;

    // إجمالي ميزانية الخامات (بدون المصنعية)
    const materialsSubtotal = steelCost + totalSheetCost + totalAccessoriesCost;

    // 5. حساب المصنعية (الجزء الخاص بصاحب الورشة / الحداد)
    const laborMode = rawConfig.laborMode || 'perUnit'; // 'lump' | 'perUnit' | 'percent'
    const laborLump = Math.max(0, Number(rawConfig.laborLump) || 0);
    const laborPerTon = Math.max(0, rawConfig.laborPerTon !== undefined ? Number(rawConfig.laborPerTon) : duty.defaultLaborPerTon);
    const laborSheetPerM2 = Math.max(0, rawConfig.laborSheetPerM2 !== undefined
      ? Number(rawConfig.laborSheetPerM2)
      : (sheetObj.id.startsWith('sandwich') ? 55 : duty.defaultSheetLaborM2));
    const laborPercent = Math.max(0, Math.min(200, Number(rawConfig.laborPercent) || 22));
    const transportCost = Math.max(0, Number(rawConfig.transportCost) || 0);

    let steelLaborCost = 0;
    let sheetLaborCost = 0;
    let laborCost = 0;
    let laborLabel = '';

    if (laborMode === 'lump') {
      laborCost = laborLump;
      laborLabel = 'مصنعية مقطوعية شاملة';
    } else if (laborMode === 'percent') {
      laborCost = materialsSubtotal * (laborPercent / 100);
      laborLabel = `مصنعية بنسبة ${laborPercent}% من الخامات`;
    } else {
      steelLaborCost = totalSteelTons * laborPerTon;
      sheetLaborCost = totalSheetAreaWithWaste * laborSheetPerM2;
      laborCost = steelLaborCost + sheetLaborCost;
      laborLabel = `مصنعية تصنيع وتركيب (${Math.round(laborPerTon).toLocaleString('ar-EG')} ج/طن + ${Math.round(laborSheetPerM2)} ج/م² صاج)`;
    }

    const workshopExtrasTotal = laborCost + transportCost;
    const grandTotal = materialsSubtotal + workshopExtrasTotal;
    const materialsPerM2 = materialsSubtotal / floorArea;
    const grandTotalPerM2 = grandTotal / floorArea;

    const sections = recommendSections(
      { steelGrade: grade.id, trussDuty: duty.id, width },
      colKgPerM,
      rafterKgPerM
    );

    // تنبيهات هندسية ذكية مفيدة للحداد والعميل
    const notes = [];
    if (width >= 18 && grade.id === 'light') {
      notes.push({
        type: 'warn',
        text: `البحر (${width} م) كبير نسبياً على الحديد الخفيف — يُنصح بشدة باختيار "حديد متوسط" أو "ثقيل" لضمان الأمان الإنشائي.`
      });
    }
    if (height >= 8 && duty.id === 'light') {
      notes.push({
        type: 'warn',
        text: `الارتفاع (${height} م) يتطلب أعمدة محملة وشدادات رياح قوية — يُفضل ترقية نوع الجمالون إلى متوسط أو ثقيل.`
      });
    }
    if (sheetObj.id.startsWith('sandwich')) {
      notes.push({
        type: 'info',
        text: 'تم احتساب زيادة طفيفة (+6%) في قطاعات السقف والمدادات لتحمل الوزن الإضافي لألواح الساندوتش بانل العازلة.'
      });
    }
    if (width > 24) {
      notes.push({
        type: 'info',
        text: `للبحور الأكبر من 24م (${width} م) يُنصح بعمل مراجعة إنشائية ومخطط أحمال رياح قبل التقطيع الفعلي.`
      });
    }

    return {
      input: {
        length,
        width,
        height,
        slopePercent,
        duty,
        grade,
        roofShape,
        wallMode,
        sheetObj,
        steelPriceObj,
        brickWallHeight,
        steelWastePct,
        sheetWastePct,
        includeAccessories,
        includeGutters
      },
      geometry: {
        floorArea,
        ridgeRise,
        peakHeight,
        slopedWidth,
        perimeter,
        numBays,
        actualBaySpacing,
        numFrames,
        mainColumnsCount,
        totalWindColumns,
        totalColumnsCount,
        purlinLines,
        sideGirtLines,
        netRoofArea,
        roofSheetAreaWithWaste,
        netWallSheetArea,
        wallSheetAreaWithWaste,
        totalNetSheetArea,
        totalSheetAreaWithWaste,
        estimatedSheetsCount,
        coveredWallHeight,
        gateDeduction,
        guttersLength
      },
      weights: {
        columnsKg,
        raftersKg,
        roofPurlinsKg,
        sideGirtsKg,
        purlinsTotalKg,
        bracingKg,
        platesKg,
        netSteelKg,
        wasteSteelKg,
        totalSteelKg,
        totalSteelTons,
        steelKgPerM2,
        totalSheetWeightKg
      },
      costs: {
        steelPricePerTon,
        steelCost,
        sheetPricePerM2,
        roofSheetCost,
        wallSheetCost,
        totalSheetCost,
        paintCost,
        weldingCost,
        fastenersCost,
        anchorsCost,
        guttersCost,
        totalAccessoriesCost,
        materialsSubtotal,
        materialsPerM2,
        laborMode,
        steelLaborCost,
        sheetLaborCost,
        laborCost,
        laborLabel,
        transportCost,
        workshopExtrasTotal,
        grandTotal,
        grandTotalPerM2
      },
      sections,
      notes
    };
  }

  global.MizanCalculator = {
    DUTY_PROFILES,
    STEEL_GRADE_PROFILES,
    ROOF_SHAPES,
    WALL_CLADDING,
    calculateTrussBudget
  };
})(window);
