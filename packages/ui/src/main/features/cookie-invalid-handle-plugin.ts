import { sendToDaemon } from '../flow/OPEN_SETTING_WINDOW/connect-to-daemon'
import minimist from 'minimist'
import { loginWithCookieAssistant } from './login-with-cookie-assistant'
import { checkCookieListFormat } from '../../common/utils/cookie'
import { sleep } from '@dagegong/utils/sleep.mjs'
import { readStorageFile } from '@dagegong/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { runningLogManager } from './running-log'

const runRecordId = minimist(process.argv.slice(2))['run-record-id'] ?? null
export class CookieInvalidHandlePlugin {
  apply(hooks) {
    hooks.cookieWillSet.tapPromise('CookieInvalidHandlePlugin', async (cookies) => {
      runningLogManager.logInfo('开始 Cookie 格式检查')
      let isValid = checkCookieListFormat(cookies)
      while (!isValid) {
        try {
          // popup login dialog, then update login status
          await loginWithCookieAssistant()
          await sleep(2000)
          const newCookies = readStorageFile('boss-cookies.json')
          isValid = checkCookieListFormat(newCookies)
          if (isValid) {
            cookies.length = 0
            for (const cookie of newCookies) {
              cookies.push(cookie)
            }
          }
        } catch (e) {
          if (e?.message === 'USER_CANCELLED_LOGIN') {
            runningLogManager.logError('用户取消了登录')
            sendToDaemon({
              type: 'worker-to-gui-message',
              data: {
                type: 'prerequisite-step-by-step-checkstep-by-step-check',
                step: {
                  id: 'basic-cookie-check',
                  status: 'rejected'
                },
                runRecordId
              }
            })
            throw new Error('LOGIN_STATUS_INVALID')
          }
        }
      }
      runningLogManager.logInfo('Cookie 格式检查通过')
      sendToDaemon({
        type: 'worker-to-gui-message',
        data: {
          type: 'prerequisite-step-by-step-checkstep-by-step-check',
          step: {
            id: 'basic-cookie-check',
            status: 'fulfilled'
          },
          runRecordId
        }
      })
    })
    hooks.userInfoResponse.tapPromise('CookieInvalidHandlePlugin', async (userInfoResponse) => {
      runningLogManager.logInfo('开始登录状态检查')
      if (userInfoResponse.code === 0) {
        runningLogManager.logInfo('登录状态检查通过')
        sendToDaemon({
          type: 'worker-to-gui-message',
          data: {
            type: 'prerequisite-step-by-step-checkstep-by-step-check',
            step: {
              id: 'login-status-check',
              status: 'fulfilled'
            },
            runRecordId
          }
        })
        return
      }
      runningLogManager.logError('登录状态无效，需要重新登录', { code: userInfoResponse.code, message: userInfoResponse.message })
      try {
        // popup login dialog, then update login status
        runningLogManager.logInfo('弹出登录窗口，等待用户登录...')
        await loginWithCookieAssistant()
        runningLogManager.logInfo('用户已完成登录')
      } catch (e) {
        if (e?.message === 'USER_CANCELLED_LOGIN') {
          runningLogManager.logError('用户取消了登录')
          sendToDaemon({
            type: 'worker-to-gui-message',
            data: {
              type: 'prerequisite-step-by-step-checkstep-by-step-check',
              step: {
                id: 'login-status-check',
                status: 'rejected'
              },
              runRecordId
            }
          })
          throw new Error('LOGIN_STATUS_INVALID')
        }
      }
      // throw new Error('THROW_FOR_RETRY')
      return Promise.reject(new Error('THROW_FOR_RETRY'))
    })
  }
}
