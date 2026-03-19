import { defineStore } from 'pinia'
import { NewReleaseInfo } from '../../../common/types/update'
import { ref } from 'vue'
import { throttle } from 'lodash'

export const useUpdateStore = defineStore('update', () => {
  const availableNewRelease = ref<NewReleaseInfo | null>(null)

  async function checkUpdate() {
    let result: NewReleaseInfo | null = null
    try {
      result = (await electron.ipcRenderer.invoke('check-update')) as NewReleaseInfo | null
    } catch {
      //
    }
    availableNewRelease.value = result
  }
  checkUpdate()
  setInterval(checkUpdate, 30 * 30 * 1000)
  return { availableNewRelease }
})

export const useTaskManagerStore = defineStore('taskManager', () => {
  const runningTasks = ref<unknown[]>([])
  function getRunningTasks() {
    const { ipcRenderer } = electron
    ipcRenderer.invoke('get-task-manager-list').then(res => {
      runningTasks.value = res.workers ?? []
    })
  }
  const throttledGetRunningTasks = throttle(getRunningTasks, 2000)
  setInterval(throttledGetRunningTasks, 2 * 1000)
  return { runningTasks, getRunningTasks: throttledGetRunningTasks }
})

// 运行步骤状态 store，用于在页面切换时保持状态
export const useRunningStepsStore = defineStore('runningSteps', () => {
  const stepsMap = ref<Map<string, any[]>>(new Map())
  const currentRunningStatusMap = ref<Map<string, number>>(new Map())
  const runRecordIdMap = ref<Map<string, number | null>>(new Map())

  function getSteps(workerId: string) {
    return stepsMap.value.get(workerId) || []
  }

  function setSteps(workerId: string, steps: any[]) {
    stepsMap.value.set(workerId, steps)
  }

  function updateStepStatus(workerId: string, stepId: string, status: string) {
    const steps = stepsMap.value.get(workerId)
    if (steps) {
      const step = steps.find((s) => s.id === stepId)
      if (step) {
        step.status = status
      }
    }
  }

  function getRunningStatus(workerId: string) {
    return currentRunningStatusMap.value.get(workerId) || 0
  }

  function setRunningStatus(workerId: string, status: number) {
    currentRunningStatusMap.value.set(workerId, status)
  }

  function getRunRecordId(workerId: string) {
    return runRecordIdMap.value.get(workerId) || null
  }

  function setRunRecordId(workerId: string, runRecordId: number | null) {
    runRecordIdMap.value.set(workerId, runRecordId)
  }

  function clearWorkerState(workerId: string) {
    stepsMap.value.delete(workerId)
    currentRunningStatusMap.value.delete(workerId)
    runRecordIdMap.value.delete(workerId)
  }

  return {
    getSteps,
    setSteps,
    updateStepStatus,
    getRunningStatus,
    setRunningStatus,
    getRunRecordId,
    setRunRecordId,
    clearWorkerState
  }
})
