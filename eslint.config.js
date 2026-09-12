import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    /**
     * Arquivos gerados pela Lovable — o cabeçalho deles diz "This file is
     * automatically generated. Do not edit it directly."
     *
     * `prefer-const` já derrubou o CI duas vezes aqui: corrigimos o `timer` à
     * mão, a Lovable regenerou o arquivo e o erro voltou com outra forma
     * (`let timer: ReturnType<typeof setTimeout>` declarado antes de atribuir).
     * Enquanto quem escreve o arquivo for o gerador, corrigir à mão é esteira:
     * o conserto real é não aplicar a regra de estilo a código que não é
     * nosso. As regras de correção continuam valendo neste diretório.
     */
    files: ["src/integrations/supabase/**"],
    rules: {
      "prefer-const": "off",
    },
  },
);
