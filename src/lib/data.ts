import { withBase } from './base';

export const dataUrl = (name: string) => withBase(`/data/${name}`);

// ---- Linkage (entity × entity, per stage × level) ----
export interface LinkageManifest {
  stages: string[];
  levels: { key: string; label: string }[];
  default: { stage: string; level: string };
}
export interface LinkageData {
  title: string;
  stage?: string;
  level?: string;
  subtypes: string[]; // axis entities in display order (rows = cols)
  lineages: Record<string, string>; // subtype -> lineage
  lineageOrder: string[]; // lineage legend order
  palette: Record<string, string>; // lineage -> color
  nOf: Record<string, number>; // subtype -> n cells
  value: (number | null)[][]; // norm_value (heatmap fill)
  varr: number[][]; // norm_value_var (sidebar)
  pval: number[][]; // p_value (sidebar)
  scale: { vmin: number; center: number; vmax: number; label: string };
}

// ---- Fate (time-resolved restriction Sankey) ----
export interface FateCategory {
  level: 'root' | 'germ_layer' | 'lineage' | 'cell_type';
  parent: string | null;
  color: string;
}
export interface FateFlow {
  st: number; // source timepoint
  tt: number; // target timepoint
  s: string; // source category
  t: string; // target category
  count: number;
}
export interface FateData {
  title: string;
  timePrefix: string;
  timeLabel: string;
  valueLabel: string;
  times: number[];
  order: string[]; // vertical stacking order (top -> bottom)
  categories: Record<string, FateCategory>;
  flows: FateFlow[]; // coarse (lineage-level) — default view
  typeFlows: FateFlow[]; // fine (cell-type-level) — shown when a lineage is expanded
}
