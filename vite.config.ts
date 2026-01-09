import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

function apiJsToTsDevPlugin(): Plugin {
  const root = process.cwd();

  const toFsPath = (id: string) => {
    const clean = id.split('?')[0] ?? id;
    if (clean.startsWith('/@fs/')) return clean.slice('/@fs/'.length);
    if (clean.startsWith('/')) return path.resolve(root, clean.slice(1));
    return clean;
  };

  return {
    name: 'api-js-to-ts-dev',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer) return null;
      if (!source.startsWith('.') || !source.endsWith('.js')) return null;
      const importerFs = toFsPath(importer);
      if (!importerFs.includes(`${path.sep}api${path.sep}`)) return null;

      const absJs = path.resolve(path.dirname(importerFs), source);
      const absTs = absJs.replace(/\.js$/i, '.ts');
      if (fs.existsSync(absTs)) return absTs;
      return null;
    },
  };
}

function vercelApiDevPlugin(): Plugin {
  return {
    name: 'vercel-api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = typeof req.url === 'string' ? req.url : '';
        if (!url.startsWith('/api/')) return next();

        const pathname = url.split('?')[0] ?? url;
        let rel = pathname.replace(/^\/api\//, '');
        if (!rel || rel.includes('..') || rel.includes('\\')) return next();
        if (rel.endsWith('/')) rel = rel.slice(0, -1);
        if (!rel) return next();

        const root = server.config.root ?? process.cwd();
        const fsPathTs = path.resolve(root, 'api', `${rel}.ts`);
        const fsPathJs = path.resolve(root, 'api', `${rel}.js`);
        const moduleId = fs.existsSync(fsPathTs) ? `/api/${rel}.ts` : fs.existsSync(fsPathJs) ? `/api/${rel}.js` : null;
        if (!moduleId) return next();

        try {
          const mod = await server.ssrLoadModule(moduleId);
          const handler = mod?.default;
          if (typeof handler !== 'function') return next();
          await handler(req, res);
          return;
        } catch (err) {
          const e = err as Error;
          server.ssrFixStacktrace(e);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(`Local API error: ${e.message}`);
        }
      });
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  for (const [k, v] of Object.entries(env)) {
    if (!(k in process.env)) process.env[k] = v;
  }

  return {
    plugins: [react(), command === 'serve' ? apiJsToTsDevPlugin() : null, command === 'serve' ? vercelApiDevPlugin() : null].filter(
      Boolean,
    ) as Plugin[],
  };
});
