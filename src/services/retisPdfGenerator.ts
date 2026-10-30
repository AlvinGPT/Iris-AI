import { SharedDashboardAndRetisSnapshot } from './retisSnapshot';

function escapePdfText(input: string): string {
  return input
    .replace(/[^\x20-\x7E]/g, (ch) => {
      if (ch === '–' || ch === '—') return '-';
      if (ch === '·' || ch === '•') return '-';
      if (ch === '≥') return '>=';
      if (ch === '≤') return '<=';
      return ' ';
    })
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxChars) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

/**
 * Generates a standards-compliant, multi-section native PDF 1.4 binary document locally
 * from the verified SharedDashboardAndRetisSnapshot without external dependencies.
 */
export function generateRetisMonthlyPdfBytes(
  snapshot: SharedDashboardAndRetisSnapshot,
  aiNarrativeText?: string | null
): Uint8Array {
  const ops: string[] = [];
  const pageWidth = 612; // Letter width (8.5in * 72pt)
  const pageHeight = 792; // Letter height (11in * 72pt)

  const addRect = (
    x: number,
    yTop: number,
    w: number,
    h: number,
    r: number,
    g: number,
    b: number,
    stroke = false
  ) => {
    const yPdf = pageHeight - yTop - h;
    ops.push(`${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} rg`);
    if (stroke) {
      ops.push(`0.12 0.14 0.18 RG 0.8 w`);
      ops.push(`${x.toFixed(1)} ${yPdf.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re B`);
    } else {
      ops.push(`${x.toFixed(1)} ${yPdf.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re f`);
    }
  };

  const addText = (
    x: number,
    yTop: number,
    text: string,
    font: 'F1' | 'F2' = 'F1',
    size = 10,
    r = 0.06,
    g = 0.09,
    b = 0.16
  ) => {
    const yPdf = pageHeight - yTop;
    ops.push(
      `BT /${font} ${size} Tf ${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} rg ${x.toFixed(
        1
      )} ${yPdf.toFixed(1)} Td (${escapePdfText(text)}) Tj ET`
    );
  };

  // Top Header Banner
  addRect(36, 32, 540, 64, 0.07, 0.09, 0.15, false);
  addText(52, 56, 'IRIS — MONTHLY SCREEN HABITS REPORT', 'F2', 15, 0.98, 0.98, 0.99);
  addText(
    52,
    74,
    `Retained Period: ${snapshot.dateRangeStart} to ${snapshot.dateRangeEnd} (30-Day Retention Policy)`,
    'F1',
    9.5,
    0.82,
    0.86,
    0.95
  );
  addText(
    52,
    88,
    `Status: ${snapshot.blinkStatus} | Observed Time: ${snapshot.observedDurationFormatted} (${snapshot.llmPayload.trackingCoveragePct}% coverage) | Tracked Days: ${snapshot.trackedDaysCount}`,
    'F1',
    8.5,
    0.72,
    0.78,
    0.9
  );

  // Section 1: Screen Habit Summary
  let cursorY = 116;
  addText(36, cursorY, '1. Screen Habit Summary', 'F2', 11.5, 0.06, 0.09, 0.16);
  cursorY += 8;

  const metricRows: Array<[string, string, string]> = [
    [
      'Average Blink Rate (BPM)',
      snapshot.metricEntries.blink_rate_bpm.formattedValue,
      `Basis: blinks / observed minutes (${snapshot.observedDurationFormatted}); Target: 14+ BPM`,
    ],
    [
      'Total Blinks',
      snapshot.metricEntries.total_validated_blinks.formattedValue,
      snapshot.metricEntries.total_validated_blinks.unavailableReason ||
        `Observed over ${snapshot.observedDurationFormatted} (${snapshot.llmPayload.trackingCoveragePct}% tracking coverage)`,
    ],
    [
      'Screen Distance & Calibration',
      `${snapshot.metricEntries.screen_distance_cm.formattedValue} (${snapshot.distanceStatus})`,
      snapshot.metricEntries.screen_distance_cm.unavailableReason ||
        'Optimal zone: 38-65 cm',
    ],
    [
      'Blink Alerts Delivered (<10 BPM)',
      snapshot.metricEntries.blink_alerts_count.formattedValue,
      'Distinct count of low-blink lock-in alerts delivered',
    ],
    [
      'Distance Warnings Delivered',
      snapshot.metricEntries.distance_warnings_count.formattedValue,
      'Distinct count of close-proximity warnings delivered',
    ],
    [
      'Completed Break Routines Today',
      snapshot.metricEntries.completed_breaks_count.formattedValue,
      'Distinct count of completed break exercises (never merged with alerts)',
    ],
    [
      'Longest Unbroken Session',
      snapshot.metricEntries.longest_session_hours.formattedValue,
      snapshot.metricEntries.longest_session_hours.unavailableReason ||
        'Continuous screen session duration',
    ],
    [
      'Fatigue Score',
      snapshot.metricEntries.fatigue_score.formattedValue,
      snapshot.metricEntries.fatigue_score.unavailableReason ||
        `Status: ${snapshot.fatigueBandLabel} (0-10 scale)`,
    ],
  ];

  addRect(36, cursorY, 540, 20, 0.91, 0.94, 0.98, true);
  addText(44, cursorY + 13, 'Metric', 'F2', 9, 0.06, 0.09, 0.16);
  addText(205, cursorY + 13, 'Measured Value', 'F2', 9, 0.06, 0.09, 0.16);
  addText(325, cursorY + 13, 'Basis / Status / Availability', 'F2', 9, 0.06, 0.09, 0.16);
  cursorY += 20;

  metricRows.forEach((row, idx) => {
    const bg = idx % 2 === 0 ? 0.99 : 0.96;
    addRect(36, cursorY, 540, 19, bg, bg, 0.99, true);
    addText(44, cursorY + 13, row[0], 'F2', 8.5, 0.08, 0.1, 0.16);
    addText(205, cursorY + 13, row[1], 'F1', 8.5, 0.08, 0.1, 0.16);
    addText(325, cursorY + 13, row[2].slice(0, 52), 'F1', 8, 0.28, 0.33, 0.41);
    cursorY += 19;
  });

  // Section 2: 7-Day Daily Trend Summary (with explicit gaps)
  cursorY += 18;
  addText(
    36,
    cursorY,
    '2. Daily Trends Summary (Days without observations are shown as "-- (Gap)")',
    'F2',
    11,
    0.06,
    0.09,
    0.16
  );
  cursorY += 8;

  const colW = 540 / 7;
  snapshot.trendSeries.forEach((pt, idx) => {
    const x = 36 + idx * colW;
    addRect(
      x,
      cursorY,
      colW,
      54,
      pt.hasData ? 0.93 : 0.97,
      pt.hasData ? 0.96 : 0.97,
      pt.hasData ? 1.0 : 0.98,
      true
    );
    addText(x + 6, cursorY + 13, `${pt.day}`, 'F2', 8.5, 0.06, 0.09, 0.16);
    addText(x + 6, cursorY + 24, pt.formattedDate, 'F1', 7.5, 0.35, 0.4, 0.48);
    if (pt.hasData) {
      addText(
        x + 6,
        cursorY + 37,
        `BPM: ${pt.blinkRate !== null ? pt.blinkRate : '--'}`,
        'F2',
        8,
        0.15,
        0.2,
        0.45
      );
      addText(
        x + 6,
        cursorY + 48,
        `Warn: ${pt.distanceWarnings ?? 0} | Blinks: ${pt.totalValidatedBlinks ?? 0}`,
        'F1',
        7,
        0.2,
        0.25,
        0.33
      );
    } else {
      addText(x + 6, cursorY + 39, '-- (No data)', 'F1', 8, 0.5, 0.54, 0.6);
    }
  });
  cursorY += 68;

  // Section 3: Eye-Comfort Heat Map Summary (Hour x Day)
  addText(
    36,
    cursorY,
    '3. Eye-Comfort Heat Map Summary (Low-Blink Windows <10 BPM per Hour)',
    'F2',
    11,
    0.06,
    0.09,
    0.16
  );
  cursorY += 8;
  addRect(36, cursorY, 540, 44, 0.97, 0.98, 1.0, true);

  const observedCells = snapshot.heatmapDays.flatMap((d) => d.cells.filter((c) => c.hasData));
  const totalLowBlinkCells = observedCells.filter((c) => c.lowBlinkWindows > 0).length;
  addText(
    46,
    cursorY + 16,
    observedCells.length > 0
      ? `Observed hour slots: ${observedCells.length} of ${
          snapshot.heatmapDays.length * snapshot.heatmapHours.length
        } | Slots with low-blink windows (<10 BPM): ${totalLowBlinkCells}`
      : 'No hourly slots have recorded observations yet. Unobserved cells are marked as "No data" (not 0).',
    'F1',
    8.5,
    0.12,
    0.16,
    0.24
  );
  addText(
    46,
    cursorY + 32,
    'Legend: No data = unobserved hour | 0 windows = observed with steady blinking (>=10 BPM) | 1+ windows = <10 BPM detected.',
    'F1',
    8,
    0.32,
    0.37,
    0.45
  );
  cursorY += 58;

  // Section 4: Stated Data Gaps & Retention Coverage
  addText(36, cursorY, '4. Stated Data Gaps & 30-Day Retention Coverage', 'F2', 11, 0.06, 0.09, 0.16);
  cursorY += 14;
  snapshot.dataGaps.slice(0, 5).forEach((gap) => {
    addText(44, cursorY, `- ${gap}`, 'F1', 8.5, 0.2, 0.24, 0.32);
    cursorY += 13;
  });

  // Section 5: Optional Schema-Validated AI-Generated Summary
  cursorY += 8;
  addRect(36, cursorY, 540, 74, 0.96, 0.95, 0.99, true);
  addText(
    46,
    cursorY + 15,
    '5. AI-generated summary (Schema-validated from local snapshot)',
    'F2',
    9.5,
    0.22,
    0.16,
    0.45
  );
  const narrativeSource =
    aiNarrativeText && aiNarrativeText.trim()
      ? aiNarrativeText.trim()
      : `Based on ${snapshot.reportingPeriodLabel} (${snapshot.observedDurationFormatted} observed): Avg. blink rate is ${snapshot.metricEntries.blink_rate_bpm.formattedValue}, screen distance is ${snapshot.metricEntries.screen_distance_cm.formattedValue}, with ${snapshot.metricEntries.blink_alerts_count.formattedValue} blink alerts and ${snapshot.metricEntries.distance_warnings_count.formattedValue} distance warnings.`;
  const wrappedNarrative = wrapText(narrativeSource, 92).slice(0, 3);
  wrappedNarrative.forEach((line, idx) => {
    addText(46, cursorY + 31 + idx * 13, line, 'F1', 8.5, 0.12, 0.15, 0.22);
  });
  cursorY += 88;

  // Section 6: Wellness Disclaimer
  addRect(36, 726, 540, 34, 0.95, 0.96, 0.97, true);
  addText(
    46,
    740,
    'Wellness Disclaimer: IRIS provides screen-awareness suggestions based on local measurements.',
    'F2',
    8,
    0.2,
    0.24,
    0.3
  );
  addText(
    46,
    752,
    'IRIS does not diagnose, treat, cure, or prevent any medical or eye condition.',
    'F1',
    8,
    0.28,
    0.32,
    0.38
  );

  const contentStream = ops.join('\n');

  // Assemble PDF 1.4 objects with exact byte offsets
  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n`,
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
    `6 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream\nendobj\n`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const encoder = new TextEncoder();
  return encoder.encode(pdf);
}
