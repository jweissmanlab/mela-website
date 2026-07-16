// Build per-combination linkage JSON for the Linkage heatmap from the CSVs in
// public/data/linkage/{stage}_{level}_linkage.csv (+ _order.csv), for every
// stage (E7.5…E9.5) and level (type, subtype).
//
//   linkage CSV cols: source,target,value,norm_value,z_score,norm_value_var,
//                     p_value,source_n,target_n  (long, upper triangle)
//   order CSV:        one entity per line, clustered display order
//   cell_types.csv:   cell_subtype/cell_type -> lineage
//
// Emits public/data/linkage/{stage}_{level}.json + index.json manifest.
//
// Usage: node scripts/build_linkage.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const IN = join(HERE, '..', 'data'); // source CSVs (not shipped)
const OUT = join(HERE, '..', 'public', 'data'); // generated JSON (shipped)
const LKIN = join(IN, 'linkage');
const LKOUT = join(OUT, 'linkage');

const STAGES = ['E7.5', 'E8.0', 'E8.5', 'E9.0', 'E9.5'];
const LEVELS = ['type', 'subtype'];
const DEFAULT = { stage: 'E9.5', level: 'subtype' };

const LINEAGE_PALETTE = {
  Epiblast: '#A983F2',
  'Primordial germ cell': '#20C4AC',
  Ectoderm: '#1874CD',
  'Neural ectoderm': '#83A4FF',
  'Surface ectoderm': '#75F6FC',
  'Neural crest': '#7C0EDD',
  'Extraembryonic ectoderm': '#262C6B',
  Mesoderm: '#CD2626',
  'Lateral plate mesoderm': '#7F0303',
  'Intermediate mesoderm': '#FFC0CB',
  'Paraxial mesoderm': '#FF7D7D',
  'Extraembryonic mesoderm': '#D34818',
  Endoderm: '#FFE600',
  'Extraembryonic endoderm': '#E69F00',
  Blood: '#009E73',
};
const LINEAGE_ORDER = Object.keys(LINEAGE_PALETTE);

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = split(lines[0]);
  return lines.slice(1).map((l) => {
    const c = split(l);
    const row = {};
    header.forEach((h, i) => (row[h] = c[i]));
    return row;
  });
}
function split(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// entity -> lineage maps
const cells = parseCsv(readFileSync(join(IN, 'cell_types.csv'), 'utf8'));
const sub2lin = {};
const type2lin = {};
for (const r of cells) {
  if (r.cell_subtype) sub2lin[r.cell_subtype] = r.lineage;
  if (r.cell_type) type2lin[r.cell_type] = r.lineage;
}

function build(stage, level) {
  const lkFile = join(LKIN, `${stage}_${level}_linkage.csv`);
  const orderFile = join(LKIN, `${stage}_${level}_order.csv`);
  if (!existsSync(lkFile)) return null;

  const rows = parseCsv(readFileSync(lkFile, 'utf8'));
  const map = level === 'subtype' ? sub2lin : type2lin;

  const present = new Set();
  for (const r of rows) {
    present.add(r.source);
    present.add(r.target);
  }

  let order;
  if (existsSync(orderFile)) {
    order = readFileSync(orderFile, 'utf8')
      .trim()
      .split(/\r?\n/)
      .map((s) => s.split(',')[0].trim())
      .filter((s) => present.has(s));
    for (const s of present) if (!order.includes(s)) order.push(s);
  } else {
    const lrank = (s) => {
      const i = LINEAGE_ORDER.indexOf(map[s]);
      return i < 0 ? 999 : i;
    };
    order = [...present].sort((a, b) => lrank(a) - lrank(b) || a.localeCompare(b));
  }

  const idx = new Map(order.map((s, i) => [s, i]));
  const N = order.length;
  const value = Array.from({ length: N }, () => Array(N).fill(null));
  const varr = Array.from({ length: N }, () => Array(N).fill(0));
  const pval = Array.from({ length: N }, () => Array(N).fill(1));
  const nOf = {};

  for (const r of rows) {
    if (r.source && r.source_n) nOf[r.source] ??= parseInt(r.source_n, 10);
    if (r.target && r.target_n) nOf[r.target] ??= parseInt(r.target_n, 10);
    const i = idx.get(r.source);
    const j = idx.get(r.target);
    if (i === undefined || j === undefined || i === j) continue;
    const nv = Number(parseFloat(r.norm_value).toFixed(4));
    const nvar = Number(parseFloat(r.norm_value_var).toPrecision(4));
    const p = Number(parseFloat(r.p_value).toPrecision(3));
    value[i][j] = value[j][i] = nv;
    varr[i][j] = varr[j][i] = nvar;
    pval[i][j] = pval[j][i] = p;
  }

  const lineages = {};
  for (const s of order) lineages[s] = map[s] ?? null;
  const usedLineages = LINEAGE_ORDER.filter((l) => order.some((s) => map[s] === l));
  const palette = {};
  for (const l of usedLineages) palette[l] = LINEAGE_PALETTE[l];

  const out = {
    title: `${stage} ${level} ancestral linkage`,
    stage,
    level,
    subtypes: order, // axis entities in display order
    lineages,
    lineageOrder: usedLineages,
    palette,
    nOf,
    value,
    varr,
    pval,
    scale: { vmin: -1.5, center: 0, vmax: 1.5, label: 'Normalized linkage' },
  };
  writeFileSync(join(LKOUT, `${stage}_${level}.json`), JSON.stringify(out));
  return N;
}

const available = { stages: [], levels: LEVELS };
for (const stage of STAGES) {
  let any = false;
  for (const level of LEVELS) {
    const n = build(stage, level);
    if (n != null) {
      any = true;
      console.log(`${stage}_${level}.json: ${n} entities`);
    }
  }
  if (any) available.stages.push(stage);
}

writeFileSync(
  join(LKOUT, 'index.json'),
  JSON.stringify({
    stages: available.stages,
    levels: [
      { key: 'type', label: 'Cell type' },
      { key: 'subtype', label: 'Cell subtype' },
    ],
    default: DEFAULT,
  })
);
console.log(`index.json: stages ${available.stages.join(', ')}`);