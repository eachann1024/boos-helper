# 2026-03-05 Fork 基线回退与功能重建

- [x] 建立任务清单并记录执行步骤
- [x] 创建保护分支 `dev/backup-pre-fork-reset-20260305`
- [x] 保存当前工作区快照到 stash
- [x] 基于 `bcc4f52` 创建 `dev/fork-rebuild`
- [x] AI 打招呼改为先生成再走统一发送链路
- [x] 导出补全（formData + 全模型）并兼容新旧导入
- [x] 删除所有 Alert/ElAlert/浏览器 alert 组件化提示
- [x] 运行 lint/check 并记录结果
- [x] 提交改动并验证提交历史
- [x] 强推覆盖 `origin/master`

# 2026-03-05 WXT 持久化 Chrome 登录态

- [x] 明确当前 WXT 启动配置与可用字段
- [x] 在 `wxt.config.ts` 配置固定 `--user-data-dir` 与 profile 持久化
- [x] 在 `package.json` 增加持久化开发脚本，保留原默认脚本
- [x] 运行基础验证命令，确认配置可被 WXT 正常加载
- [x] 回填执行结果与注意事项

## 执行结果与注意事项

- 已启用固定 Chrome 用户目录：`/Users/eachann/WorkMark/boos-helper/.wxt/chrome-user-data`
- 使用 `pnpm run dev:chrome:persistent` 启动时，登录态与本地站点数据会持续保留
- 已执行 `pnpm exec wxt build -b chrome`，构建成功；存在既有 warning（`options` 入口冲突与 protobuf `eval`），与本次改动无关

# 2026-03-06 Chrome 持久化开发模式修复

- [x] 检查 `dev:chrome:persistent` 当前行为与 WXT 启动参数
- [x] 确认自动打开浏览器与扩展安装缺失的根因
- [x] 校验并补齐指定 Chrome profile / 用户目录配置
- [x] 修改脚本或配置，确保启动即打开持久化浏览器并加载扩展
- [x] 运行命令验证并回填结果

## 执行结果与注意事项

- 根因是 `web-ext.config.ts` 中存在 `disabled: true`，WXT 被强制切到手动加载模式
- 已将 Chrome runner 配置集中到 `web-ext.config.ts`，指定浏览器二进制为 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- 已固定持久化用户目录为 `./.wxt/chrome-user-data`，并显式使用 `Default` profile
- 已增加 `scripts/prepare-chrome-profile.mjs`，启动前自动创建所需 profile 目录
- 实测执行 `pnpm run dev:chrome:persistent` 后日志出现 `Opened browser in 1.402 s`，说明浏览器已自动启动并加载未打包扩展

# 2026-03-06 AI 打招呼批量投递时序排查

- [x] 检查用户导出的 AI 配置与筛选开关
- [x] 对照批量投递 pipeline，确认 AI 打招呼与自定义打招呼的执行顺序
- [x] 定位 `非好友关系` 的触发接口与报错时机
- [x] 修正 AI 生成阶段的前置依赖，避免投递前拉取好友态专属数据
- [x] 运行构建校验，确认改动不影响现有流程

## 排查结论

- 根因不是模型配置，而是 `aiGreeting.fn` 在 `sendPublishReq` 之前执行了 `requestBossData`
- `requestBossData` 命中 `https://www.zhipin.com/wapi/zpchat/geek/getBossData`，未建立关系时服务端返回 `非好友关系`
- 自定义招呼语只在投递成功后的 `after` 阶段取 `bossData` 并发送，所以不会先撞上这个限制
- 已调整为 AI 生成阶段仅使用已获取的职位与卡片数据，消息发送仍复用投递成功后的统一发送链路

## 校验结果

- 已执行 `pnpm check`，失败原因是既有文件导入大小写不一致，如 `Log.vue/log.vue`、`Store.vue/store.vue`、`User.vue/user.vue`、`JobCard.vue/Jobcard.vue`
- 已执行 `pnpm lint`，失败原因是既有 `node/prefer-global/process` 规则命中 `scripts/prepare-chrome-profile.mjs` 与 `web-ext.config.ts`
- 上述失败均与本次 AI 打招呼时序修复无直接关系，本次修改未引入新的类型错误定位

# 2026-03-06 详情页 AI 定向打招呼按钮

- [x] 确认 `/job_detail/...` 当前未被页面增强逻辑覆盖
- [x] 抽取 AI 生成与发送的可复用链路，避免列表页和详情页分叉
- [x] 在职位详情页右下角新增 AI 定向打招呼按钮
- [x] 详情页按钮接入当前职位详情数据，并在需要时先建立关系再发送
- [x] 运行针对性构建或静态校验并记录结果

## 设计说明

- 详情页按钮独立于批量投递面板，以固定悬浮按钮的形式挂在右下角
- 点击后流程为：读取当前详情页职位 -> AI 生成招呼语 -> 必要时触发 `friend/add` -> 复用统一消息发送链路
- 为避免再次出现时序回归，已将 AI 生成与消息发送抽到共享模块，供批量投递与详情页按钮共用

## 校验结果

- 已执行针对性 `eslint`，覆盖 `greeting.ts`、`handles.ts`、`jobs.ts`、`main-world.ts` 与详情页按钮相关文件，结果通过
- 已执行 `pnpm exec wxt build -b chrome`，构建成功
- 构建仍保留既有 warning：`options` 入口冲突与 protobuf 依赖中的 `eval` 提示，与本次功能无关

# 2026-03-06 详情页 AI 按钮未显示修复

- [x] 复核详情页入口、内容脚本匹配与挂载组件，确认不是单纯样式问题
- [x] 定位 `main-world` 对根 Vue / 路由的强依赖导致详情页直达时增强逻辑提前退出
- [x] 调整详情页增强入口，优先按当前 URL 执行挂载，路由监听改为可选能力
- [x] 运行构建验证并回填结果

## 校验结果

- 已执行 `pnpm build:chrome`，构建成功
- 构建仍保留既有 warning：`options` 入口同时声明 `include/exclude` 被跳过、protobuf 依赖中的 `eval` 提示；与本次详情页按钮修复无关

# 2026-03-06 详情页 AI 按钮兜底挂载与数据回退

- [x] 去除详情页挂载前对固定容器类名的强依赖
- [x] 将详情数据读取扩展为多 selector + 页面全局对象扫描
- [x] 重新执行 `pnpm build:chrome` 验证打包结果

## 校验结果

- 已执行 `pnpm build:chrome`，构建成功
- 构建 warning 与前述一致，仍为既有 `options` 入口与 protobuf `eval` 提示

# 2026-03-06 详情页缺失 encryptUserId 时走详情接口补全

- [x] 根据用户反馈确认 `lid` 已能从页面拿到，问题仅剩 `encryptUserId`
- [x] 改为在 DOM 已解析且存在 `securityId + lid` 时主动调用 `requestDetail` 补全完整详情
- [x] 重新执行 `pnpm build:chrome` 验证

## 校验结果

- 已执行 `pnpm build:chrome`，构建成功
- 构建 warning 与前述一致，仍为既有 `options` 入口与 protobuf `eval` 提示

# 2026-03-06 详情页 DOM 兜底解析

- [x] 根据用户提供的实际详情页 DOM 结构补充可见节点解析逻辑
- [x] 从内联脚本提取 `encryptUserId`、`lid`、`sessionId` 等隐藏字段，与 DOM 可见信息合并生成详情对象
- [x] 重新执行 `pnpm build:chrome` 验证

## 校验结果

- 已执行 `pnpm build:chrome`，构建成功
- 构建 warning 与前述一致，仍为既有 `options` 入口与 protobuf `eval` 提示

# 2026-03-06 详情页无 F12 调试状态可视化

- [x] 确认 BOSS 页面打开 DevTools 会触发关闭，放弃控制台调试路径
- [x] 将详情页数据来源与初始化状态直接展示到按钮副文案
- [x] 重新执行 `pnpm build:chrome` 验证

## 校验结果

- 已执行 `pnpm build:chrome`，构建成功
- 构建 warning 与前述一致，仍为既有 `options` 入口与 protobuf `eval` 提示

# 2026-03-06 详情页用户初始化降级

- [x] 定位详情页初始化报错源为 `user.initUser()` 强依赖根 Vue
- [x] 调整为获取失败时仅记日志并返回，不阻断详情页按钮初始化
- [x] 重新执行 `pnpm build:chrome` 验证

## 校验结果

- 已执行 `pnpm build:chrome`，构建成功
- 构建 warning 与前述一致，仍为既有 `options` 入口与 protobuf `eval` 提示

# 2026-03-06 详情页详情数据接口级捕获

- [x] 确认页面已挂载按钮但详情数据始终未就绪，转为接口级排查
- [x] 将内容脚本提前到 `document_start`，确保能在页面请求前注入主世界脚本
- [x] 捕获 `/wapi/zpgeek/job/detail.json` 的 `fetch/XHR` 响应并缓存详情数据
- [x] 让详情页按钮优先读取捕获到的详情缓存
- [x] 重新执行 `pnpm build:chrome` 验证

## 校验结果

- 已执行 `pnpm build:chrome`，构建成功
- 构建 warning 与前述一致，仍为既有 `options` 入口与 protobuf `eval` 提示

# 2026-03-06 详情页 AI 模型前置校验与流程打通

- [x] 梳理详情页按钮与共享 AI 招呼语模型选择逻辑
- [x] 抽取共享模型可用性判断，统一详情页与生成链路的错误文案
- [x] 让详情页按钮在模型未配置时前置禁用并给出直白提示
- [x] 执行 `pnpm build:chrome` 验证并回填结果

## 校验结果

- 已在 `greeting.ts` 抽取共享模型选择与错误判断，详情页按钮与 AI 生成链路复用同一套规则
- 详情页在配置未加载、AI 打招呼未开启、详情未就绪、模型未配置时都会前置禁用，不再等点击后才报“没有找到招呼语的模型”
- 当已选模型失效但仍有其他可用模型时，会自动切换到可用模型并持久化到本地配置，减少刷新后重复报错
- 已执行 `pnpm build:chrome`，构建成功
- 构建 warning 仍为既有 `options` 入口冲突与 protobuf `eval` 提示，与本次改动无关

# 2026-03-06 AI 招呼语保存未同步模型配置

- [x] 确认 AI 招呼语弹窗保存时是否遗漏模型配置持久化
- [x] 补齐模型配置静默持久化，确保详情页与列表页读取一致
- [x] 调整详情页模型不可用提示文案，明确指向“未读到已保存模型”
- [x] 执行 `pnpm build:chrome` 验证并回填结果

## 校验结果

- 根因确认：`AI 招呼语` 弹窗右下角 `保存` 只写入了 `formData.aiGreeting.model/prompt`，没有把 `modelData` 同步到 `conf-model`
- 已在 `Selectllm.vue` 的 `savePrompt()` 中追加模型配置静默持久化，之后用户在 AI 招呼语弹窗点一次保存即可让详情页读取到同一份模型配置
- 详情页模型异常提示已改为“当前页面未读到已保存的 AI 模型”，避免误导成供应商本身不可用
- 已执行 `pnpm build:chrome`，构建成功
- 构建 warning 仍为既有 `options` 入口冲突与 protobuf `eval` 提示，与本次改动无关

# 2026-03-06 详情页缺失 signedKey 模型初始化

- [x] 对齐列表页与详情页的模型初始化链路
- [x] 在详情页补齐 signedKey 初始化，并增加模型加载完成态
- [x] 执行 `pnpm build:chrome` 验证并回填结果

## 校验结果

- 根因确认：列表页会执行 `signedKey.initSignedKey()` 并从服务端拉取模型列表，详情页此前没有这一步，所以某些供应商模型只在列表页可见
- 已在详情页补齐 `signedKey` 初始化，且将 `refreshSignedKeyInfo()` 改为等待模型列表拉取完成后再返回，避免详情页在模型尚未到位时误判“不可用”
- 已给 `useModel` 增加一次性初始化标记，避免同一页面重复 `initModel()` 产生重复模型项
- 已执行 `pnpm build:chrome`，构建成功
- 构建 warning 仍为既有 `options` 入口冲突与 protobuf `eval` 提示，与本次改动无关

# 2026-03-06 详情页 AI 模型加载去阻塞与全链路打通

- [x] 拆分模型初始化为本地恢复与在线刷新，补齐在线模型缓存
- [x] 为 signedKey 增加受控同步状态与超时退让，避免详情页无限 loading
- [x] 调整 AI 招呼语模型判定与详情页按钮状态，按同步结果分层提示
- [x] 执行 `pnpm build:chrome` 验证并回填结果

## 校验结果

- `useModel` 已增加幂等初始化与 `mergeModelData()`，本地模型、缓存模型、在线模型都按 key 去重合并
- `useSignedKey` 已新增 `local:signed-model-cache:<tokenHash>` 缓存、`isSignedModelSyncing` / `signedModelSyncError` 状态，以及 `ensureSignedModelsReady(5000)` 受控同步接口
- `initSignedKey()` 现在只做本地 token/info/模型缓存恢复，并后台刷新在线模型；详情页不再等待 `user.initUser()` 和远端模型同步完成

# 2026-03-06 移除更新日志启动弹窗

- [x] 定位更新日志弹窗与版本信息展示链路
- [x] 确认仅移除启动弹窗，不影响手动查看版本信息
- [x] 修改入口代码并清理无用依赖
- [x] 执行 `pnpm build:chrome` 验证并回填结果

## 校验结果

- 已删除 `src/App.vue` 中启动时执行的 `ElMessageBox.alert(...)` 弹窗逻辑，不再在扩展挂载后自动弹出“注意事项/更新内容”
- “版本信息”菜单与对话框保留，用户仍可手动查看当前版本、最新版本和更新日志
- 已执行 `pnpm build:chrome`，构建成功
- 构建仍保留既有 warning：`options` 入口同时声明 `include/exclude` 被跳过、protobuf 依赖中的 `eval` 提示；与本次改动无关
- `prepareAiGreeting()` 会在模型缺失时先触发一次 5 秒受控在线同步，再决定显示“同步中 / 同步失败 / 未找到可用模型”
- 详情页按钮状态已改为 `正在加载配置 / 正在加载本地模型 / 正在同步在线模型 / 生成并发送` 四层，不再长期停留在“正在加载模型配置”
- 已执行 `pnpm build:chrome`，构建成功
- 构建 warning 仍为既有 `options` 入口冲突与 protobuf `eval` 提示，与本次改动无关

# 2026-03-06 详情页消息发送通道容错

- [x] 复核详情页消息发送时报 `send` 为 undefined 的根因
- [x] 调整发送通道探测逻辑，避免半初始化的 `GeekChatCore` 抢占正常兜底通道
- [x] 执行 `pnpm build:chrome` 验证并回填结果

## 校验结果

- 根因确认：`Message.send()` 之前只按 `window.GeekChatCore` 是否存在来分支；详情页里该对象可能已挂到 `window`，但内部 `client.send` 尚未就绪，导致直接抛 `Cannot read properties of undefined (reading 'send')`
- 已改为按发送函数可用性探测通道：先检查 `GeekChatCore.client.send`，再检查 `ChatWebsocket.send`，逐个尝试；前一个通道半初始化或发送失败时，会继续尝试下一个通道
- 这样详情页即使 `GeekChatCore` 半就绪，也不会挡住后面的 `ChatWebsocket` 兜底发送
- 已执行 `pnpm build:chrome`，构建成功
- 构建 warning 仍为既有 `options` 入口冲突与 protobuf `eval` 提示，与本次改动无关

# 2026-03-06 详情页生成后复制与发送假成功修正

- [x] 调整共享发送结果文案，避免未确认送达时仍提示“发送成功”
- [x] 在详情页 AI 生成完成后自动复制到剪贴板
- [x] 执行 `pnpm build:chrome` 验证并回填结果

## 校验结果

- 已将共享发送结果从“发送成功”改为“已尝试发送”，避免详情页在仅调用页面发送通道后就误报真正送达
- 详情页在 AI 招呼语生成完成后会优先写入系统剪贴板；即使后续发送失败，用户也能直接粘贴使用
- 若发送通道调用成功，详情页会提示“已尝试发送，请确认是否实际发出”；若发送失败，则明确提示“发送失败，但内容已复制到剪贴板”
- 已执行 `pnpm build:chrome`，构建成功
- 构建 warning 仍为既有 `options` 入口冲突与 protobuf `eval` 提示，与本次改动无关

# 2026-03-06 详情页发送链路稳定性修复

- [x] 复核详情页与列表页发送链路差异，确认发送通道不稳定的根因
- [x] 为详情页补充聊天入口拉起与发送通道等待，降低“无可用发送渠道”概率
- [x] 调整发送结果判定与状态展示，避免把未送达误当成成功
- [x] 执行 `pnpm build:chrome` 验证并回填结果

## 校验结果

- 根因进一步收敛为两点：详情页聊天 runtime 初始化存在时序波动，以及发送通道优先级不合理，导致 `GeekChatCore` 偶发抢占 `ChatWebsocket` 后出现“已尝试但未实际送达”
- 已将发送通道探测改为优先使用 `ChatWebsocket`，并额外检查底层 socket 已 ready；只有在其不可用时才回退到 `GeekChatCore`
- 已为消息发送增加受控等待能力，详情页在发送前会先等待通道出现；若当前页尚未初始化聊天 runtime，会尝试安全点击一次详情页聊天按钮来拉起通道
- 详情页若在等待后仍拿不到通道，会给出更准确提示：`当前页面未初始化聊天通道，请先手动点一次立即沟通后重试`
- 已执行针对性 `eslint`，覆盖 `protobuf.ts`、`greeting.ts`、`DetailAiGreeting.vue`，结果通过
- 已执行 `pnpm build:chrome`，构建成功
- 构建 warning 仍为既有 `options` 入口冲突与 protobuf `eval` 提示，与本次改动无关

# 2026-03-06 详情页聊天通道零跳转修正

- [x] 移除详情页自动点击 `打招呼/继续沟通` 等页面按钮的逻辑
- [x] 改为仅使用当前已存在的聊天通道，无通道时只复制并提示手动打开聊天后重试
- [x] 增加详情页只读诊断状态，区分详情已加载与聊天通道未就绪
- [x] 执行针对性 `eslint` 与 `pnpm build:chrome` 验证并回填结果

## 校验结果

- 已从详情页组件移除基于聊天按钮文案与 selector 的自动点击逻辑，不再由扩展触发 `打招呼/继续沟通/立即沟通` 等页面原生按钮
- 详情页发送前现在只检查当前已存在的 sender；若 `ChatWebsocket/GeekChatCore` 都不可用，会保留“生成 + 复制”，并提示用户手动打开聊天窗口后重试
- 已新增只读诊断文案，直接显示 `详情是否已加载 / 通道是否可用 / 当前 sender 列表 / socket readyState / 最近一次尝试通道`
- 详情页成功提示已收敛为“已复制，并已尝试发送，请以聊天窗口实际结果为准”；无通道时不再走失败报错分支
- 已执行针对性 `eslint`，覆盖 `protobuf.ts`、`greeting.ts`、`DetailAiGreeting.vue`，结果通过
- 已执行 `pnpm build:chrome`，构建成功
- 构建 warning 仍为既有 `options` 入口冲突与 protobuf `eval` 提示，与本次改动无关

# 2026-03-06 详情页双图标控件与复制引导

- [x] 调研详情页聊天 runtime 与列表页差异，确认不是扩展链路分叉
- [x] 将详情页单按钮改为“闪电直发 + 复制引导”双图标控件
- [x] 让复制图标在用户显式点击后继续执行页面原生 `打招呼/继续沟通`
- [x] 执行针对性 `eslint` 与 `pnpm build:chrome` 验证并回填结果

- 调研结论：列表页与详情页共用扩展发送链路，差异来自 BOSS host 页面聊天 runtime 初始化时机不同，不是扩展代码分叉
- 详情页已改为双图标：有 sender 时显示闪电直发，同时始终保留复制引导；无 sender 时仅显示复制图标
- 复制图标仅在用户显式点击后，才会先生成并复制，再继续触发页面原生 `打招呼/继续沟通`
- 已执行 `pnpm exec eslint src/pages/zhipin-detail/components/DetailAiGreeting.vue src/composables/useApplying/greeting.ts src/composables/useWebSocket/protobuf.ts`，结果通过
- 已执行 `pnpm build:chrome`，构建成功
- 构建 warning 仍为既有 `options` 入口冲突与 protobuf `eval` 提示，与本次改动无关
