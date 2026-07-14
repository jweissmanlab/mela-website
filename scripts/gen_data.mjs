import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });

// Deterministic PRNG (mulberry32) so the placeholder is stable across builds.
function rng(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r = rng(42);

// ---------- LINKAGE (heatmap) ----------
const types = [
  'Epiblast',
  'Primitive streak',
  'Nascent mesoderm',
  'Paraxial mesoderm',
  'Somites',
  'Cardiac mesoderm',
  'Endothelium',
  'Definitive endoderm',
  'Gut tube',
  'Neural plate',
  'Neural crest',
  'Surface ectoderm',
  'Notochord',
  'Blood progenitors',
];

const rows = types;
const cols = types;
const matrix = [];
const meta = {};
for (let i = 0; i < rows.length; i++) {
  const row = [];
  for (let j = 0; j < cols.length; j++) {
    let v;
    if (i === j) v = 1;
    else {
      // closer indices -> higher linkage, plus noise
      const dist = Math.abs(i - j) / rows.length;
      v = Math.max(0, Math.min(1, 0.85 * (1 - dist) * (0.55 + 0.9 * r())));
      v = +v.toFixed(3);
    }
    row.push(v);
    const nCells = Math.round(200 + r() * 9800);
    const p = +(Math.pow(10, -1 - Math.floor(r() * 6))).toExponential(1);
    meta[`${rows[i]}|${cols[j]}`] = {
      value: v,
      nCells,
      description:
        i === j
          ? `Self-linkage baseline for ${rows[i]}.`
          : `Lineage coupling between ${rows[i]} and ${cols[j]} inferred from shared clonal ancestry.`,
      stat: { pValue: p },
      sharedClones: Math.round(v * (5 + r() * 120)),
    };
  }
  matrix.push(row);
}

writeFileSync(
  `${OUT}/linkage.json`,
  JSON.stringify(
    {
      title: 'Lineage linkage between cell types',
      axes: { rows, cols },
      matrix,
      meta,
      scale: { label: 'Linkage score', min: 0, max: 1 },
      note: 'Placeholder data — replace with exported lineage-coupling matrix.',
    },
    null,
    1
  )
);

// NOTE: fate.json is real data built from CSVs by scripts/build_fate.mjs.
// This script intentionally only generates the linkage.json placeholder.

console.log('wrote linkage.json to', OUT);
