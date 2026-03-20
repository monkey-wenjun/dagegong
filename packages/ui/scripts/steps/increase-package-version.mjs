import path from 'path'
import fs from 'fs'
import { execSync } from 'child_process'
import * as url from 'url'
import semver from 'semver'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

export const PATH_TO_PACKAGE_JSON = path.join(__dirname, '../../package.json')
export const PATH_TO_BUILD_INFO_JSON = path.join(__dirname, '../../src/common/build-info.json')

export const getPackageInfo = () => fs.readFileSync(PATH_TO_PACKAGE_JSON)
export const getRuntimeConfig = () => fs.readFileSync(PATH_TO_BUILD_INFO_JSON)

/**
 * Atomically write to a file to prevent race conditions with file watchers
 * @param {string} filePath
 * @param {string} content
 */
function writeFileAtomic(filePath, content) {
  const tempPath = filePath + '.tmp'
  fs.writeFileSync(tempPath, content)
  fs.renameSync(tempPath, filePath)
}

/**
 * @param {semver.ReleaseType} releaseType
 */
export default async function increasePackageVersion(releaseType = 'prerelease') {
  const runtimeConfig = JSON.parse(getRuntimeConfig().toString('utf-8'))
  const packageInfo = JSON.parse(getPackageInfo().toString('utf-8'))
  packageInfo.version = semver.inc(packageInfo.version, releaseType)

  writeFileAtomic(PATH_TO_PACKAGE_JSON, JSON.stringify(packageInfo, null, 2))

  runtimeConfig.name = packageInfo.name
  runtimeConfig.version = packageInfo.version
  runtimeConfig.buildVersion =
    typeof runtimeConfig.buildVersion === 'number' ? runtimeConfig.buildVersion + 1 : 1
  runtimeConfig.buildTime = Number(new Date())
  runtimeConfig.buildHash = execSync('git rev-parse HEAD').toString().trim()
  writeFileAtomic(PATH_TO_BUILD_INFO_JSON, JSON.stringify(runtimeConfig, null, 2))
}
