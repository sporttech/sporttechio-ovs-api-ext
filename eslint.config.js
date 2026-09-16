import globals from "globals";
import pluginJs from "@eslint/js";


export default [
  {languageOptions: { globals: globals.node }},
  {files: ["static/**/*.js"], languageOptions: { globals: globals.browser }},
  pluginJs.configs.recommended,
];
