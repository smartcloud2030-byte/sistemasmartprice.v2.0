import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        // .claude/, .agents/, .codex/, .github/skills, .github/hooks are agent
        // config/skills directories (not app code) rewritten during a session;
        // without this, every write triggers a reload or crashes the watcher
        // (Windows EBUSY on skill files locked by the installer/other tools).
        ignored: ['**/.claude/**', '**/.agents/**', '**/.codex/**', '**/.github/skills/**', '**/.github/hooks/**'],
      },
    },
  };
});
