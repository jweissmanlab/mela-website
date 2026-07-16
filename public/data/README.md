# Data files

This folder holds only the **generated JSON** that the Linkage and Fate pages
fetch at runtime (so it is the only data shipped in the build). The **source
CSVs live in the repo-root `data/` directory** (not shipped) and are converted by
the scripts in `../../scripts/`. TypeScript definitions live in `src/lib/data.ts`.

---

## `linkage/*.json` → Linkage heatmap

**Generated** by `scripts/build_linkage.mjs` — do not hand-edit. One JSON is
emitted per **stage × resolution** combination into `linkage/`, plus an
`index.json` manifest. Inputs (in repo-root `data/linkage/`):

- `{stage}_{level}_linkage.csv` — long-form upper-triangle stats, columns
  `source, target, value, norm_value, z_score, norm_value_var, p_value,
  source_n, target_n`. `stage` ∈ E7.5…E9.5, `level` ∈ `type`, `subtype`.
- `{stage}_{level}_order.csv` — clustered display order, one entity per line
  (the `order` returned by `plot_linkage_heatmap`). If missing, a lineage-grouped
  fallback order is used.
- `data/cell_types.csv` — provides `cell_subtype/cell_type → lineage`.

Rebuild after updating any input:

```bash
node scripts/build_linkage.mjs      # -> linkage/{stage}_{level}.json + index.json
```

The page has **Stage** and **Resolution** dropdowns that load the matching
`linkage/{stage}_{level}.json`. Rendered as a canvas that fills the available
width: a full symmetric `norm_value` heatmap (RdBu_r, ±1.5) with axis labels
always shown, lineage colour strips on the top/right margins, and a detail
sidebar (p-value, variance, n) shown when a cell is clicked (the heatmap shrinks
to make room). Clicking a lineage strip or legend entry isolates that lineage.

Emitted schema (consumed by `LinkageHeatmap.tsx`):

```jsonc
{
  "title": "…",
  "stage": "E8.5", "level": "subtype",
  "subtypes": ["Allantois", "…"],       // axis entities in display order (rows = cols)
  "lineages": { "Allantois": "Extraembryonic mesoderm" },  // subtype -> lineage
  "lineageOrder": ["Ectoderm", "…"],    // legend / strip grouping order
  "palette": { "Ectoderm": "#1874CD" }, // lineage -> color
  "nOf": { "Allantois": 78 },           // subtype -> n cells
  "value": [[null, 0.35, …], …],        // norm_value[i][j] (null on diagonal)
  "varr":  [[…]],                       // norm_value_var[i][j]
  "pval":  [[…]],                       // p_value[i][j]
  "scale": { "vmin": -1.5, "center": 0, "vmax": 1.5, "label": "Normalized linkage" }
}
```

## `fate.json` → Fate Sankey (time-resolved lineage restriction)

**Generated** from two CSVs in repo-root `data/` by `scripts/build_fate.mjs` —
do not hand-edit:

- `data/fate_restriction.csv` — columns `source_time, target_time, source, target, count`
  (a flow of `count` cells from category `source` at `source_time` to `target`
  at `target_time`; timepoints are consecutive).
- `data/cell_types.csv` — provides the `lineage → germ_layer` hierarchy.

The category hierarchy is **Uncommitted → germ_layer → lineage**. Colors are set
by the `PALETTE` object at the top of `scripts/build_fate.mjs` — paste the
paper's `germ_layer_palette` / `lineage_palette` there to match exactly.

Regenerate after updating either CSV:

```bash
node scripts/build_fate.mjs
```

Emitted schema (consumed by `FateSankey.tsx`):

```jsonc
{
  "title": "…",
  "timePrefix": "E",          // axis label prefix, e.g. E4.5
  "timeLabel": "Embryonic day",
  "valueLabel": "fraction of cells",
  "times": [4.5, 5.0, …],     // ordered timepoints (columns)
  "order": ["Uncommitted", "Ectoderm", …],   // vertical stacking order
  "categories": {
    "Paraxial mesoderm": { "level": "lineage", "parent": "Mesoderm", "color": "#b5403c" }
  },
  "flows": [
    { "st": 4.5, "tt": 5.0, "s": "Uncommitted", "t": "Paraxial mesoderm", "count": 3 }
  ]
}
```

Interaction: the front-end keeps raw `count`s, then per view filters `flows` to
the selected branch (a category's ancestors ∪ itself ∪ descendants) and
normalizes per source timepoint, so clicking a node "expands" that branch to
fill the plot while the timepoints stay fixed.

---

## Rebuilding

Both JSON files are generated from the CSVs in this folder:

```bash
node scripts/build_linkage.mjs   # -> linkage.json
node scripts/build_fate.mjs      # -> fate.json
```
