import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Antes tudo ia num único arquivo de 1,87 MB: a tela de LOGIN baixava
        // a stack de videoconferência inteira (auditoria P2 item 19). Somado
        // ao React.lazy das rotas em App.tsx, cada peça pesada só é buscada
        // quando a tela que a usa é aberta.
        // Só entram aqui as dependências que o caminho INICIAL realmente
        // usa. Criar chunk manual para uma lib usada apenas por rota lazy tem
        // efeito contrário: o Rollup passa a emitir um `import` de efeito
        // colateral na entry, e o navegador baixa o pacote inteiro na primeira
        // tela — foi o que aconteceu com recharts e react-markdown. Deixados
        // de fora, eles são absorvidos pelo chunk da rota que os usa.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          // Utilitários minúsculos por trás do `cn()`, usados por quase todo
          // componente. Sem casa própria o Rollup os absorvia para dentro do
          // chunk do recharts, e aí qualquer tela arrastava os gráficos junto.
          if (/node_modules[\\/](clsx|tailwind-merge|class-variance-authority)[\\/]/.test(id)) {
            return 'vendor-ui-utils';
          }

          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('@tanstack')) return 'vendor-query';
          if (/node_modules[\\/]react-router/.test(id)) return 'vendor-router';
          if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react';

          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
});
