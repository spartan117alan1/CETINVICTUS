import { context, build } from 'esbuild'

const options = {
  entryPoints: ['src/pages/login.ts', 'src/pages/dashboard.ts', 'src/pages/users.ts'],
  bundle: true, format: 'esm', outdir: 'public/js', target: 'es2022', sourcemap: true, logLevel: 'info',
}

if (process.argv.includes('--watch')) await (await context(options)).watch()
else await build(options)