import { sendToDaemon } from "../flow/OPEN_SETTING_WINDOW/connect-to-daemon"

export async function checkShouldExit () {
    const shouldExitResponse = await sendToDaemon(
      {
        type: 'check-should-exit',
        workerId: process.env.DAGEGONGD_WORKER_ID,
      },
      {
        needCallback: true
      }
    )
    return shouldExitResponse?.shouldExit
  }