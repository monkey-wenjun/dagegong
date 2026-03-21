import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin, loadEnv } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { presetUno, presetAttributify, presetIcons } from 'unocss'
import transformerDirective from '@unocss/transformer-directives'
import Replace from 'unplugin-replace/vite'
import { execSync } from 'child_process'

process.env = { ...process.env, ...loadEnv(process.env.NODE_ENV!, process.cwd()) }

// 从 git tag 获取版本号
function getVersionFromGitTag(): string {
  try {
    const tag = execSync('git describe --tags --match "ui-v*" --abbrev=0', { encoding: 'utf-8' }).trim()
    // 去掉 ui-v 前缀
    return tag.replace(/^ui-v/, '')
  } catch {
    // 如果没有 tag，使用 build-info.json 中的版本
    return '0.19.4'
  }
}

const appVersion = getVersionFromGitTag()
const mainPlugins = [
  externalizeDepsPlugin({
    exclude: [
      '@dagegong/utils',
      'find-chrome-bin',
      '@dagegong/launch-bosszhipin-login-page-with-preload-extension'
    ]
  }),
  Replace({
    delimiters: ['', ''],
    sourcemap: true,
    include: ['**/src/main/utils/gtag/Analytics.ts'],
    values: [
      {
        find: /<measurement_id>/g,
        replacement: process.env.VITE_APP_GTAG_MEASUREMENT_ID as string
      },
      {
        find: /<api_secret>/g,
        replacement: process.env.VITE_APP_GTAG_API_SECRET as string
      }
    ]
  }),
  // 阻止 TypeORM 动态导入可选依赖时报错
  Replace({
    delimiters: ['', ''],
    sourcemap: true,
    include: ['**/node_modules/typeorm/**/*.js'],
    values: [
      {
        find: 'case "@sap/hana-client":\n                    return require("@sap/hana-client");',
        replacement: 'case "@sap/hana-client":\n                    throw new Error("@sap/hana-client is not available");'
      },
      {
        find: 'case "@sap/hana-client/extension/Stream":\n                    return require("@sap/hana-client/extension/Stream");',
        replacement: 'case "@sap/hana-client/extension/Stream":\n                    throw new Error("@sap/hana-client/extension/Stream is not available");'
      }
    ]
  })
]
const preloadPlugins = [externalizeDepsPlugin()]
const rendererPlugins = [
  vue(),
  UnoCSS({
    presets: [presetUno(), presetAttributify(), presetIcons()],
    transformers: [transformerDirective()]
  })
]
if (process.env.NODE_ENV) {
  ;[mainPlugins, preloadPlugins, rendererPlugins].forEach((pluginList) => {
    pluginList.push(
      Replace({
        delimiters: ['', ''],
        sourcemap: true,
        include: ['**'],
        values: [
          {
            find: /process.env.NODE_ENV/g,
            replacement: `'${process.env.NODE_ENV}'` as string
          }
        ]
      })
    )
  })
}

export default defineConfig({
  main: {
    resolve: {
      alias: {
        // 阻止 TypeORM 动态导入可选依赖时报错
        '@sap/hana-client': false,
        '@sap/hana-client/extension/Stream': false
      }
    },
    build: {
      rollupOptions: {
        external: [
          // TypeORM 可选数据库驱动，标记为外部依赖以消除警告
          '@google-cloud/spanner',
          'mongodb',
          'redis',
          'ioredis',
          'pg',
          'pg-native',
          'sqlite3',
          'better-sqlite3',
          'oracledb',
          'mysql2',
          '@sap/hana-client'
        ],
        output: {
          // 禁用 hash，确保文件名固定，避免运行时找不到文件
          entryFileNames: '[name].js',
          chunkFileNames: '[name].js'
        }
      },
      minify: process.env.NODE_ENV === 'development' ? undefined : 'terser'
    },
    plugins: mainPlugins,
    define: {
      __APP_VERSION__: JSON.stringify(appVersion)
    }
  },
  preload: {
    plugins: preloadPlugins,
    build: {
      minify: process.env.NODE_ENV === 'development' ? undefined : 'terser'
    },
    define: {
      __APP_VERSION__: JSON.stringify(appVersion)
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: rendererPlugins,
    build: {
      minify: process.env.NODE_ENV === 'development' ? undefined : 'terser'
    },
    define: {
      __APP_VERSION__: JSON.stringify(appVersion)
    }
  }
})
