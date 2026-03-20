import path from 'node:path'
import * as url from 'url'
import { sleep } from '@geekgeekrun/utils/sleep.mjs';
import childProcess from 'node:child_process';
import { AUTO_CHAT_ERROR_EXIT_CODE } from './enums.mjs'

const rerunInterval = (() => {
  let v = Number(process.env.MAIN_BOSSGEEKGO_RERUN_INTERVAL)
  if (isNaN(v)) {
    v = 3000
  }

  return v
})()
const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

// 为 Node.js 24 兼容，设置 NODE_PATH 以解析 workspace 依赖
function getNodePath() {
  const sqlitePluginPath = path.resolve(__dirname, '../sqlite-plugin')
  const utilsPath = path.resolve(__dirname, '../utils')
  const dingtalkPath = path.resolve(__dirname, '../dingtalk-plugin')
  
  const existingNodePath = process.env.NODE_PATH || ''
  const separator = process.platform === 'win32' ? ';' : ':'
  
  return [sqlitePluginPath, utilsPath, dingtalkPath, existingNodePath]
    .filter(Boolean)
    .join(separator)
}

function runWithDaemon () {
  console.log('[DAEMON] Starting child process...')
  console.log('[DAEMON] Script path:', path.join(__dirname, 'main.mjs'))
  
  // 使用系统 Node.js，但设置 NODE_PATH 帮助解析模块
  const nodeExecutable = 'node'
  const nodePath = getNodePath()
  console.log('[DAEMON] Using NODE_PATH:', nodePath)
  
  const subProcessOfCore = childProcess.spawn(
    nodeExecutable,
    [path.join(
      __dirname,
      'main.mjs'
    )],
    {
      stdio: ['inherit', 'inherit', 'inherit', 'pipe', 'ipc'],
      env: {
        ...process.env,
        MAIN_BOSSGEEKGO_RERUN_INTERVAL: rerunInterval,
        NODE_PATH: nodePath
      }
    }
  )
  console.log('[DAEMON] Child process spawned with PID:', subProcessOfCore.pid)

  // 捕获子进程的所有输出
  subProcessOfCore.stdout?.on('data', (data) => {
    console.log(`[CHILD-OUT] ${data.toString('utf8').trim()}`)
  })
  
  subProcessOfCore.stderr?.on('data', (data) => {
    console.error(`[CHILD-ERR] ${data.toString('utf8').trim()}`)
  })
  
  subProcessOfCore.once(
    'exit',
    async (exitCode, signal) => {
      console.log(`[DAEMON] Child process exited with code ${exitCode}, signal: ${signal}`)
      if (
        [
          ...Object.values(AUTO_CHAT_ERROR_EXIT_CODE)
        ].filter(it => typeof it === 'number').includes(exitCode)
      ) {
        console.log(`[Run core daemon] Child process exit with reason ${AUTO_CHAT_ERROR_EXIT_CODE[exitCode]}.`)
        process.exit(exitCode)
        return
      }
      console.log(`[Run core daemon] Child process exit with code ${exitCode}, an internal error may not be caught, and will be restarted in ${rerunInterval}ms.`)
      await sleep(rerunInterval)
      runWithDaemon()
    }
  )
  
  subProcessOfCore.on('error', (err) => {
    console.error('[DAEMON] Failed to start child process:', err)
  })
}

runWithDaemon()