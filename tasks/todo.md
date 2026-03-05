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
