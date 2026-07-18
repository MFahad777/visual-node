import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'visual-node',
  tagline: 'Visual, node-based backend builder that compiles to real Express.js code',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://mfahad777.github.io',
  baseUrl: '/visual-node/',

  organizationName: 'MFahad777',
  projectName: 'visual-node',

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/MFahad777/visual-node/edit/documentation/docs/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'visual-node',
      items: [
        {to: '/', label: 'Introduction', position: 'left'},
        {to: '/node-reference', label: 'Node Reference', position: 'left'},
        {to: '/variables', label: 'Variables', position: 'left'},
        {to: '/plugins', label: 'Plugins', position: 'left'},
        {to: '/examples', label: 'Examples', position: 'left'},
        {
          href: 'https://github.com/MFahad777/visual-node',
          label: 'GitHub',
          position: 'right',
        },
        {
          href: 'https://www.npmjs.com/package/visual-node',
          label: 'npm',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {label: 'Introduction', to: '/'},
            {label: 'Node Reference', to: '/node-reference'},
            {label: 'Variables', to: '/variables'},
            {label: 'Plugins', to: '/plugins'},
            {label: 'Examples', to: '/examples'},
          ],
        },
        {
          title: 'More',
          items: [
            {label: 'GitHub', href: 'https://github.com/MFahad777/visual-node'},
            {label: 'npm package', href: 'https://www.npmjs.com/package/visual-node'},
            {label: 'License (MIT)', href: 'https://github.com/MFahad777/visual-node/blob/documentation/LICENSE'},
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} visual-node. Licensed under MIT. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
