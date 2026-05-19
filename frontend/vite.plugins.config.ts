import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

// Get list of plugin directories
const pluginsDir = path.resolve(__dirname, 'src/plugins');
const plugins = fs.readdirSync(pluginsDir).filter(f => 
    fs.statSync(path.join(pluginsDir, f)).isDirectory() && 
    fs.existsSync(path.join(pluginsDir, f, 'index.ts'))
);

// This config builds each plugin as a standalone ES module
export default defineConfig(({ mode }) => {
  // We'll use an environment variable to decide which plugin to build, 
  // or build all of them in a loop if we can.
  // For simplicity in a single command, we can use multiple entry points.
  
  const entries: Record<string, string> = {};
  plugins.forEach(p => {
    entries[p] = path.resolve(pluginsDir, p, 'index.ts');
  });

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@plugin-sdk': path.resolve(__dirname, './src/plugins/sdk')
      }
    },
    build: {
      outDir: path.resolve(__dirname, '../backend/plugins'),
      emptyOutDir: false, // Don't empty as it contains Python code!
      lib: {
        entry: entries,
        formats: ['es'],
        fileName: (format, entryName) => `${entryName}/ui/index.js`,
      },
      rollupOptions: {
        // Externalize dependencies that the main app already provides
        external: ['react', 'react-dom', '@mantine/core', '@mantine/hooks', 'lucide-react'],
        output: {
          globals: {
            react: 'React',
            'react-dom': 'ReactDOM',
          },
        },
      },
    },
  };
});
