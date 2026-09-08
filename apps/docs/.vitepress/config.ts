import { defineConfig } from "vitepress";

export default defineConfig({
  title: "openstyle",
  description: "AI-friendly toolkit for map styling — schema, compiler, and prompt manual for SLD.",
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Packages", link: "/packages/" },
      { text: "GitHub", link: "https://github.com/gaopengbin/openstyle" },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Guide",
          items: [
            { text: "Getting started", link: "/guide/getting-started" },
          ],
        },
      ],
      "/packages/": [
        {
          text: "Packages",
          items: [
            { text: "Overview", link: "/packages/" },
            { text: "@openstyle/schema", link: "/packages/schema" },
            { text: "@openstyle/compiler", link: "/packages/compiler" },
            { text: "@openstyle/cartography", link: "/packages/cartography" },
            { text: "@openstyle/ai", link: "/packages/ai" },
            { text: "@openstyle/manual", link: "/packages/manual" },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/gaopengbin/openstyle" },
    ],
    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © 2026 gaopengbin and openstyle contributors",
    },
  },
});
