// Build public/data/fate.json for the Fate Sankey from the paper's CSVs:
//   public/data/fate_restriction.csv   (source_time,target_time,source,target,count)
//   public/data/cell_types.csv         (…,lineage,germ_layer,type_color,…)
//
// Hierarchy: Uncommitted -> germ_layer -> lineage.  Raw counts are kept; the
// front-end filters to the selected branch and normalizes per timepoint.
//
// Usage:  node scripts/build_fate.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const IN = join(HERE, '..', 'data'); // source CSVs (not shipped)
const DATA = join(HERE, '..', 'public', 'data'); // generated JSON (shipped)

// minimal CSV parser (handles simple quoted fields)
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = splitLine(lines[0]);
  return lines.slice(1).map((l) => {
    const cells = splitLine(l);
    const row = {};
    header.forEach((h, i) => (row[h] = cells[i]));
    return row;
  });
}
function splitLine(line) {
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

const fate = parseCsv(readFileSync(join(IN, 'fate_restriction.csv'), 'utf8'));
const cells = parseCsv(readFileSync(join(IN, 'cell_types.csv'), 'utf8'));

// ---------------------------------------------------------------------------
// PALETTE — from devmap.config germ_layer_palette / lineage_palette.
// ---------------------------------------------------------------------------
const PALETTE = {
  Uncommitted: '#CCCCCC',
  // germ layers
  Ectoderm: '#1874CD',
  Mesoderm: '#CD2626',
  Endoderm: '#FFE600',
  Epiblast: '#A983F2',
  'Primordial germ cell': '#20C4AC',
  // ectoderm lineages
  'Neural ectoderm': '#83A4FF',
  'Surface ectoderm': '#75F6FC',
  'Neural crest': '#7C0EDD',
  'Extraembryonic ectoderm': '#262C6B',
  // mesoderm lineages
  'Mesoderm (other)': '#8C5E58',
  'Lateral plate mesoderm': '#7F0303',
  'Intermediate mesoderm': '#FFC0CB',
  'Paraxial mesoderm': '#FF7D7D',
  'Extraembryonic mesoderm': '#D34818',
  Blood: '#009E73',
  // endoderm lineages
  'Extraembryonic endoderm': '#E69F00',
};
const FALLBACK = '#9aa0a6';

// lineage -> germ_layer (from cell_types.csv)
const lineageToGerm = {};
for (const r of cells) {
  if (r.lineage) lineageToGerm[r.lineage] = r.germ_layer;
}
const colorFor = (name) => PALETTE[name] || FALLBACK;

// germ layers are an explicit, hardcoded set (matching GERM_ORDER in
// build_celltypes.mjs) rather than inferred from a lineage row where
// lineage === germ_layer. Some germ layers (Mesoderm) have no cell type
// whose lineage is literally the bare germ-layer name — cell types that
// are mesoderm-derived but don't fall under one of the four named
// sub-lineages instead get their own "Mesoderm (other)" lineage bucket —
// so that inference is unreliable. Keep in sync with build_celltypes.mjs's
// GERM_PALETTE.
const GERM_LAYERS = new Set(['Ectoderm', 'Mesoderm', 'Endoderm', 'Epiblast', 'Primordial germ cell']);

// categories actually used in the flow data
const used = new Set();
for (const r of fate) {
  used.add(r.source);
  used.add(r.target);
}

// build category table: level + parent + color
const UNCOMMITTED = 'Uncommitted';
const categories = {};
for (const name of used) {
  if (name === UNCOMMITTED) {
    categories[name] = { level: 'root', parent: null, color: colorFor(UNCOMMITTED) };
    continue;
  }
  if (GERM_LAYERS.has(name)) {
    categories[name] = { level: 'germ_layer', parent: UNCOMMITTED, color: colorFor(name) };
    continue;
  }
  const germ = lineageToGerm[name];
  if (!germ) {
    // unknown -> treat as top-level branch off Uncommitted
    categories[name] = { level: 'lineage', parent: UNCOMMITTED, color: colorFor(name) };
  } else {
    categories[name] = { level: 'lineage', parent: germ, color: colorFor(name) };
  }
}

// vertical order (from the paper's sankey_order), grouped by germ layer,
// with any extra lineages (e.g. Blood) appended within their germ-layer group
const paperOrder = [
  'Uncommitted',
  'Ectoderm',
  'Surface ectoderm',
  'Neural ectoderm',
  'Neural crest',
  'Extraembryonic ectoderm',
  'Mesoderm',
  'Lateral plate mesoderm',
  'Paraxial mesoderm',
  'Intermediate mesoderm',
  'Extraembryonic mesoderm',
  'Endoderm',
];
const uIdx = (n) => {
  const i = paperOrder.indexOf(n);
  return i < 0 ? 999 : i;
};
const germOrder = ['Ectoderm', 'Mesoderm', 'Endoderm'];
const order = [UNCOMMITTED];
const placed = new Set([UNCOMMITTED]);
for (const g of germOrder) {
  if (!used.has(g)) continue;
  order.push(g);
  placed.add(g);
  const lins = [...used].filter(
    (c) => c !== g && categories[c]?.parent === g
  );
  lins.sort((a, b) => uIdx(a) - uIdx(b) || a.localeCompare(b));
  for (const l of lins) {
    order.push(l);
    placed.add(l);
  }
}
for (const c of used) if (!placed.has(c)) order.push(c); // safety net

// timepoints (ordered)
const times = [...new Set(fate.flatMap((r) => [+r.source_time, +r.target_time]))].sort(
  (a, b) => a - b
);

// flows (coarse / lineage level — default view)
const flows = fate
  .map((r) => ({
    st: +r.source_time,
    tt: +r.target_time,
    s: r.source,
    t: r.target,
    count: +r.count,
  }))
  .filter((f) => f.count > 0);

// ---------------------------------------------------------------------------
// Cell-type resolution (shown when a lineage is expanded).
//   type_fate_restriction.csv: same schema, categories at cell-type level
//   cell_types.csv: cell_type -> lineage and cell_type -> color (type_color)
// ---------------------------------------------------------------------------
// count lineages / colors across the subtype rows for each cell type, then
// take the most common (cell_types.csv has one row per subtype).
const typeLinCount = {}; // cell_type -> {lineage: n}
const typeColorCount = {}; // cell_type -> {color: n}
for (const r of cells) {
  if (!r.cell_type) continue;
  (typeLinCount[r.cell_type] ??= {});
  if (r.lineage) typeLinCount[r.cell_type][r.lineage] = (typeLinCount[r.cell_type][r.lineage] || 0) + 1;
  (typeColorCount[r.cell_type] ??= {});
  const c = (r.type_color || '').toLowerCase();
  if (c) typeColorCount[r.cell_type][c] = (typeColorCount[r.cell_type][c] || 0) + 1;
}
const modal = (m) =>
  m ? Object.entries(m).sort((a, b) => b[1] - a[1])[0]?.[0] : undefined;
const typeToLineage = {};
for (const t in typeLinCount) {
  const best = modal(typeLinCount[t]);
  if (best) typeToLineage[t] = best;
}
const typeColor = (t) => modal(typeColorCount[t]) || FALLBACK;

let typeFlows = [];
let fullOrder = order;
const typeFile = join(IN, 'type_fate_restriction.csv');
if (existsSync(typeFile)) {
  const typeFate = parseCsv(readFileSync(typeFile, 'utf8'));
  const typeUsed = new Set();
  for (const r of typeFate) {
    typeUsed.add(r.source);
    typeUsed.add(r.target);
  }

  // add cell-type categories (anything not already root/germ/lineage)
  let orphans = 0;
  for (const name of typeUsed) {
    if (categories[name]) continue; // already classified from the coarse file
    const lin = typeToLineage[name];
    const parent = lin && categories[lin] ? lin : UNCOMMITTED;
    if (!(lin && categories[lin])) orphans++;
    categories[name] = { level: 'cell_type', parent, color: typeColor(name) };
  }
  if (orphans) console.log(`  note: ${orphans} cell type(s) had no matching lineage — attached to Uncommitted`);

  // vertical order: cell types sit directly under their lineage
  const ctByLineage = {};
  for (const name of typeUsed) {
    const cat = categories[name];
    if (cat?.level === 'cell_type') (ctByLineage[cat.parent] ??= []).push(name);
  }
  for (const k in ctByLineage) ctByLineage[k].sort((a, b) => a.localeCompare(b));
  fullOrder = [];
  for (const c of order) {
    fullOrder.push(c);
    if (categories[c]?.level === 'lineage' && ctByLineage[c])
      fullOrder.push(...ctByLineage[c]);
  }
  for (const name of typeUsed)
    if (categories[name]?.level === 'cell_type' && !fullOrder.includes(name))
      fullOrder.push(name);

  typeFlows = typeFate
    .map((r) => ({
      st: +r.source_time,
      tt: +r.target_time,
      s: r.source,
      t: r.target,
      count: +r.count,
    }))
    .filter((f) => f.count > 0);
  console.log(
    `type flows: ${typeFlows.length}, cell-type categories: ${fullOrder.length - order.length}`
  );
}

const out = {
  title: 'Lineage restriction over developmental time',
  timePrefix: 'E',
  timeLabel: 'Embryonic day',
  valueLabel: 'fraction of cells',
  times,
  order: fullOrder,
  categories,
  flows,
  typeFlows,
};

writeFileSync(join(DATA, 'fate.json'), JSON.stringify(out));
console.log(
  `fate.json: ${order.length} categories, ${times.length} timepoints, ${flows.length} flows`
);
console.log('order:', order.join(' | '));
for (const c of order) console.log(`  ${c.padEnd(24)} ${categories[c].level.padEnd(11)} <- ${categories[c].parent ?? '(root)'}  ${categories[c].color}`);
