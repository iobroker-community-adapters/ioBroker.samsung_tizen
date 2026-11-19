// ioBroker eslint template configuration file for js and ts files
// Please note that esm or react based modules need additional modules loaded.
import config from '@iobroker/eslint-config';

export default [
    ...config,
    {
        languageOptions: {
            parserOptions: {
                projectService: { allowDefaultProject: ['*.js', '*.mjs'] },
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        // specify files to exclude from linting here
        ignores: [
            '.dev-server/',
            '.vscode/',
            'admin/**/*',
            'build/**/*',
            // src-admin has its own dependencies (not installed in CI), check it with: cd src-admin && npx tsc
            'src-admin/**/*',
            'node_modules/**/*',
            'test/**/*',
            'tmp/**/*',
            '.**/*',
            '**/adapter-config.d.ts',
        ],
    },
    {
        rules: {
            'jsdoc/require-jsdoc': 'off',
            'jsdoc/require-param': 'off',
            'jsdoc/require-param-description': 'off',
            'jsdoc/require-returns-description': 'off',
            'jsdoc/require-returns-check': 'off',
            '@typescript-eslint/no-require-imports': 'off',
        },
    },
];
