/**
 * 进程锁模块 - 防止重复运行
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

const LOCK_FILE = path.join(os.homedir(), '.dagegong-cli', '.run.lock');
const PROCESS_NAME = 'dagegong-cli';

/**
 * 写入进程锁
 */
export function writeLock(pid = process.pid) {
  try {
    fs.writeFileSync(LOCK_FILE, String(pid), 'utf8');
  } catch (err) {
    console.warn('写入进程锁失败:', err.message);
  }
}

/**
 * 清除进程锁
 */
export function clearLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch (err) {
    // 忽略错误
  }
}

/**
 * 读取锁文件中的 PID
 */
function readLockPid() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const pid = fs.readFileSync(LOCK_FILE, 'utf8').trim();
      return parseInt(pid, 10);
    }
  } catch (err) {
    // 忽略错误
  }
  return null;
}

/**
 * 检查进程是否存在
 */
function isProcessRunning(pid) {
  try {
    if (process.platform === 'win32') {
      // Windows: 使用 tasklist 并检查输出
      const output = execSync(`tasklist /FI "PID eq ${pid}" /NH`, { encoding: 'utf8', stdio: 'pipe' });
      // 如果输出包含 "No tasks" 或为空，说明进程不存在
      return output && !output.includes('No tasks') && output.trim().length > 0;
    } else {
      // Linux/Mac: 发送信号 0 检查进程是否存在
      process.kill(pid, 0);
      return true;
    }
  } catch (err) {
    return false;
  }
}

/**
 * 检查是否有现有进程在运行
 * @returns {number|null} 返回正在运行的进程 PID，如果没有则返回 null
 */
export async function checkExistingProcess() {
  const lockedPid = readLockPid();
  
  if (!lockedPid) {
    // 没有锁文件，写入当前进程锁
    writeLock();
    return null;
  }
  
  // 检查锁定的进程是否还在运行
  if (lockedPid === process.pid) {
    // 是当前进程自己
    return null;
  }
  
  if (isProcessRunning(lockedPid)) {
    // 进程确实在运行
    return lockedPid;
  }
  
  // 锁文件存在但进程已不存在（僵尸锁）
  clearLock();
  writeLock();
  return null;
}

/**
 * 设置进程退出时清理锁
 */
export function setupLockCleanup() {
  const cleanup = () => {
    clearLock();
    process.exit(0);
  };
  
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', clearLock);
}
