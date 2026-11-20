/**
 * رسام المخطط الهندسي التفاعلي للجمالون (منظور ثلاثي الأبعاد + مقطع أمامي هندسي)
 * يتحدث فورياً مع تغيير الأبعاد، شكل السقف، نوع الحديد، نوع الصاج وتقفيل الجوانب
 */

(function (global) {
  'use strict';

  function getSheetPalette(sheetId) {
    if (!sheetId) {
      return { fill: 'rgba(56, 189, 248, 0.24)', stroke: '#38bdf8', wall: 'rgba(56, 189, 248, 0.14)' };
    }
    if (sheetId.startsWith('galvanized')) {
      return { fill: 'rgba(203, 213, 225, 0.26)', stroke: '#cbd5e1', wall: 'rgba(203, 213, 225, 0.14)' };
    }
    if (sheetId.startsWith('sandwich')) {
      return { fill: 'rgba(52, 211, 153, 0.25)', stroke: '#34d399', wall: 'rgba(52, 211, 153, 0.15)' };
    }
    // صاج ملون / إيكون
    return { fill: 'rgba(56, 189, 248, 0.26)', stroke: '#38bdf8', wall: 'rgba(56, 189, 248, 0.14)' };
  }

  function getSteelStrokeWidth(gradeId) {
    if (gradeId === 'heavy') return { col: 3.4, rafter: 2.8, purlin: 1.3 };
    if (gradeId === 'light') return { col: 1.9, rafter: 1.6, purlin: 0.9 };
    return { col: 2.6, rafter: 2.2, purlin: 1.1 };
  }

  function roofZAt(x, W, H, rise, shape) {
    if (shape === 'mono') {
      return H + (x / W) * rise;
    }
    if (shape === 'arched') {
      const t = (x / W) * 2 - 1; // -1..1
      return H + rise * Math.max(0, 1 - t * t);
    }
    // gable
    const distFromCenter = Math.abs(x - W / 2) / (W / 2);
    return H + rise * (1 - distFromCenter);
  }

  function renderIsometric(calc) {
    const { length, width, height, roofShape, wallMode, grade, sheetObj, brickWallHeight } = calc.input;
    const { ridgeRise, peakHeight, numBays, numFrames } = calc.geometry;

    const palette = getSheetPalette(sheetObj.id);
    const sw = getSteelStrokeWidth(grade.id);

    // تقييد نسب العرض للرسم حتى تظل النسب مقروءة وجميلة في كل المقاسات
    const maxDim = Math.max(length, width, peakHeight * 1.4);
    const visL = Math.max(length, maxDim * 0.35);
    const visW = Math.max(width, maxDim * 0.28);
    const visH = Math.max(height, maxDim * 0.16);
    const visRise = Math.max(ridgeRise, visW * (roofShape.id === 'arched' ? 0.18 : 0.11));

    // إسقاط أيزومتري مريح للعين
    const cosA = 0.84;
    const sinA = 0.34;
    const cosB = 0.78;
    const sinB = 0.30;

    function rawProject(x, y, z) {
      // x: عرض (0..visW), y: طول (0..visL), z: ارتفاع (0..visH+visRise)
      const px = x * cosA - y * cosB;
      const py = x * sinA + y * sinB - z * 1.05;
      return { x: px, y: py };
    }

    // حساب حدود الصندوق لتوسيط الرسم بدقة داخل viewBox 600x360
    const samplePts = [
      rawProject(0, 0, 0),
      rawProject(visW, 0, 0),
      rawProject(0, visL, 0),
      rawProject(visW, visL, 0),
      rawProject(0, 0, visH + visRise),
      rawProject(visW, 0, visH + visRise),
      rawProject(visW / 2, 0, visH + visRise),
      rawProject(visW / 2, visL, visH + visRise)
    ];

    const minX = Math.min(...samplePts.map((p) => p.x));
    const maxX = Math.max(...samplePts.map((p) => p.x));
    const minY = Math.min(...samplePts.map((p) => p.y));
    const maxY = Math.max(...samplePts.map((p) => p.y));

    const vbW = 600;
    const vbH = 350;
    const padX = 76;
    const padTop = 44;
    const padBottom = 56;
    const scale = Math.min(
      (vbW - padX * 2) / Math.max(1, maxX - minX),
      (vbH - padTop - padBottom) / Math.max(1, maxY - minY)
    );

    const offsetX = (vbW - (maxX - minX) * scale) / 2 - minX * scale;
    const offsetY = padTop + ((vbH - padTop - padBottom) - (maxY - minY) * scale) / 2 - minY * scale;

    function P(x, y, z) {
      const r = rawProject(x, y, z);
      return {
        x: Number((r.x * scale + offsetX).toFixed(1)),
        y: Number((r.y * scale + offsetY).toFixed(1))
      };
    }

    function ptsStr(arr) {
      return arr.map((p) => `${p.x},${p.y}`).join(' ');
    }

    // عدد الفريمات الظاهرة في الرسم (حد أقصى 12 فريم حتى لا يزدحم الرسم للطول الضخم)
    const drawBays = Math.min(numBays, 11);
    const parts = [];

    // 1. الأرضية الخرسانية (Concrete Pad)
    const g0 = P(0, 0, 0);
    const g1 = P(visW, 0, 0);
    const g2 = P(visW, visL, 0);
    const g3 = P(0, visL, 0);
    parts.push(`<polygon points="${ptsStr([g0, g1, g2, g3])}" fill="rgba(148, 163, 184, 0.08)" stroke="rgba(148, 163, 184, 0.4)" stroke-width="1.2" stroke-dasharray="4 3" />`);

    // 2. تقفيل الجوانب الخلفية والجانبية البعيدة
    const brickVisH = wallMode.id === 'partial'
      ? Math.min(visH * 0.85, (brickWallHeight / Math.max(1, height)) * visH)
      : 0;

    if (wallMode.id === 'partial') {
      // سور الطوب الخلفي والجانبي
      const bBack = [P(0, visL, 0), P(visW, visL, 0), P(visW, visL, brickVisH), P(0, visL, brickVisH)];
      const bLeft = [P(0, 0, 0), P(0, visL, 0), P(0, visL, brickVisH), P(0, 0, brickVisH)];
      parts.push(`<polygon points="${ptsStr(bBack)}" fill="rgba(217, 119, 6, 0.22)" stroke="rgba(245, 158, 11, 0.55)" stroke-width="1" />`);
      parts.push(`<polygon points="${ptsStr(bLeft)}" fill="rgba(217, 119, 6, 0.28)" stroke="rgba(245, 158, 11, 0.65)" stroke-width="1" />`);

      // صاج علوي فوق الطوب على الجانب الأيسر والخلف
      const sLeft = [P(0, 0, brickVisH), P(0, visL, brickVisH), P(0, visL, visH), P(0, 0, visH)];
      parts.push(`<polygon points="${ptsStr(sLeft)}" fill="${palette.wall}" stroke="${palette.stroke}" stroke-opacity="0.45" stroke-width="0.9" />`);
    } else if (wallMode.id === 'full') {
      const fLeft = [P(0, 0, 0), P(0, visL, 0), P(0, visL, visH), P(0, 0, visH)];
      const fBack = [P(0, visL, 0), P(visW, visL, 0), P(visW, visL, visH), P(0, visL, visH)];
      parts.push(`<polygon points="${ptsStr(fBack)}" fill="${palette.wall}" stroke="${palette.stroke}" stroke-opacity="0.35" stroke-width="0.9" />`);
      parts.push(`<polygon points="${ptsStr(fLeft)}" fill="${palette.wall}" stroke="${palette.stroke}" stroke-opacity="0.5" stroke-width="1" />`);
    }

    // 3. الفريمات المعدنية والأعمدة (من الخلف للأمام)
    for (let i = drawBays; i >= 0; i--) {
      const y = (i / drawBays) * visL;
      const isFront = i === 0;
      const isBack = i === drawBays;
      const frameColor = isFront ? '#f59e0b' : '#94a3b8';
      const frameOpacity = isFront ? 1 : (isBack ? 0.55 : 0.72);

      const cLeftBot = P(0, y, 0);
      const cLeftTop = P(0, y, roofZAt(0, visW, visH, visRise, roofShape.id));
      const cRightBot = P(visW, y, 0);
      const cRightTop = P(visW, y, roofZAt(visW, visW, visH, visRise, roofShape.id));

      // الأعمدة
      parts.push(`<line x1="${cLeftBot.x}" y1="${cLeftBot.y}" x2="${cLeftTop.x}" y2="${cLeftTop.y}" stroke="${frameColor}" stroke-opacity="${frameOpacity}" stroke-width="${sw.col}" stroke-linecap="round" />`);
      parts.push(`<line x1="${cRightBot.x}" y1="${cRightBot.y}" x2="${cRightTop.x}" y2="${cRightTop.y}" stroke="${frameColor}" stroke-opacity="${frameOpacity}" stroke-width="${sw.col}" stroke-linecap="round" />`);

      // المقص العلوي / الجمالون
      if (roofShape.id === 'gable') {
        const apex = P(visW / 2, y, visH + visRise);
        parts.push(`<polyline points="${ptsStr([cLeftTop, apex, cRightTop])}" fill="none" stroke="${frameColor}" stroke-opacity="${frameOpacity}" stroke-width="${sw.rafter}" stroke-linejoin="round" />`);
        // وتر سفلي + شكالات داخلية للجمالون
        parts.push(`<line x1="${cLeftTop.x}" y1="${cLeftTop.y}" x2="${cRightTop.x}" y2="${cRightTop.y}" stroke="${frameColor}" stroke-opacity="${frameOpacity * 0.8}" stroke-width="${sw.rafter * 0.75}" />`);
        if (isFront || isBack) {
          const midBot = P(visW / 2, y, visH);
          const q1Top = P(visW * 0.25, y, visH + visRise * 0.5);
          const q1Bot = P(visW * 0.25, y, visH);
          const q3Top = P(visW * 0.75, y, visH + visRise * 0.5);
          const q3Bot = P(visW * 0.75, y, visH);
          parts.push(`<line x1="${apex.x}" y1="${apex.y}" x2="${midBot.x}" y2="${midBot.y}" stroke="${frameColor}" stroke-opacity="${frameOpacity * 0.85}" stroke-width="1.2" />`);
          parts.push(`<line x1="${q1Top.x}" y1="${q1Top.y}" x2="${q1Bot.x}" y2="${q1Bot.y}" stroke="${frameColor}" stroke-opacity="${frameOpacity * 0.75}" stroke-width="1.1" />`);
          parts.push(`<line x1="${q3Top.x}" y1="${q3Top.y}" x2="${q3Bot.x}" y2="${q3Bot.y}" stroke="${frameColor}" stroke-opacity="${frameOpacity * 0.75}" stroke-width="1.1" />`);
          parts.push(`<line x1="${q1Bot.x}" y1="${q1Bot.y}" x2="${apex.x}" y2="${apex.y}" stroke="${frameColor}" stroke-opacity="${frameOpacity * 0.7}" stroke-width="1" />`);
          parts.push(`<line x1="${q3Bot.x}" y1="${q3Bot.y}" x2="${apex.x}" y2="${apex.y}" stroke="${frameColor}" stroke-opacity="${frameOpacity * 0.7}" stroke-width="1" />`);
        }
      } else if (roofShape.id === 'mono') {
        parts.push(`<line x1="${cLeftTop.x}" y1="${cLeftTop.y}" x2="${cRightTop.x}" y2="${cRightTop.y}" stroke="${frameColor}" stroke-opacity="${frameOpacity}" stroke-width="${sw.rafter}" />`);
        if (isFront) {
          const trussDepth = Math.min(visH * 0.16, 0.75);
          const bL = P(0, y, visH - trussDepth);
          const bR = P(visW, y, visH + visRise - trussDepth);
          parts.push(`<line x1="${bL.x}" y1="${bL.y}" x2="${bR.x}" y2="${bR.y}" stroke="${frameColor}" stroke-opacity="0.75" stroke-width="1.3" />`);
        }
      } else {
        // مقوس (Arched)
        const steps = 12;
        const arcPts = [];
        for (let s = 0; s <= steps; s++) {
          const ax = (s / steps) * visW;
          const az = roofZAt(ax, visW, visH, visRise, 'arched');
          arcPts.push(P(ax, y, az));
        }
        parts.push(`<polyline points="${ptsStr(arcPts)}" fill="none" stroke="${frameColor}" stroke-opacity="${frameOpacity}" stroke-width="${sw.rafter}" />`);
        if (isFront) {
          parts.push(`<line x1="${cLeftTop.x}" y1="${cLeftTop.y}" x2="${cRightTop.x}" y2="${cRightTop.y}" stroke="${frameColor}" stroke-opacity="0.65" stroke-width="1.2" stroke-dasharray="4 3" />`);
        }
      }
    }

    // 4. المدادات الطولية + سطح الصاج العلوي الشفاف
    const roofSteps = roofShape.id === 'arched' ? 10 : (roofShape.id === 'gable' ? 6 : 5);
    for (let s = 0; s <= roofSteps; s++) {
      const rx = (s / roofSteps) * visW;
      const rz = roofZAt(rx, visW, visH, visRise, roofShape.id);
      const pFront = P(rx, 0, rz);
      const pBack = P(rx, visL, rz);
      parts.push(`<line x1="${pFront.x}" y1="${pFront.y}" x2="${pBack.x}" y2="${pBack.y}" stroke="${palette.stroke}" stroke-opacity="0.65" stroke-width="${sw.purlin}" />`);
    }

    // مضلعات تغطية صاج السقف
    if (roofShape.id === 'gable') {
      const slope1 = [P(0, 0, visH), P(visW / 2, 0, visH + visRise), P(visW / 2, visL, visH + visRise), P(0, visL, visH)];
      const slope2 = [P(visW / 2, 0, visH + visRise), P(visW, 0, visH), P(visW, visL, visH), P(visW / 2, visL, visH + visRise)];
      parts.push(`<polygon points="${ptsStr(slope1)}" fill="${palette.fill}" stroke="${palette.stroke}" stroke-opacity="0.7" stroke-width="1" />`);
      parts.push(`<polygon points="${ptsStr(slope2)}" fill="${palette.fill}" stroke="${palette.stroke}" stroke-opacity="0.5" stroke-width="1" />`);
    } else if (roofShape.id === 'mono') {
      const monoRoof = [P(0, 0, visH), P(visW, 0, visH + visRise), P(visW, visL, visH + visRise), P(0, visL, visH)];
      parts.push(`<polygon points="${ptsStr(monoRoof)}" fill="${palette.fill}" stroke="${palette.stroke}" stroke-opacity="0.75" stroke-width="1.1" />`);
    } else {
      for (let s = 0; s < 10; s++) {
        const x1 = (s / 10) * visW;
        const x2 = ((s + 1) / 10) * visW;
        const z1 = roofZAt(x1, visW, visH, visRise, 'arched');
        const z2 = roofZAt(x2, visW, visH, visRise, 'arched');
        const strip = [P(x1, 0, z1), P(x2, 0, z2), P(x2, visL, z2), P(x1, visL, z1)];
        parts.push(`<polygon points="${ptsStr(strip)}" fill="${palette.fill}" stroke="${palette.stroke}" stroke-opacity="0.35" stroke-width="0.7" />`);
      }
    }

    // تقفيل الجانب الأمامي/الأيمن لو مقفل صاج (نترك الواجهة شفافة جزئياً لبيان الهيكل)
    if (wallMode.id === 'full') {
      const fRight = [P(visW, 0, 0), P(visW, visL, 0), P(visW, visL, roofZAt(visW, visW, visH, visRise, roofShape.id)), P(visW, 0, roofZAt(visW, visW, visH, visRise, roofShape.id))];
      parts.push(`<polygon points="${ptsStr(fRight)}" fill="${palette.wall}" stroke="${palette.stroke}" stroke-opacity="0.45" stroke-width="0.9" />`);
      // بوابة دخول في الواجهة الأمامية
      const gw1 = visW * 0.34;
      const gw2 = visW * 0.66;
      const gh = visH * 0.72;
      const gate = [P(gw1, 0, 0), P(gw2, 0, 0), P(gw2, 0, gh), P(gw1, 0, gh)];
      parts.push(`<polygon points="${ptsStr(gate)}" fill="rgba(15, 23, 42, 0.55)" stroke="#f59e0b" stroke-width="1.3" stroke-dasharray="3 2" />`);
    } else if (wallMode.id === 'partial') {
      const bRight = [P(visW, 0, 0), P(visW, visL, 0), P(visW, visL, brickVisH), P(visW, 0, brickVisH)];
      parts.push(`<polygon points="${ptsStr(bRight)}" fill="rgba(217, 119, 6, 0.22)" stroke="rgba(245, 158, 11, 0.55)" stroke-width="1" />`);
    }

    // 5. خطوط الأبعاد الهندسية بالعربي
    // بُعد العرض W على الواجهة الأمامية
    const dimW1 = P(0, -visL * 0.1, 0);
    const dimW2 = P(visW, -visL * 0.1, 0);
    const midW = { x: (dimW1.x + dimW2.x) / 2, y: (dimW1.y + dimW2.y) / 2 };
    parts.push(`<line x1="${dimW1.x}" y1="${dimW1.y}" x2="${dimW2.x}" y2="${dimW2.y}" stroke="#38bdf8" stroke-width="1.2" marker-start="url(#dotBlue)" marker-end="url(#dotBlue)" />`);
    parts.push(`<rect x="${midW.x - 42}" y="${midW.y + 6}" width="84" height="20" rx="4" fill="#0f172a" fill-opacity="0.92" stroke="#38bdf8" stroke-width="0.9" />`);
    parts.push(`<text x="${midW.x}" y="${midW.y + 20}" fill="#e0f2fe" font-size="11" font-weight="700" text-anchor="middle">العرض ${width} م</text>`);

    // بُعد الطول L على الجانب الأيسر
    const dimL1 = P(-visW * 0.14, 0, 0);
    const dimL2 = P(-visW * 0.14, visL, 0);
    const midL = { x: (dimL1.x + dimL2.x) / 2, y: (dimL1.y + dimL2.y) / 2 };
    parts.push(`<line x1="${dimL1.x}" y1="${dimL1.y}" x2="${dimL2.x}" y2="${dimL2.y}" stroke="#f59e0b" stroke-width="1.2" marker-start="url(#dotAmber)" marker-end="url(#dotAmber)" />`);
    parts.push(`<rect x="${Math.max(8, midL.x - 52)}" y="${midL.y + 6}" width="84" height="20" rx="4" fill="#0f172a" fill-opacity="0.92" stroke="#f59e0b" stroke-width="0.9" />`);
    parts.push(`<text x="${Math.max(8, midL.x - 52) + 42}" y="${midL.y + 20}" fill="#fef3c7" font-size="11" font-weight="700" text-anchor="middle">الطول ${length} م</text>`);

    // بُعد الارتفاع H على العمود الأمامي الأيمن
    const dimH1 = P(visW + visW * 0.08, 0, 0);
    const dimH2 = P(visW + visW * 0.08, 0, visH);
    const midH = { x: dimH1.x + 8, y: (dimH1.y + dimH2.y) / 2 };
    parts.push(`<line x1="${dimH1.x}" y1="${dimH1.y}" x2="${dimH2.x}" y2="${dimH2.y}" stroke="#34d399" stroke-width="1.2" marker-start="url(#dotGreen)" marker-end="url(#dotGreen)" />`);
    parts.push(`<rect x="${Math.min(510, midH.x)}" y="${midH.y - 10}" width="80" height="20" rx="4" fill="#0f172a" fill-opacity="0.88" stroke="#34d399" stroke-width="0.8" />`);
    parts.push(`<text x="${Math.min(510, midH.x) + 40}" y="${midH.y + 4}" fill="#d1fae5" font-size="11" font-weight="700" text-anchor="middle">ارتفاع ${height} م</text>`);

    // شارة ملخص أعلى اليسار
    const badgeText = `${numFrames} فريم • ${numBays} باكية • القمة ${peakHeight.toFixed(1)} م`;
    parts.push(`<rect x="14" y="12" width="215" height="24" rx="6" fill="rgba(15, 23, 42, 0.85)" stroke="rgba(148, 163, 184, 0.3)" stroke-width="1" />`);
    parts.push(`<text x="121" y="28" fill="#e2e8f0" font-size="11" font-weight="600" text-anchor="middle">${badgeText}</text>`);

    return wrapSvg(vbW, vbH, parts.join('\n'));
  }

  function renderElevation(calc) {
    const { width, height, slopePercent, roofShape, wallMode, grade, sheetObj, brickWallHeight } = calc.input;
    const { ridgeRise, peakHeight, actualBaySpacing } = calc.geometry;

    const palette = getSheetPalette(sheetObj.id);
    const sw = getSteelStrokeWidth(grade.id);

    const vbW = 600;
    const vbH = 350;
    const groundY = 285;
    const drawMaxW = 400;
    const drawMaxH = 190;

    const scale = Math.min(drawMaxW / Math.max(4, width), drawMaxH / Math.max(3, peakHeight));
    const drawW = width * scale;
    const drawH = height * scale;
    const drawRise = ridgeRise * scale;

    const leftX = (vbW - drawW) / 2;
    const rightX = leftX + drawW;
    const eaveY = groundY - drawH;
    const peakY = eaveY - drawRise;

    const parts = [];

    // خط الأرض والأساسات
    parts.push(`<line x1="40" y1="${groundY}" x2="${vbW - 40}" y2="${groundY}" stroke="#64748b" stroke-width="2" />`);
    // قواعد خرسانية تحت العمودين
    parts.push(`<rect x="${leftX - 18}" y="${groundY}" width="36" height="14" rx="2" fill="#334155" stroke="#94a3b8" stroke-width="1" />`);
    parts.push(`<rect x="${rightX - 18}" y="${groundY}" width="36" height="14" rx="2" fill="#334155" stroke="#94a3b8" stroke-width="1" />`);

    // مباني طوب جزئية أو تقفيل كامل خلف الهيكل
    if (wallMode.id === 'partial') {
      const bH = Math.min(drawH * 0.88, brickWallHeight * scale);
      parts.push(`<rect x="${leftX}" y="${groundY - bH}" width="${drawW}" height="${bH}" fill="rgba(217, 119, 6, 0.16)" stroke="rgba(245, 158, 11, 0.55)" stroke-width="1.2" stroke-dasharray="6 3" />`);
      parts.push(`<text x="${vbW / 2}" y="${groundY - bH / 2 + 4}" fill="#fcd34d" font-size="11" font-weight="600" text-anchor="middle">مباني طوب بارتفاع ${brickWallHeight} م</text>`);
      parts.push(`<rect x="${leftX}" y="${eaveY}" width="${drawW}" height="${drawH - bH}" fill="${palette.wall}" />`);
    } else if (wallMode.id === 'full') {
      parts.push(`<rect x="${leftX}" y="${eaveY}" width="${drawW}" height="${drawH}" fill="${palette.wall}" />`);
      // بوابة دخول
      const gW = Math.min(drawW * 0.32, 95);
      const gH = Math.min(drawH * 0.72, 95);
      parts.push(`<rect x="${vbW / 2 - gW / 2}" y="${groundY - gH}" width="${gW}" height="${gH}" fill="rgba(15, 23, 42, 0.65)" stroke="#f59e0b" stroke-width="1.3" stroke-dasharray="4 2" />`);
      parts.push(`<text x="${vbW / 2}" y="${groundY - gH / 2 + 4}" fill="#fde68a" font-size="10.5" text-anchor="middle">بوابة دخول</text>`);
    }

    // العمودين الرئيسيين
    const rightTopY = roofShape.id === 'mono' ? peakY : eaveY;
    parts.push(`<line x1="${leftX}" y1="${groundY}" x2="${leftX}" y2="${eaveY}" stroke="#f59e0b" stroke-width="${sw.col + 1.5}" />`);
    parts.push(`<line x1="${rightX}" y1="${groundY}" x2="${rightX}" y2="${rightTopY}" stroke="#f59e0b" stroke-width="${sw.col + 1.5}" />`);

    // بليتات القواعد
    parts.push(`<line x1="${leftX - 10}" y1="${groundY - 1}" x2="${leftX + 10}" y2="${groundY - 1}" stroke="#f8fafc" stroke-width="3" />`);
    parts.push(`<line x1="${rightX - 10}" y1="${groundY - 1}" x2="${rightX + 10}" y2="${groundY - 1}" stroke="#f8fafc" stroke-width="3" />`);

    // الجمالون العلوي وشبكة المقصات
    if (roofShape.id === 'gable') {
      const midX = vbW / 2;
      // سطح الصاج العلوي (خط مزدوج)
      parts.push(`<polyline points="${leftX - 10},${eaveY + 2} ${midX},${peakY - 5} ${rightX + 10},${eaveY + 2}" fill="none" stroke="${palette.stroke}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />`);
      // الوتر العلوي والسفلي
      parts.push(`<polygon points="${leftX},${eaveY} ${midX},${peakY} ${rightX},${eaveY}" fill="rgba(245, 158, 11, 0.08)" stroke="#f59e0b" stroke-width="${sw.rafter + 0.6}" stroke-linejoin="round" />`);
      // شبكة الشكالات الهندسية (Pratt Truss)
      const panels = width >= 16 ? 8 : 6;
      for (let i = 1; i < panels; i++) {
        const px = leftX + (i / panels) * drawW;
        const dist = Math.abs(i - panels / 2) / (panels / 2);
        const topY = peakY + dist * drawRise;
        parts.push(`<line x1="${px}" y1="${topY}" x2="${px}" y2="${eaveY}" stroke="#fbbf24" stroke-opacity="0.8" stroke-width="1.3" />`);
        if (i < panels / 2) {
          const nextX = leftX + ((i + 1) / panels) * drawW;
          const nextDist = Math.abs((i + 1) - panels / 2) / (panels / 2);
          const nextTopY = peakY + nextDist * drawRise;
          parts.push(`<line x1="${px}" y1="${eaveY}" x2="${nextX}" y2="${nextTopY}" stroke="#fbbf24" stroke-opacity="0.65" stroke-width="1.1" />`);
        } else if (i > panels / 2) {
          const prevX = leftX + ((i - 1) / panels) * drawW;
          const prevDist = Math.abs((i - 1) - panels / 2) / (panels / 2);
          const prevTopY = peakY + prevDist * drawRise;
          parts.push(`<line x1="${px}" y1="${eaveY}" x2="${prevX}" y2="${prevTopY}" stroke="#fbbf24" stroke-opacity="0.65" stroke-width="1.1" />`);
        }
      }
    } else if (roofShape.id === 'mono') {
      const depth = Math.min(26, Math.max(14, drawH * 0.16));
      parts.push(`<line x1="${leftX - 10}" y1="${eaveY - 4}" x2="${rightX + 10}" y2="${peakY - 4}" stroke="${palette.stroke}" stroke-width="3.5" stroke-linecap="round" />`);
      parts.push(`<polygon points="${leftX},${eaveY} ${rightX},${peakY} ${rightX},${peakY + depth} ${leftX},${eaveY + depth}" fill="rgba(245, 158, 11, 0.1)" stroke="#f59e0b" stroke-width="${sw.rafter + 0.4}" />`);
      const panels = 6;
      for (let i = 1; i < panels; i++) {
        const px = leftX + (i / panels) * drawW;
        const ty = eaveY - (i / panels) * drawRise;
        const prevX = leftX + ((i - 1) / panels) * drawW;
        const prevTy = eaveY - ((i - 1) / panels) * drawRise;
        parts.push(`<line x1="${px}" y1="${ty}" x2="${px}" y2="${ty + depth}" stroke="#fbbf24" stroke-width="1.2" />`);
        parts.push(`<line x1="${prevX}" y1="${prevTy + depth}" x2="${px}" y2="${ty}" stroke="#fbbf24" stroke-opacity="0.7" stroke-width="1.1" />`);
      }
    } else {
      // مقوس (Arched)
      const steps = 20;
      const topPts = [];
      const botPts = [];
      const depth = Math.min(24, Math.max(12, drawRise * 0.35));
      for (let s = 0; s <= steps; s++) {
        const t = (s / steps) * 2 - 1;
        const px = leftX + (s / steps) * drawW;
        const py = eaveY - drawRise * Math.max(0, 1 - t * t);
        topPts.push(`${px.toFixed(1)},${py.toFixed(1)}`);
        botPts.push(`${px.toFixed(1)},${(py + depth).toFixed(1)}`);
      }
      parts.push(`<polyline points="${topPts.join(' ')}" fill="none" stroke="${palette.stroke}" stroke-width="4" />`);
      parts.push(`<polyline points="${topPts.join(' ')}" fill="none" stroke="#f59e0b" stroke-width="${sw.rafter}" />`);
      parts.push(`<polyline points="${botPts.join(' ')}" fill="none" stroke="#f59e0b" stroke-opacity="0.8" stroke-width="1.6" />`);
      for (let s = 2; s < steps; s += 2) {
        const [x1, y1] = topPts[s].split(',');
        const [x2, y2] = botPts[s].split(',');
        parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fbbf24" stroke-width="1.1" />`);
      }
    }

    // خطوط الأبعاد الهندسية
    // العرض الصافي أسفل الرسم
    parts.push(`<line x1="${leftX}" y1="${groundY + 34}" x2="${rightX}" y2="${groundY + 34}" stroke="#38bdf8" stroke-width="1.3" marker-start="url(#dotBlue)" marker-end="url(#dotBlue)" />`);
    parts.push(`<rect x="${vbW / 2 - 58}" y="${groundY + 23}" width="116" height="22" rx="4" fill="#0f172a" stroke="#38bdf8" stroke-width="0.9" />`);
    parts.push(`<text x="${vbW / 2}" y="${groundY + 38}" fill="#e0f2fe" font-size="11.5" font-weight="700" text-anchor="middle">البحر (العرض) ${width} م</text>`);

    // ارتفاع العمود (يمين)
    const dimXRight = rightX + 34;
    parts.push(`<line x1="${dimXRight}" y1="${groundY}" x2="${dimXRight}" y2="${eaveY}" stroke="#34d399" stroke-width="1.3" marker-start="url(#dotGreen)" marker-end="url(#dotGreen)" />`);
    parts.push(`<rect x="${Math.min(510, dimXRight + 8)}" y="${(groundY + eaveY) / 2 - 11}" width="76" height="22" rx="4" fill="#0f172a" stroke="#34d399" stroke-width="0.9" />`);
    parts.push(`<text x="${Math.min(510, dimXRight + 8) + 38}" y="${(groundY + eaveY) / 2 + 4}" fill="#d1fae5" font-size="11" font-weight="700" text-anchor="middle">عمود ${height} م</text>`);

    // ارتفاع القمة الكلي (يسار)
    const dimXLeft = leftX - 34;
    parts.push(`<line x1="${dimXLeft}" y1="${groundY}" x2="${dimXLeft}" y2="${peakY}" stroke="#f59e0b" stroke-width="1.3" marker-start="url(#dotAmber)" marker-end="url(#dotAmber)" />`);
    parts.push(`<line x1="${dimXLeft}" y1="${peakY}" x2="${roofShape.id === 'mono' ? rightX : vbW / 2}" y2="${peakY}" stroke="#f59e0b" stroke-opacity="0.35" stroke-dasharray="3 3" stroke-width="1" />`);
    parts.push(`<rect x="${Math.max(10, dimXLeft - 82)}" y="${(groundY + peakY) / 2 - 11}" width="76" height="22" rx="4" fill="#0f172a" stroke="#f59e0b" stroke-width="0.9" />`);
    parts.push(`<text x="${Math.max(10, dimXLeft - 82) + 38}" y="${(groundY + peakY) / 2 + 4}" fill="#fef3c7" font-size="11" font-weight="700" text-anchor="middle">قمة ${peakHeight.toFixed(1)} م</text>`);

    // شارة المقطع
    const info = `ميل السقف ${slopePercent}% • المسافة بين الأعمدة ${actualBaySpacing.toFixed(1)} م`;
    parts.push(`<rect x="14" y="12" width="248" height="24" rx="6" fill="rgba(15, 23, 42, 0.85)" stroke="rgba(148, 163, 184, 0.3)" stroke-width="1" />`);
    parts.push(`<text x="138" y="28" fill="#e2e8f0" font-size="11" font-weight="600" text-anchor="middle">${info}</text>`);

    return wrapSvg(vbW, vbH, parts.join('\n'));
  }

  function wrapSvg(w, h, inner) {
    return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" class="blueprint-svg" role="img" aria-label="رسم هندسي للجمالون">
      <defs>
        <pattern id="bpGridSmall" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(148, 163, 184, 0.08)" stroke-width="0.7" />
        </pattern>
        <pattern id="bpGridLarge" width="100" height="100" patternUnits="userSpaceOnUse">
          <rect width="100" height="100" fill="url(#bpGridSmall)" />
          <path d="M 100 0 L 0 0 0 100" fill="none" stroke="rgba(148, 163, 184, 0.16)" stroke-width="1" />
        </pattern>
        <marker id="dotBlue" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="5" markerHeight="5">
          <circle cx="4" cy="4" r="3" fill="#38bdf8" />
        </marker>
        <marker id="dotAmber" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="5" markerHeight="5">
          <circle cx="4" cy="4" r="3" fill="#f59e0b" />
        </marker>
        <marker id="dotGreen" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="5" markerHeight="5">
          <circle cx="4" cy="4" r="3" fill="#34d399" />
        </marker>
      </defs>
      <rect width="100%" height="100%" fill="#0b1220" />
      <rect width="100%" height="100%" fill="url(#bpGridLarge)" />
      ${inner}
    </svg>`;
  }

  function renderSparkline(history) {
    if (!Array.isArray(history) || history.length < 2) return '';
    const w = 220;
    const h = 48;
    const pad = 6;
    const vals = history.map((x) => Number(x.mediumSteel) || 49500);
    const min = Math.min(...vals) - 200;
    const max = Math.max(...vals) + 200;
    const range = Math.max(100, max - min);

    const pts = vals.map((v, i) => {
      const x = pad + (i / (vals.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
    });

    const linePts = pts.map((p) => `${p.x},${p.y}`).join(' ');
    const areaPts = `${pts[0].x},${h - pad} ${linePts} ${pts[pts.length - 1].x},${h - pad}`;
    const last = pts[pts.length - 1];

    return `<svg viewBox="0 0 ${w} ${h}" class="sparkline-svg" aria-label="تطور سعر الحديد خلال 7 أيام">
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#d97706" stop-opacity="0.32" />
          <stop offset="100%" stop-color="#d97706" stop-opacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points="${areaPts}" fill="url(#sparkFill)" />
      <polyline points="${linePts}" fill="none" stroke="#d97706" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="${last.x}" cy="${last.y}" r="3.5" fill="#d97706" stroke="#ffffff" stroke-width="1.5" />
    </svg>`;
  }

  global.MizanBlueprint = {
    renderIsometric,
    renderElevation,
    renderSparkline
  };
})(window);
