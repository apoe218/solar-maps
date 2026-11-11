import { defineConfig } from 'vitest/config';

// GitHub Pages serves project sites from /<repo-name>/. Used for dev, build and preview alike so all three
// behave the same. Override with VITE_BASE if the repo is renamed or served elsewhere.
const REPO_NAME = 'solar-maps';

export default defineConfig({
  base: process.env.VITE_BASE ?? `/${REPO_NAME}/`,
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
