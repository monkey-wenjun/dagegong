import fs from 'fs'
import os from 'os'
import path from 'path'
import buildInfo from '../../common/build-info.json'
import { ensureStorageFileExist } from '@dagegong/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'

// 从 git tag 获取的版本号（构建时注入）
const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : buildInfo.version
import {
  createFirstLaunchNoticeWindow,
  firstLaunchNoticeWindow
} from '../window/firstLaunchNoticeWindow'
import { ipcMain } from 'electron'

export const firstLaunchNoticeApproveFlagPath = path.join(
  os.homedir(),
  '.dagegong/storage',
  'ui-first-launch-notice-flag'
)

export const isFirstLaunchNoticeApproveFlagExist = () =>
  fs.existsSync(firstLaunchNoticeApproveFlagPath)
export const createFirstLaunchNoticeApproveFlag = () => {
  ensureStorageFileExist()
  fs.writeFileSync(firstLaunchNoticeApproveFlagPath, appVersion)
}
export async function waitForUserApproveAgreement({ windowOption } = {}) {
  return new Promise((resolve, reject) => {
    createFirstLaunchNoticeWindow({ ...windowOption })
    let processDone = false
    function handler() {
      processDone = true
      firstLaunchNoticeWindow.close()
    }
    ipcMain.once('first-launch-notice-approve', handler)
    firstLaunchNoticeWindow.once('closed', () => {
      ipcMain.off('first-launch-notice-approve', handler)
      if (processDone) {
        resolve(true)
      } else {
        reject(new Error('USER_CANCELLED'))
      }
    })
  })
}
