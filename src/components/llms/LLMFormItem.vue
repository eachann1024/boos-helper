<script lang="ts" setup>
import type { formElm, llmInfoVal } from '@/composables/useModel/type'
import { ElFormItem, ElIcon, ElInput, ElInputNumber, ElSelectV2, ElSlider, ElSwitch, ElText, ElTooltip } from 'element-plus'

import Info from '@/components/icon/Info.vue'

const props = defineProps<{
  value: llmInfoVal<unknown, { required: boolean }>
  label: string | number | symbol
  depth?: number
}>()

const fromVal = defineModel<any>({ required: true })

function getComponent(elm: formElm['type'] | undefined) {
  switch (elm) {
    case 'input':
      return { el: ElInput, defaultConf: { clearable: true } }
    case 'inputNumber':
      return { el: ElInputNumber, defaultConf: {} }
    case 'select':
      return { el: ElSelectV2, defaultConf: { options: [] } }
    case 'slider':
      return {
        el: ElSlider,
        defaultConf: { style: 'margin: 0 10px;', showInput: true },
      }
    case 'switch':
      return { el: ElSwitch, defaultConf: {} }
  }
  return { el: undefined, defaultConf: {} }
}

const { el, defaultConf } = getComponent(props.value.type)
</script>

<template>
  <template v-if="value && 'alert' in value">
    <div
      class="llm-alert-box"
      :class="`llm-alert-box--${value.alert}`"
      :style="`margin: 10px 0px 20px ${(props.depth || 0) * 10}px;`"
    >
      <div class="llm-alert-box__title">
        {{ value.label || label.toString() }}
      </div>
      <div v-if="value.desc" class="llm-alert-box__desc">
        {{ value.desc }}
      </div>
    </div>
    <LLMFormItem
      v-for="(x, k) in value.value"
      :key="k"
      v-model="fromVal[k]"
      :value="x"
      :label="k"
      :depth="(depth || 0) + 1"
    />
  </template>
  <ElFormItem
    v-else-if="value"
    :required="value.required"
    :style="`margin-left: ${(props.depth || 0) * 10}px;`"
  >
    <template #label>
      <ElText size="large">
        {{ value.label || label }}
      </ElText>
      <ElTooltip
        v-if="value.desc"
        :content="`<span>${value.desc}</span>`"
        raw-content
      >
        <ElIcon style="margin-left: 8px">
          <Info />
        </ElIcon>
      </ElTooltip>
    </template>
    <component
      :is="el"
      v-model="fromVal"
      v-bind="{ ...defaultConf, ...value.config }"
    />
  </ElFormItem>
</template>

<style>
.ehp-input__wrapper {
  width: 100%;
}

.ehp-slider .ehp-slider__input {
  width: 200px !important;
}

.llm-alert-box {
  border-radius: 8px;
  padding: 10px 12px;
  line-height: 1.4;
}

.llm-alert-box__title {
  font-weight: 600;
}

.llm-alert-box__desc {
  margin-top: 4px;
  white-space: pre-line;
}

.llm-alert-box--success {
  background: #f0f9eb;
  color: #3d6b1f;
}

.llm-alert-box--warning {
  background: #fdf6ec;
  color: #8a4f08;
}

.llm-alert-box--info {
  background: #ecf5ff;
  color: #1d4f91;
}

.llm-alert-box--error {
  background: #fef0f0;
  color: #8f1f1f;
}
</style>
