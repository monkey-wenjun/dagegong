---
name: vue-component-standards
description: "Vue 3 component standards for the dagegong project. Covers Composition API patterns, component organization, state management, TypeScript integration, and Element Plus usage in Electron renderer process."
---

# Vue 3 Component Standards for dagegong

Comprehensive guide for Vue 3 development using Composition API and TypeScript.

## Component Structure

### File Organization

```
src/renderer/src/
├── components/                 # Reusable components
│   ├── common/                # Global common components
│   │   ├── AppButton/
│   │   │   ├── index.vue
│   │   │   └── types.ts
│   │   └── AppModal/
│   ├── layout/                # Layout components
│   └── features/              # Feature-specific components
├── views/                     # Page-level components
│   ├── MainLayout/
│   ├── Settings/
│   └── Dashboard/
├── composables/               # Reusable composition functions
│   ├── useUser.ts
│   ├── useDatabase.ts
│   └── useBrowser.ts
├── stores/                    # Pinia stores
│   ├── user.ts
│   └── app.ts
├── utils/                     # Utility functions
└── types/                     # TypeScript types
```

### Component Template

```vue
<!-- components/common/AppButton/index.vue -->
<template>
  <button
    :class="buttonClasses"
    :disabled="disabled || loading"
    @click="handleClick"
  >
    <AppSpinner v-if="loading" size="small" />
    <slot v-else />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AppSpinner from '../AppSpinner/index.vue'

interface Props {
  variant?: 'primary' | 'secondary' | 'danger'
  size?: 'small' | 'medium' | 'large'
  disabled?: boolean
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'medium',
  disabled: false,
  loading: false
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

const buttonClasses = computed(() => [
  'app-button',
  `app-button--${props.variant}`,
  `app-button--${props.size}`,
  {
    'app-button--loading': props.loading,
    'app-button--disabled': props.disabled
  }
])

function handleClick(event: MouseEvent) {
  if (!props.loading && !props.disabled) {
    emit('click', event)
  }
}
</script>

<style scoped>
.app-button {
  @apply inline-flex items-center justify-center rounded font-medium
         transition-colors duration-200 focus:outline-none focus:ring-2;
}

.app-button--primary {
  @apply bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500;
}

.app-button--small {
  @apply px-3 py-1.5 text-sm;
}

.app-button--loading {
  @apply cursor-wait opacity-70;
}
</style>
```

## Composition API Patterns

### Setup Function Organization

```vue
<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useDatabase } from '@/composables/useDatabase'
import type { UserProfile } from '@/types'

// 1. Props & Emits
interface Props {
  userId: string
  editable?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  saved: [profile: UserProfile]
  cancel: []
}>()

// 2. External Composables (grouped)
const router = useRouter()
const userStore = useUserStore()
const { query, isLoading: dbLoading } = useDatabase()

// 3. Reactive State (grouped by purpose)
// UI state
const isEditing = ref(false)
const showConfirmDialog = ref(false)

// Data state
const profile = ref<UserProfile | null>(null)
const formData = ref<Partial<UserProfile>>({})
const errors = ref<Record<string, string>>({})

// 4. Computed Properties
const isLoading = computed(() => dbLoading.value || userStore.isLoading)
const canSave = computed(() => {
  return formData.value.name?.trim() && 
         formData.value.email?.trim() &&
         Object.keys(errors.value).length === 0
})

// 5. Watchers
watch(() => props.userId, loadProfile, { immediate: true })

watch(formData, (newVal) => {
  validateForm(newVal)
}, { deep: true })

// 6. Lifecycle Hooks
onMounted(() => {
  initializeForm()
})

// 7. Methods (organized by functionality)
// Data loading
async function loadProfile() {
  try {
    const result = await query<UserProfile>(
      'SELECT * FROM users WHERE id = ?',
      [props.userId]
    )
    profile.value = result[0] || null
    formData.value = { ...profile.value }
  } catch (error) {
    console.error('Failed to load profile:', error)
  }
}

// Form handling
function initializeForm() {
  formData.value = { ...profile.value }
  errors.value = {}
}

function validateForm(data: Partial<UserProfile>) {
  const newErrors: Record<string, string> = {}
  
  if (!data.name?.trim()) {
    newErrors.name = 'Name is required'
  }
  
  if (!data.email?.includes('@')) {
    newErrors.email = 'Valid email is required'
  }
  
  errors.value = newErrors
}

async function handleSave() {
  if (!canSave.value) return
  
  try {
    await userStore.updateProfile(props.userId, formData.value)
    emit('saved', formData.value as UserProfile)
    isEditing.value = false
  } catch (error) {
    console.error('Failed to save:', error)
  }
}

function handleCancel() {
  if (hasUnsavedChanges.value) {
    showConfirmDialog.value = true
  } else {
    emit('cancel')
  }
}
</script>
```

### Composables Pattern

```typescript
// composables/useDatabase.ts
import { ref, readonly } from 'vue'
import type { IpcResult } from '@/types'

interface QueryOptions {
  immediate?: boolean
}

export function useDatabase() {
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  
  async function query<T>(
    sql: string, 
    params?: any[]
  ): Promise<T[]> {
    isLoading.value = true
    error.value = null
    
    try {
      const result: IpcResult<T[]> = await window.electronAPI.invoke(
        'db:query',
        sql,
        params
      )
      
      if (!result.success) {
        throw new Error(result.error)
      }
      
      return result.data
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Query failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }
  
  async function execute(
    sql: string,
    params?: any[]
  ): Promise<void> {
    isLoading.value = true
    error.value = null
    
    try {
      const result = await window.electronAPI.invoke('db:execute', sql, params)
      
      if (!result.success) {
        throw new Error(result.error)
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Execute failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }
  
  return {
    isLoading: readonly(isLoading),
    error: readonly(error),
    query,
    execute
  }
}

// composables/useAsyncAction.ts
import { ref, readonly } from 'vue'

interface UseAsyncActionOptions {
  onError?: (error: Error) => void
  onSuccess?: () => void
}

export function useAsyncAction<T extends (...args: any[]) => Promise<any>>(
  action: T,
  options: UseAsyncActionOptions = {}
) {
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  
  async function execute(...args: Parameters<T>): Promise<ReturnType<T> | undefined> {
    isLoading.value = true
    error.value = null
    
    try {
      const result = await action(...args)
      options.onSuccess?.()
      return result
    } catch (err) {
      const errorInstance = err instanceof Error ? err : new Error(String(err))
      error.value = errorInstance.message
      options.onError?.(errorInstance)
    } finally {
      isLoading.value = false
    }
  }
  
  return {
    isLoading: readonly(isLoading),
    error: readonly(error),
    execute
  }
}

// Usage in component
const { isLoading, error, execute: saveData } = useAsyncAction(
  async (formData: FormData) => {
    await window.electronAPI.invoke('data:save', formData)
  },
  {
    onSuccess: () => {
      ElMessage.success('Saved successfully')
    },
    onError: (error) => {
      ElMessage.error(`Save failed: ${error.message}`)
    }
  }
)
```

## State Management (Pinia)

### Store Pattern

```typescript
// stores/user.ts
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { User, UserSettings } from '@/types'

export const useUserStore = defineStore('user', () => {
  // State
  const currentUser = ref<User | null>(null)
  const settings = ref<UserSettings>({
    theme: 'light',
    language: 'zh-CN',
    notifications: true
  })
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  
  // Getters
  const isLoggedIn = computed(() => !!currentUser.value)
  const userName = computed(() => currentUser.value?.name ?? '')
  const isDarkMode = computed(() => settings.value.theme === 'dark')
  
  // Actions
  async function login(credentials: { email: string; password: string }) {
    isLoading.value = true
    error.value = null
    
    try {
      const result = await window.electronAPI.invoke('auth:login', credentials)
      
      if (!result.success) {
        throw new Error(result.error)
      }
      
      currentUser.value = result.data
      await loadSettings()
      
      return result.data
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Login failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }
  
  async function loadSettings() {
    if (!currentUser.value) return
    
    try {
      const result = await window.electronAPI.invoke(
        'settings:get',
        currentUser.value.id
      )
      
      if (result.success) {
        settings.value = { ...settings.value, ...result.data }
      }
    } catch (err) {
      console.error('Failed to load settings:', err)
    }
  }
  
  async function updateSettings(newSettings: Partial<UserSettings>) {
    if (!currentUser.value) return
    
    const updated = { ...settings.value, ...newSettings }
    
    try {
      const result = await window.electronAPI.invoke(
        'settings:update',
        currentUser.value.id,
        newSettings
      )
      
      if (result.success) {
        settings.value = updated
      }
    } catch (err) {
      console.error('Failed to update settings:', err)
      throw err
    }
  }
  
  function logout() {
    currentUser.value = null
    settings.value = {
      theme: 'light',
      language: 'zh-CN',
      notifications: true
    }
  }
  
  return {
    // State
    currentUser,
    settings,
    isLoading,
    error,
    // Getters
    isLoggedIn,
    userName,
    isDarkMode,
    // Actions
    login,
    loadSettings,
    updateSettings,
    logout
  }
})
```

## TypeScript Integration

### Type Declarations

```typescript
// types/index.ts
// Global Window interface for exposed Electron API
declare global {
  interface Window {
    electronAPI: {
      invoke: <T>(channel: string, ...args: any[]) => Promise<T>
      send: (channel: string, ...args: any[]) => void
      on: (channel: string, callback: (...args: any[]) => void) => () => void
      once: (channel: string, callback: (...args: any[]) => void) => void
    }
  }
}

// Domain types
export interface User {
  id: string
  email: string
  name: string
  avatar?: string
  createdAt: Date
}

export interface UserSettings {
  theme: 'light' | 'dark' | 'auto'
  language: string
  notifications: boolean
}

export interface IpcResult<T> {
  success: boolean
  data?: T
  error?: string
}

// Component prop types
export interface TableColumn<T = any> {
  key: string
  title: string
  width?: number
  sortable?: boolean
  formatter?: (row: T) => string
}
```

### Generic Components

```vue
<!-- components/common/AppTable/index.vue -->
<script setup lang="ts" generic="T extends Record<string, any>">
import { computed } from 'vue'

interface Column {
  key: keyof T
  title: string
  width?: string
}

interface Props {
  data: T[]
  columns: Column[]
  loading?: boolean
  rowKey: keyof T
}

const props = defineProps<Props>()
const emit = defineEmits<{
  rowClick: [row: T]
  sort: [key: keyof T, order: 'asc' | 'desc']
}>()

const tableData = computed(() => props.data)
</script>
```

## Element Plus Integration

### Form Components

```vue
<template>
  <el-form
    ref="formRef"
    :model="formData"
    :rules="rules"
    label-width="100px"
    @submit.prevent="handleSubmit"
  >
    <el-form-item label="Username" prop="username">
      <el-input v-model="formData.username" placeholder="Enter username" />
    </el-form-item>
    
    <el-form-item label="Email" prop="email">
      <el-input v-model="formData.email" type="email" />
    </el-form-item>
    
    <el-form-item label="Role" prop="role">
      <el-select v-model="formData.role" placeholder="Select role">
        <el-option
          v-for="role in roles"
          :key="role.value"
          :label="role.label"
          :value="role.value"
        />
      </el-select>
    </el-form-item>
    
    <el-form-item>
      <el-button type="primary" native-type="submit" :loading="isLoading">
        Submit
      </el-button>
      <el-button @click="handleReset">Reset</el-button>
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'

const formRef = ref<FormInstance>()

const formData = reactive({
  username: '',
  email: '',
  role: ''
})

const rules: FormRules = {
  username: [
    { required: true, message: 'Username is required', trigger: 'blur' },
    { min: 3, max: 20, message: 'Length should be 3 to 20', trigger: 'blur' }
  ],
  email: [
    { required: true, message: 'Email is required', trigger: 'blur' },
    { type: 'email', message: 'Please input correct email', trigger: 'blur' }
  ],
  role: [
    { required: true, message: 'Please select role', trigger: 'change' }
  ]
}

const isLoading = ref(false)

async function handleSubmit() {
  if (!formRef.value) return
  
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  
  isLoading.value = true
  try {
    await submitForm(formData)
    ElMessage.success('Submitted successfully')
  } finally {
    isLoading.value = false
  }
}

function handleReset() {
  formRef.value?.resetFields()
}
</script>
```

### Table with Pagination

```vue
<template>
  <div class="data-table">
    <el-table
      v-loading="loading"
      :data="tableData"
      @sort-change="handleSortChange"
    >
      <el-table-column
        v-for="col in columns"
        :key="col.key"
        :prop="col.key"
        :label="col.title"
        :sortable="col.sortable"
        :width="col.width"
      >
        <template #default="{ row }">
          <slot :name="col.key" :row="row">
            {{ col.formatter ? col.formatter(row) : row[col.key] }}
          </slot>
        </template>
      </el-table-column>
      
      <el-table-column label="Actions" width="150">
        <template #default="{ row }">
          <el-button type="primary" size="small" @click="handleEdit(row)">
            Edit
          </el-button>
          <el-button type="danger" size="small" @click="handleDelete(row)">
            Delete
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    
    <el-pagination
      v-model:current-page="currentPage"
      v-model:page-size="pageSize"
      :total="total"
      :page-sizes="[10, 20, 50, 100]"
      layout="total, sizes, prev, pager, next"
      @size-change="handleSizeChange"
      @current-change="handlePageChange"
    />
  </div>
</template>

<script setup lang="ts" generic="T extends { id: string | number }">
import { ref, watch } from 'vue'

interface Column {
  key: keyof T
  title: string
  width?: number
  sortable?: boolean
  formatter?: (row: T) => string
}

interface Props {
  columns: Column[]
  fetchData: (params: {
    page: number
    pageSize: number
    sort?: { key: string; order: 'asc' | 'desc' }
  }) => Promise<{ data: T[]; total: number }>
}

const props = defineProps<Props>()

const tableData = ref<T[]>([])
const loading = ref(false)
const currentPage = ref(1)
const pageSize = ref(20)
const total = ref(0)
const currentSort = ref<{ key: string; order: 'asc' | 'desc' } | undefined>()

async function loadData() {
  loading.value = true
  try {
    const result = await props.fetchData({
      page: currentPage.value,
      pageSize: pageSize.value,
      sort: currentSort.value
    })
    tableData.value = result.data
    total.value = result.total
  } finally {
    loading.value = false
  }
}

function handlePageChange(page: number) {
  currentPage.value = page
  loadData()
}

function handleSizeChange(size: number) {
  pageSize.value = size
  currentPage.value = 1
  loadData()
}

function handleSortChange({ prop, order }: any) {
  currentSort.value = prop && order
    ? { key: prop, order: order === 'ascending' ? 'asc' : 'desc' }
    : undefined
  loadData()
}

// Initial load
watch(() => props.fetchData, loadData, { immediate: true })
</script>
```

## IPC Communication Patterns

### Service Layer

```typescript
// services/user.service.ts
import type { User, IpcResult } from '@/types'

export const UserService = {
  async getUser(id: string): Promise<User> {
    const result: IpcResult<User> = await window.electronAPI.invoke(
      'user:get',
      id
    )
    
    if (!result.success) {
      throw new Error(result.error)
    }
    
    return result.data
  },
  
  async updateUser(id: string, data: Partial<User>): Promise<User> {
    const result: IpcResult<User> = await window.electronAPI.invoke(
      'user:update',
      id,
      data
    )
    
    if (!result.success) {
      throw new Error(result.error)
    }
    
    return result.data
  },
  
  async listUsers(params: {
    page: number
    pageSize: number
  }): Promise<{ users: User[]; total: number }> {
    const result: IpcResult<{ users: User[]; total: number }> = 
      await window.electronAPI.invoke('user:list', params)
    
    if (!result.success) {
      throw new Error(result.error)
    }
    
    return result.data
  }
}
```

## Best Practices

### DO
- ✅ Use `<script setup>` for cleaner code
- ✅ Define explicit interfaces for props and emits
- ✅ Use composables for reusable logic
- ✅ Keep components focused on single responsibility
- ✅ Use TypeScript strict mode
- ✅ Handle loading and error states

### DON'T
- ❌ Mix Options API and Composition API
- ❌ Use `any` type
- ❌ Access DOM directly (use refs)
- ❌ Mutate props
- ❌ Use v-for without :key
- ❌ Forget to cleanup event listeners
