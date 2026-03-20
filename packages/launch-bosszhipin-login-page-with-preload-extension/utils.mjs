import path from 'node:path';
import fs from 'node:fs'
import os from 'node:os'
import extractZip from 'extract-zip'
import packageJson from './package.json' with { type: 'json' }

const isUiDev = process.env.NODE_ENV === 'development'

export const runtimeFolderPath = path.join(os.homedir(), '.dagegong')

const extensionDir = path.join(
  runtimeFolderPath,
  'chrome-extensions'
)
if (!fs.existsSync(
  runtimeFolderPath
)) {
  fs.mkdirSync(runtimeFolderPath)
}
if (!fs.existsSync(extensionDir)) {
  fs.mkdirSync(extensionDir)
}
export const editThisCookieExtensionPath = path.join(extensionDir, 'EditThisCookie')

let editThisCookieZipPath
async function getEditThisCookieZipPath () {
  if (editThisCookieZipPath) {
    return editThisCookieZipPath
  }
  const { app } = await import('electron')
  editThisCookieZipPath = path.join(app.getAppPath(), './node_modules', packageJson.name, 'extensions', 'EditThisCookie.zip')
  return editThisCookieZipPath
}

const APP_DAGEGONG_EDIT_VERSION = 1
export async function ensureEditThisCookie () {
  let isNeedExtractEditThisCookie = false
  const DAGEGONG_EDIT_VERSION_FILE_PATH = path.join(editThisCookieExtensionPath, 'DAGEGONG_EDIT_VERSION')
  let dagegongEditVersion
  try {
    const fileContent = fs.readFileSync(DAGEGONG_EDIT_VERSION_FILE_PATH, { encoding: 'utf-8' })
    dagegongEditVersion = Number(fileContent) || 0
  }
  catch (err) {
    dagegongEditVersion = 0
  }
  if (dagegongEditVersion < APP_DAGEGONG_EDIT_VERSION) {
    isNeedExtractEditThisCookie = true
  }
  const isExtractDoneFlagFilePath = path.join(editThisCookieExtensionPath, 'EXTRACT_DONE')
  if (
    !isNeedExtractEditThisCookie && 
    !fs.existsSync(isExtractDoneFlagFilePath)
  ) {
    isNeedExtractEditThisCookie = true
  }
  if (isNeedExtractEditThisCookie) {
    if (
      fs.existsSync(
        editThisCookieExtensionPath
      )
    ) {
      fs.rmSync(
        editThisCookieExtensionPath,
        {
          recursive: true,
          force: true
        }
      )
    }
    await extractZip(
      await getEditThisCookieZipPath(),
      {
        dir: extensionDir
      }
    )
    await fs.promises.writeFile(
      isExtractDoneFlagFilePath,
      ''
    )
  }
}