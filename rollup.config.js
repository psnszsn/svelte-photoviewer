import svelte from 'rollup-plugin-svelte';
import resolve from '@rollup/plugin-node-resolve';
import pkg from './package.json';

const name = pkg.name
    .replace(/^(@\S+\/)?(svelte-)?(\S+)/, '$3')
    .replace(/^\w/, m => m.toUpperCase())
    .replace(/-\w/g, m => m[1].toUpperCase());

export default [{
    input: 'src/index.js',
    output: [
        {file: pkg.module, 'format': 'es'},
        {file: pkg.main, 'format': 'umd', name}
    ],
    plugins: [
        svelte({
            customElement: false,
        }),
        resolve()
    ]
},
{
    input: 'demo/Demo.svelte',
    output:
    {
        dir: 'demo/dist',
        format: 'es',
        sourcemap: true,
        name: 'demo'
    },

    plugins: [
        svelte({
            customElement: false
        }),
        resolve()
    ]
}
];
