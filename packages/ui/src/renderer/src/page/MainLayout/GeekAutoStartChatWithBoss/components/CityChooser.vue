<template>
  <div w-full>
    <slot
      :model-value="displayValue"
      :show-dialog="() => (isDialogVisible = true)"
      :clear-value="handleClearSelectedCitiesInModelValue"
    ></slot>
    <el-dialog
      v-model="isDialogVisible"
      width="1100px"
      title="请选择工作地"
      :show-close="false"
      append-to-body
      custom-class="city-chooser-dialog"
      @open="handleDialogOpen"
      @closed="handleDialogClosed"
    >
      <div flex gap-20px class="city-chooser-content">
        <!-- 左侧：城市选择 -->
        <div flex-1 flex flex-col overflow-hidden>
          <el-tabs v-model="activeTabName" flex-1 flex flex-col class="city-tabs">
            <el-tab-pane
              class="tab-pane-content"
              label="热门城市"
              name="热门城市"
            >
              <el-checkbox-group v-if="multiple" v-model="selectedCities">
                <div
                  :style="{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr'
                  }"
                >
                  <el-checkbox
                    v-for="op in hotCityList.filter((it) => it.code !== 100010000)"
                    :key="op.code"
                    :label="op.name"
                    @change="(val) => handleCityChange(op.name, val)"
                  >
                    {{ op.name }}
                  </el-checkbox>
                </div>
              </el-checkbox-group>
              <el-radio-group v-else v-model="selectedCities" w-full>
                <div
                  w-full
                  :style="{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr'
                  }"
                >
                  <el-radio
                    v-for="op in hotCityList.filter((it) => it.code !== 100010000)"
                    :key="op.code"
                    :label="op.name"
                    @change="() => handleSingleCitySelect(op.name)"
                  >
                    {{ op.name }}
                  </el-radio>
                </div>
              </el-radio-group>
            </el-tab-pane>
            <el-tab-pane
              v-for="it in cityGroupsByAlphabetMap.keys()"
              :key="it"
              class="tab-pane-content"
              :label="it"
              :value="it"
            >
              <div v-for="group in cityGroupsByAlphabetMap.get(it)" :key="group.firstChar">
                <div pt4px pb4px>{{ group.firstChar }}</div>
                <el-checkbox-group v-if="multiple" v-model="selectedCities">
                  <div
                    :style="{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr'
                    }"
                  >
                    <el-checkbox 
                      v-for="op in group.cityList" 
                      :key="op.code" 
                      :label="op.name"
                      @change="(val) => handleCityChange(op.name, val)"
                    >
                      {{ op.name }}
                    </el-checkbox>
                  </div>
                </el-checkbox-group>
                <el-radio-group v-else v-model="selectedCities" w-full>
                  <div
                    w-full
                    :style="{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr'
                    }"
                  >
                    <el-radio 
                      v-for="op in group.cityList" 
                      :key="op.code" 
                      :label="op.name"
                      @change="() => handleSingleCitySelect(op.name)"
                    >
                      {{ op.name }}
                    </el-radio>
                  </div>
                </el-radio-group>
              </div>
            </el-tab-pane>
          </el-tabs>
        </div>

        <!-- 右侧：区域选择（仅多选模式且选择了城市时显示） -->
        <div v-if="multiple && currentSelectedCity" w-350px border-l border-gray-200 pl-20px flex flex-col>
          <div flex justify-between items-center mb-10px>
            <span font-size-14px font-bold>{{ currentSelectedCity }} - 选择区域</span>
            <el-button v-if="hasDistricts(currentSelectedCity)" type="primary" size="small" text @click="selectAllDistricts(currentSelectedCity)">
              全选
            </el-button>
          </div>
          <div flex-1 overflow-auto>
            <div v-if="getCityDistricts(currentSelectedCity).length > 0">
              <el-checkbox-group v-model="selectedDistrictsMap[currentSelectedCity]">
                <div flex flex-col gap-8px>
                  <el-checkbox
                    v-for="district in getCityDistricts(currentSelectedCity)"
                    :key="district.code"
                    :label="district.name"
                  >
                    {{ district.name }}
                  </el-checkbox>
                </div>
              </el-checkbox-group>
            </div>
            <div v-else style="color: #999" text-center mt-50px>
              该城市暂无区域数据<br>将匹配整个城市
            </div>
          </div>
        </div>
        <div v-else-if="multiple" w-350px border-l border-gray-200 pl-20px flex items-center justify-center style="color: #999">
          请在左侧选择城市<br>可精确选择该城市的区域
        </div>
      </div>

      <template #footer>
        <div
          :style="{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }"
        >
          <div flex flex-1 mr-12px text-left flex-col>
            <template v-if="selectedCities?.length">
              <div flex flex-items-center font-size-14px flex-0 ws-nowrap>
                <el-button
                  v-if="multiple && selectedCities?.length"
                  type="danger"
                  size="small"
                  @click="handleClearSelectedCitiesInDialog"
                  >清空已选择的所有城市</el-button
                >
              </div>
              <div flex flex-1 flex-wrap gap-6px mt-10px of-auto max-h-120px>
                <span font-size-13px style="color: #999" flex items-center>已选择：</span>
                <template v-if="multiple">
                  <el-tag
                    v-for="item in displaySelectedItems"
                    :key="item.key"
                    closable
                    @close="handleRemoveSelected(item)"
                  >
                    {{ item.label }}
                  </el-tag>
                </template>
                <el-tag v-else closable @close="selectedCities = null">
                  {{ selectedCities }}
                </el-tag>
              </div>
            </template>
            <span v-else font-size-13px style="color: #999">未选择任何城市</span>
          </div>
          <div flex-0 ws-nowrap>
            <el-button @click="handleCancelClicked">取消</el-button>
            <el-button type="primary" @click="handleConfirmClicked">确定</el-button>
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
import { PropType, ref, computed, watch } from 'vue'
import cityGroupData from '@geekgeekrun/geek-auto-start-chat-with-boss/cityGroup.mjs'
import { gtagRenderer } from '@renderer/utils/gtag'
import { ElRadioGroup } from 'element-plus'

// 城市数据
const { hotCityList, cityGroup } = cityGroupData.zpData

// 创建城市到区域的映射
const cityToDistrictsMap = new Map()
for (const group of cityGroup) {
  for (const city of group.cityList) {
    if (city.subLevelModelList && city.subLevelModelList.length > 0) {
      cityToDistrictsMap.set(city.name, city.subLevelModelList)
    }
  }
}

// Props 和 Emits
const props = defineProps({
  modelValue: {
    type: [Array, String] as PropType<string[] | string | null>,
    default: null
  },
  multiple: {
    type: Boolean,
    default: true
  },
  gtShowScene: {
    type: String
  }
})
const emits = defineEmits(['update:modelValue'])

// 状态
const activeTabName = ref('热门城市')
const isDialogVisible = ref(false)
const selectedCities = ref<string[]>([])
const selectedDistrictsMap = ref<Record<string, string[]>>({})
const currentSelectedCity = ref<string | null>(null)

// 计算属性：按字母分组的城市
const cityGroupsByAlphabetMap = ref(
  new Map(['ABCDE', 'FGHJ', 'KLMN', 'PQRST', 'WXYZ'].map((it) => [it, []]))
)
for (const group of cityGroup) {
  const { firstChar } = group
  const targetKey =
    [...cityGroupsByAlphabetMap.value.keys()].find((it) => it.includes(firstChar)) ?? null
  if (!targetKey) {
    if (!cityGroupsByAlphabetMap.value.get(targetKey)) {
      cityGroupsByAlphabetMap.value.set(targetKey, [])
    }
  }
  cityGroupsByAlphabetMap.value.get(targetKey)?.push(group)
}

// 计算属性：显示值
const displayValue = computed(() => {
  return props.modelValue
})

// 计算属性：用于显示已选项的列表
const displaySelectedItems = computed(() => {
  const items: { key: string; label: string; city: string; district?: string }[] = []
  for (const city of selectedCities.value || []) {
    const districts = selectedDistrictsMap.value[city] || []
    if (districts.length === 0) {
      items.push({ key: city, label: city, city })
    } else {
      for (const district of districts) {
        items.push({ key: `${city}-${district}`, label: `${city}-${district}`, city, district })
      }
    }
  }
  return items
})

// 获取城市的区域列表
function getCityDistricts(cityName: string) {
  return cityToDistrictsMap.get(cityName) || []
}

// 检查城市是否有区域数据
function hasDistricts(cityName: string) {
  return getCityDistricts(cityName).length > 0
}

// 处理城市选择变化
function handleCityChange(cityName: string, checked: boolean) {
  if (checked) {
    currentSelectedCity.value = cityName
    if (!selectedDistrictsMap.value[cityName]) {
      selectedDistrictsMap.value[cityName] = []
    }
  } else {
    delete selectedDistrictsMap.value[cityName]
    if (currentSelectedCity.value === cityName) {
      currentSelectedCity.value = selectedCities.value.length > 0 ? selectedCities.value[0] : null
    }
  }
}

// 处理单选城市
function handleSingleCitySelect(cityName: string) {
  selectedCities.value = [cityName]
}

// 全选某个城市的所有区域
function selectAllDistricts(cityName: string) {
  const districts = getCityDistricts(cityName)
  selectedDistrictsMap.value[cityName] = districts.map((d: any) => d.name)
}

// 移除选择
function handleRemoveSelected(item: { city: string; district?: string }) {
  if (item.district) {
    // 移除特定区域
    const districts = selectedDistrictsMap.value[item.city] || []
    const index = districts.indexOf(item.district)
    if (index > -1) {
      districts.splice(index, 1)
    }
    // 如果该城市没有选中的区域了，且用户想移除城市本身
    if (districts.length === 0) {
      const cityIndex = selectedCities.value.indexOf(item.city)
      if (cityIndex > -1) {
        selectedCities.value.splice(cityIndex, 1)
        delete selectedDistrictsMap.value[item.city]
      }
    }
  } else {
    // 移除整个城市
    const cityIndex = selectedCities.value.indexOf(item.city)
    if (cityIndex > -1) {
      selectedCities.value.splice(cityIndex, 1)
      delete selectedDistrictsMap.value[item.city]
    }
  }
  
  gtagRenderer('remove_selected_cities_in_dialog_clicked', {
    gtShowScene: props.gtShowScene,
    multiple: Boolean(props.multiple)
  })
}

// 生成保存的值
function generateValue(): string[] {
  const result: string[] = []
  for (const city of selectedCities.value || []) {
    const districts = selectedDistrictsMap.value[city] || []
    if (districts.length === 0) {
      // 没有选择区域，只保存城市名
      result.push(city)
    } else {
      // 选择了区域，保存城市-区域格式
      for (const district of districts) {
        result.push(`${city}-${district}`)
      }
    }
  }
  return result
}

// 解析传入的值
function parseValue(value: string[] | string | null) {
  const cities: string[] = []
  const districtsMap: Record<string, string[]> = {}
  
  if (!value) return { cities, districtsMap }
  
  const arr = Array.isArray(value) ? value : [value]
  
  for (const item of arr) {
    if (item.includes('-')) {
      // 格式: 城市-区域
      const [city, ...districtParts] = item.split('-')
      const district = districtParts.join('-') // 处理区域名中可能包含的-
      if (!cities.includes(city)) {
        cities.push(city)
      }
      if (!districtsMap[city]) {
        districtsMap[city] = []
      }
      if (!districtsMap[city].includes(district)) {
        districtsMap[city].push(district)
      }
    } else {
      // 只有城市名
      if (!cities.includes(item)) {
        cities.push(item)
      }
    }
  }
  
  return { cities, districtsMap }
}

function handleDialogOpen() {
  activeTabName.value = '热门城市'
  
  // 解析传入的值
  const { cities, districtsMap } = parseValue(props.modelValue)
  selectedCities.value = cities
  selectedDistrictsMap.value = districtsMap
  
  // 设置当前选中的城市为第一个有区域数据的城市
  if (cities.length > 0) {
    currentSelectedCity.value = cities.find(c => hasDistricts(c)) || cities[0]
  }
  
  gtagRenderer('choose_city_dialog_open', { gtShowScene: props.gtShowScene })
}

function handleCancelClicked() {
  gtagRenderer('choose_city_cancel_button_clicked', { gtShowScene: props.gtShowScene })
  isDialogVisible.value = false
}

function handleConfirmClicked() {
  const value = props.multiple ? generateValue() : selectedCities.value[0] || null
  
  gtagRenderer('choose_city_confirm_button_clicked', {
    gtShowScene: props.gtShowScene,
    value: Array.isArray(value) ? value.join(',') : value
  })
  isDialogVisible.value = false
  emits('update:modelValue', value)
}

function handleDialogClosed() {
  selectedCities.value = []
  selectedDistrictsMap.value = {}
  currentSelectedCity.value = null
  gtagRenderer('choose_city_dialog_closed', { gtShowScene: props.gtShowScene })
}

function handleClearSelectedCitiesInModelValue() {
  emits('update:modelValue', props.multiple ? [] : null)
  gtagRenderer('clear_selected_cities_in_mv_clicked', { gtShowScene: props.gtShowScene })
}

function handleClearSelectedCitiesInDialog() {
  selectedCities.value = []
  selectedDistrictsMap.value = {}
  currentSelectedCity.value = null
  gtagRenderer('clear_selected_cities_in_dialog_clicked', { gtShowScene: props.gtShowScene })
}
</script>

<style lang="scss">
/* 确保弹窗高度合适，内容可滚动，footer 始终可见 */
.city-chooser-dialog {
  .el-dialog {
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    margin-top: 5vh !important;
  }
  
  .el-dialog__body {
    flex: 1;
    overflow: hidden;
    padding: 15px 20px;
  }
  
  .city-chooser-content {
    height: 450px;
    max-height: 55vh;
  }
  
  .city-tabs {
    height: 100%;
    
    .el-tabs__content {
      height: calc(100% - 50px);
      overflow: auto;
    }
  }
  
  .tab-pane-content {
    height: 100%;
    overflow: auto;
  }
  
  .el-dialog__footer {
    padding: 12px 20px;
    border-top: 1px solid #e4e7ed;
    flex-shrink: 0;
  }
}

/* 响应式适配 */
@media screen and (max-height: 800px) {
  .city-chooser-dialog {
    .el-dialog {
      max-height: 90vh;
      margin-top: 2vh !important;
    }
    
    .city-chooser-content {
      height: 380px;
    }
  }
}
</style>
