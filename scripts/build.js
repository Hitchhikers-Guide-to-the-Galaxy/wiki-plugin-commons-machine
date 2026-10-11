import esbuild from 'esbuild'
import fs from 'node:fs'
esbuild.build({
  entryPoints: ['src/client/commons-machine.js'],
  bundle: true, format: 'iife', outfile: 'client/commons-machine.js',
  sourcemap: true, minify: true, metafile: true,
}).then(r => { fs.writeFileSync('meta-client.json', JSON.stringify(r.metafile)); console.log('built client/commons-machine.js') })
