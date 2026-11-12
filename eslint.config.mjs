import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  ...nextVitals,
  ...nextTypescript,
  {
    // The React Compiler checks added in eslint-plugin-react-hooks 6 flag patterns this app uses
    // on purpose and that work (a "latest value" ref, loading data when something opens).
    // They stay visible as warnings instead of blocking the build.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'public/**', 'video/**'] },
];

export default config;
