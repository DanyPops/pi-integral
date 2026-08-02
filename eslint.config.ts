/**
 * Narrow, gap-filling ESLint config -- Biome (biome.json) is the primary linter/formatter here.
 * This only covers what Biome 2.x still can't: full type-aware no-floating-promises, import-cycle
 * detection, and a barrel-import ban.
 */
import importX from "eslint-plugin-import-x";
import tseslint from "typescript-eslint";

const PRODUCTION_SOURCE = ["packages/*/src/**/*.ts", "packages/*/src/**/*.mjs"];

export default tseslint.config(
	{ ignores: ["**/node_modules/**", "**/dist/**", "**/*.d.ts"] },

	{
		files: PRODUCTION_SOURCE,
		plugins: { "import-x": importX },
		settings: {
			"import-x/resolver": { typescript: true },
		},
		rules: {
			// Unbounded maxDepth deliberately -- a low cap (the previous per-package config used
			// maxDepth: 3) silently stops detecting real cycles beyond that depth rather than
			// erroring, a documented failure mode of this exact rule.
			"import-x/no-cycle": ["error", { ignoreExternal: true }],
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: ["../index", "../index.js", "../../index", "../../index.js"],
							message: "Do not import from barrel files (index.ts) within a package's own source. Import from the source module directly.",
						},
					],
				},
			],
		},
	},

	{
		files: ["packages/*/src/**/*.ts"],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		plugins: { "@typescript-eslint": tseslint.plugin },
		rules: {
			"@typescript-eslint/no-floating-promises": "error",
		},
	},
);
