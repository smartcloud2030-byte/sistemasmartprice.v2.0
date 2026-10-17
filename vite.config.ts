import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    // Nada de segredo no bundle: o front fala com a API por sessão (cookie).
    // Sem source map em produção e sem comentários de licença/debugger —
    // o código que vai pro navegador sai minificado e sem o fonte original.
    build: {
      sourcemap: false,
    },
    esbuild: {
      legalComments: 'none' as const,
      drop: ['debugger' as const],
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
