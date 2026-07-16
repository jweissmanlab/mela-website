// Central config — edit these as real values become available.

export const SITE = {
  title: 'MELA',
  full: 'Mouse Embryonic Lineage Atlas',
  tagline: 'A cell fate map of mammalian embryogenesis',
  // Data-exploration tool (public).
  exploreUrl: 'https://mela.explorer.wi.mit.edu',
  // Placeholder — replace with the real Zenodo record.
  zenodoRecordUrl: 'https://zenodo.org/records/0000000',
  zenodoDoi: '10.5281/zenodo.0000000',
  githubUrl: 'https://github.com/jweissmanlab/mela-website',
  paperUrl: 'https://www.biorxiv.org/content/10.64898/2026.05.07.722278v1',
  contactEmail: 'wcolgan@wi.mit.edu',
};

// key figures for the Home stat tiles
export const STATS = [
  { value: '>1.5M', label: 'cells profiled' },
  { value: '16', label: 'mouse embryos' },
  { value: 'E7.5–E10.0', label: 'staged in half-day steps' },
  { value: '~75%', label: 'of cell divisions resolved' },
];

// nav — base is prepended automatically by withBase()
export const NAV = [
  { href: '/', label: 'Home' },
  { href: '/explore', label: 'Explore' },
  { href: '/linkage', label: 'Linkage' },
  { href: '/fate', label: 'Fate' },
  { href: '/download', label: 'Download' },
];

// Citation — from bioRxiv (doi:10.64898/2026.05.07.722278).
export const CITATION = {
  authors:
    'Colgan WN, Koblan LW, Villagrana J, Hou T-CJ, Wang M, Gowri G, Chandler W, Sepulveda LA, Ciftci D, Smolyar K, Young A, Wittler L, Markoulaki S, Loh KM, Zhuang X, Yosef N, Smith ZD, Weissman JS',
  title:
    'Comprehensive Lineage Tracing Maps the Landscape of Cell Fate Decisions in Mouse Embryogenesis',
  journal: 'bioRxiv',
  year: '2026',
  doi: '10.64898/2026.05.07.722278',
  url: 'https://www.biorxiv.org/content/10.64898/2026.05.07.722278v1',
};
