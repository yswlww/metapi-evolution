import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolveDevProxyTarget } from './src/web/devProxyTarget';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = resolveDevProxyTarget(env);
  console.log(`[vite] dev proxy target: ${proxyTarget}`);

  const frontendPort = Number.parseInt(env.FRONTEND_PORT || env.VITE_FRONTEND_PORT || '', 10);
  const resolvedFrontendPort = Number.isFinite(frontendPort) && frontendPort > 0 ? frontendPort : 5173;
  const frontendHost = (env.VITE_DEV_HOST || '127.0.0.1').trim() || '127.0.0.1';

  const legacy = process.env.METAPI_WEB_UI === 'legacy';
  return {
    root: legacy ? 'src/web' : 'New metapi Evolution Webui/metapi',
    base: legacy ? '/legacy/' : '/',
    publicDir: resolve('src/web/public'),
    plugins: [react(), tailwindcss(), {
      name: 'evolution-favicon',
      generateBundle() {
        if (!legacy) this.emitFile({ type: 'asset', fileName: 'favicon.svg', source: readFileSync(resolve('New metapi Evolution Webui/metapi/public/favicon.svg')) });
      },
    }],
    resolve: {
      dedupe: ['react', 'react-dom', 'react-router-dom'],
      alias: {
        react: resolve('node_modules/react'),
        'react-dom': resolve('node_modules/react-dom'),
        'react-router-dom': resolve('node_modules/react-router-dom'),
      },
    },
    build: {
      outDir: resolve(legacy ? 'dist/web/legacy' : 'dist/web'),
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('@visactor/react-vchart') || id.includes('/@visactor/')) {
              return 'vchart-vendor';
            }
            return undefined;
          },
        },
      },
    },
    server: {
      host: frontendHost,
      port: resolvedFrontendPort,
      proxy: {
        '^/api($|/)': {
          target: proxyTarget,
          changeOrigin: true,
        },
        '^/monitor-proxy($|/)': {
          target: proxyTarget,
          changeOrigin: true,
        },
        '^/v1($|/)': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
