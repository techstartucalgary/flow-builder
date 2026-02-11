/**
 * Parse raw AI analysis text into structured takeoff metrics.
 * Handles smart/curly quotes, markdown bold, and varied Gemini formats.
 */

const CEILING_HEIGHT_FT = 9;
const WASTE_FACTOR = 0.15;

export interface TakeoffData {
  totalArea: number;
  netDrywall: number;
  doors: number;
  windows: number;
  waste: number;
  summary: string;
}

export const EMPTY_TAKEOFF: TakeoffData = {
  totalArea: 0,
  netDrywall: 0,
  doors: 0,
  windows: 0,
  waste: 0,
  summary: '',
};

/** Normalize smart quotes and strip markdown bold markers */
function normalize(s: string): string {
  return s
    .replace(/[\u2018\u2019\u0060\u00B4]/g, "'")
    .replace(/[\u201C\u201D\u00AB\u00BB]/g, '"')
    .replace(/\*\*/g, '');
}

/** Convert dimension string like 42'-10" or 42'-10 1/2" to decimal feet */
function dimToFeet(s: string): number {
  const n = normalize(s);
  const m = n.match(/(\d+)'\s*-?\s*(\d+)(?:\s+(\d+)\/(\d+))?\s*"/);
  if (!m) {
    const feetOnly = n.match(/(\d+)'/);
    return feetOnly ? parseInt(feetOnly[1], 10) : 0;
  }
  const feet = parseInt(m[1], 10);
  let inches = parseInt(m[2], 10);
  if (m[3] && m[4]) {
    inches += parseInt(m[3], 10) / parseInt(m[4], 10);
  }
  return feet + inches / 12;
}

function countTags(block: string): number {
  const tags = new Set<string>();
  const re = /Tag\s+(\d+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) tags.add(m[1]);
  return tags.size;
}

function countBullets(block: string): number {
  return block.split('\n').filter(l => /^\s*[\*\-]\s+\w/.test(l)).length;
}

export function parseTakeoff(raw: string): TakeoffData {
  const text = normalize(raw);

  console.log('[parseTakeoff] text length:', text.length);
  console.log('[parseTakeoff] snippet:', text.substring(0, 400));

  // --- Total Area ---
  let totalArea = 0;
  const areaPatterns = [
    /TOTAL\s+(?:BASEMENT\s+)?(?:DEVELOPMENT|AREA)[:\s]*([0-9,]+)\s*SQ/i,
    /(\d{1,3}(?:,\d{3})+)\s*SQ(?:UARE)?\.?\s*F(?:EE)?T/i,
    /(\d{3,6})\s*SQ(?:UARE)?\.?\s*F(?:EE)?T/i,
    /total\s*(?:area|sq)[:\s]*([0-9,]+)/i,
  ];
  for (const pat of areaPatterns) {
    const m = text.match(pat);
    if (m) {
      totalArea = parseInt(m[1].replace(/,/g, ''), 10);
      if (totalArea > 0) break;
    }
  }

  // --- Doors ---
  let doors = 0;
  const doorSection = text.match(/Door\s+Schedule[\s\S]*?(?=###|\n##|$)/i);
  if (doorSection) {
    const dt = new Set<string>();
    const re = /Tag\s+(\d{3})/gi;
    let m1: RegExpExecArray | null;
    while ((m1 = re.exec(doorSection[0])) !== null) dt.add(m1[1]);
    doors = dt.size;
    if (doors === 0) doors = countBullets(doorSection[0]);
  }
  if (doors === 0) {
    const dt2 = new Set<string>();
    const re2 = /Tag\s+(1\d{2})/gi;
    let m2: RegExpExecArray | null;
    while ((m2 = re2.exec(text)) !== null) dt2.add(m2[1]);
    doors = dt2.size;
  }

  // --- Windows ---
  let windows = 0;
  const winSection = text.match(/Window\s+Schedule[\s\S]*?(?=Door\s+Schedule|###|\n##|$)/i);
  if (winSection) {
    windows = countTags(winSection[0]);
    if (windows === 0) windows = countBullets(winSection[0]);
  }
  if (windows === 0) {
    const wt = new Set<string>();
    const re3 = /Tag\s+(\d{1,2})(?!\d)/gi;
    let m3: RegExpExecArray | null;
    while ((m3 = re3.exec(text)) !== null) wt.add(m3[1]);
    windows = wt.size;
  }

  // --- Perimeter -> Net Drywall ---
  let perimeterFt = 0;
  const wm = text.match(/Overall\s+Width[^:]*:\s*([^\n]+)/i);
  const dm = text.match(/Overall\s+Depth[^:]*:\s*([^\n]+)/i);
  if (wm && dm) {
    perimeterFt = 2 * (dimToFeet(wm[1]) + dimToFeet(dm[1]));
  }

  if (perimeterFt === 0) {
    const allDims: number[] = [];
    const dimRe = /(\d{2,3})'\s*-?\s*(\d{1,2})(?:\s+\d+\/\d+)?\s*"/g;
    let d4: RegExpExecArray | null;
    while ((d4 = dimRe.exec(text)) !== null) {
      const ft = parseInt(d4[1], 10) + parseInt(d4[2], 10) / 12;
      if (ft > 10) allDims.push(ft);
    }
    if (allDims.length >= 2) {
      allDims.sort((a, b) => b - a);
      perimeterFt = 2 * (allDims[0] + allDims[1]);
    }
  }

  const interiorLinearFt = perimeterFt * 0.6;
  const exteriorDrywall = perimeterFt * CEILING_HEIGHT_FT;
  const interiorDrywall = interiorLinearFt * CEILING_HEIGHT_FT * 2;
  const grossDrywall = exteriorDrywall + interiorDrywall;
  const openingDeduction = doors * 21 + windows * 12;
  const netDrywall = Math.max(0, Math.round(grossDrywall - openingDeduction));

  const waste = Math.round(WASTE_FACTOR * 100);
  const wasteSqFt = Math.round(netDrywall * WASTE_FACTOR);

  console.log('[parseTakeoff] results:', { totalArea, netDrywall, doors, windows, perimeterFt });

  // --- Build summary ---
  const lines: string[] = [
    'TAKEOFF OVERVIEW',
    '',
  ];
  lines.push('Total Area: ' + (totalArea > 0 ? totalArea.toLocaleString() : '---') + ' sq ft');
  lines.push('Net Drywall: ' + (netDrywall > 0 ? netDrywall.toLocaleString() : '---') + ' sq ft');
  if (netDrywall > 0) {
    lines.push('  Exterior walls: ' + Math.round(exteriorDrywall).toLocaleString() + ' sq ft');
    lines.push('  Partition walls: ' + Math.round(interiorDrywall).toLocaleString() + ' sq ft');
    lines.push('  Opening deductions: -' + openingDeduction.toLocaleString() + ' sq ft');
  }
  lines.push('Doors: ' + doors);
  lines.push('Windows: ' + windows);
  lines.push('Waste (' + waste + '%): ' + (wasteSqFt > 0 ? wasteSqFt.toLocaleString() : '---') + ' sq ft');

  const roomSection = text.match(/(?:\d+\.\s*)?ROOMS\s*(?:&|AND)?\s*SPACES[\s\S]*?(?=###|\n##\s|$)/i);
  if (roomSection) {
    lines.push('');
    lines.push('Rooms:');
    const seen = new Set<string>();
    for (const line of roomSection[0].split('\n')) {
      const rm = line.match(/[\*\-]\s*([A-Za-z][A-Za-z0-9\s/\-]+?)(?:[:\.]|\s{2})/);
      if (rm) {
        const name = rm[1].trim();
        if (name.length > 1 && name.length < 40 && !seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          lines.push('  - ' + name);
        }
      }
    }
  }

  return {
    totalArea,
    netDrywall,
    doors,
    windows,
    waste,
    summary: lines.join('\n'),
  };
}
