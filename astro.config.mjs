// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// GitHub project page: https://jweissmanlab.github.io/melt-website/
export default defineConfig({
  site: 'https://jweissmanlab.github.io',
  base: '/melt-website',
  integrations: [react()],
});
