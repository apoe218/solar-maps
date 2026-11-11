import { defineConfig } from 'vite';

// GitHub Pages serves project sites from /<repo-name>/. Override with VITE_BASE if the repo is renamed.
const REPO_NAME = 'solar-maps';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? process.env.VITE_BASE ?? `/${REPO_NAME}/` : '/',
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
}));
