// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// GitHub project page: https://jweissmanlab.github.io/mela-website/
export default defineConfig({
  site: 'https://mela.wi.mit.edu',
  base: '/',
  integrations: [react()],
});
