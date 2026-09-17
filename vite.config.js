import { defineConfig } from 'vite';
import { experimentCompatibility } from './scripts/experiment-compatibility.js';

export default defineConfig({
  plugins: [experimentCompatibility()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'three-core', test: /three[\\/]build[\\/]three\.core\.js/, priority: 3 },
            { name: 'three-renderer', test: /three[\\/]build[\\/]three\.module\.js/, priority: 2 },
            { name: 'three-addons', test: /three[\\/]examples[\\/]/, priority: 1 },
            { name: 'controls', test: /lil-gui/ },
          ],
        },
      },
    },
  },
});
