// Central config — edit these as real values become available.

export const SITE = {
  title: 'MELT',
  full: 'Mouse Embryonic Lineage and Transcriptome',
  tagline: 'A cell fate map of mammalian embryogenesis',
  // Data-exploration tool. Swap for a public URL once one exists (see Explore page).
  exploreUrl: 'http://172.18.104.15:8080',
  // Placeholder — replace with the real Zenodo record.
  zenodoRecordUrl: 'https://zenodo.org/records/0000000',
  zenodoDoi: '10.5281/zenodo.0000000',
  githubUrl: 'https://github.com/jweissmanlab/melt-website',
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

// Placeholder citation — replace on publication.
export const CITATION = {
  authors: 'Author A, Author B, … Weissman J.S.',
  title:
    'A lineage-resolved cell fate map of mouse gastrulation and early organogenesis',
  journal: 'Journal (year)',
  year: '2026',
  doi: '10.0000/melt.2026',
};
