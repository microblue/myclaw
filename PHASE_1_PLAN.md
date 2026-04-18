# Phase 1 — Deploy Claw 流程重设计

> 需求来源：Dawson @ 2026-04-18
> 工作区：`/home/dz/myclaw/`（当前 clawhost-based 平台）
> 产出目标：让用户一键部署自己的 Claw 实例，从"弹窗点几下"升级成"专业页面流程 + 美观 dashboard + 监控"

---

## 需求映射（9 条 → 交付物）

### 1. 简洁的一键 deploy
- **现状：** `apps/web/src/components/dashboard/CreateClawModal.tsx`（435 行）是个弹窗，字段一股脑列出来
- **目标：** 多步向导（wizard）式的 full-page 流程，每步只问一件事，有清晰的"下一步 / 返回"

### 2. Dialog → 页面路由
- **新增路由：**
  - `/new` — 入口（claw type 选择）
  - `/new/provider` — 云服务商
  - `/new/plan` — 配置
  - `/new/review` — 命名 + 确认 + deploy
- **路由常量：** `apps/web/src/lib/constants/routes.ts` 加 `NEW_CLAW_*`
- **拆组件：** `apps/web/src/pages/NewClaw/` 目录
  - `index.tsx`（外层壳子 + 进度条 + wizard state）
  - `StepType.tsx` / `StepProvider.tsx` / `StepPlan.tsx` / `StepReview.tsx`
- **删：** 旧 `CreateClawModal.tsx`（或保留一个兼容垫片先不删）
- **state：** 用 URL query params 存步骤状态（`?type=openclaw&provider=lightsail&planId=...`），刷新不丢

### 3. Step 1 — Claw type picker
- **可选：** OpenClaw / ZeroClaw / PicoClaw / Hermes Agent / NanoClaw
- **仅 OpenClaw 可选**，其余打 "Coming soon" badge（不是灰掉，仍可悬浮看简介）
- **卡片式：** logo + 名字 + 一行介绍，5 张并排（移动端纵排）
- **数据源：** 前端 hardcode 一个 claw-types 注册表 `apps/web/src/lib/clawTypes.ts`
- **DB 影响：** `claws` 表加 `clawType text not null default 'openclaw'` 列 + migration 0029

### 4. Step 2 — 云服务商（列最常用 3 个）
- **现有 provider：** `hetzner` / `lightsail` / `digitalocean` —— 正好 3 个，够用
- **显示名：**
  - AWS Lightsail（主推，放第一）
  - Hetzner Cloud
  - DigitalOcean
- **数据：** 调 `GET /api/providers` → 过滤 `available: true` 的，按固定顺序展示
- **每张卡：** logo + 名字 + 一句描述 + 起价（例 `From $3.50/mo`）+ 地区数
- **"env 没配"的 provider：** 显示为"联系管理员启用"禁用卡片（不是完全隐藏，有发现价值）

### 5. Step 3 — 配置（12 种组合）
- **⚠️ 开放问题：** 每个 provider `getPlans()` 返回数量不定（Lightsail 14 档，Hetzner 20+ 档）。"12 种"是硬上限还是"精选 12 档"？
- **提议方案：** 每个 provider 策展一份 **白名单 plan id 列表**（各 12 档），按场景分组显示：
  - 轻量区（PicoClaw 场景）：256MB–1GB RAM × 1vCPU × 3 档
  - 标准区（日常）：2GB–4GB RAM × 2vCPU × 3 档
  - 高配区（重用户）：8GB+ RAM × 4vCPU+ × 3 档
  - ARM 区：ARM 架构 × 3 档
- **落地：** `apps/api/src/services/providers/{provider}/curatedPlans.ts` 每个 provider 一份白名单，`getPlans()` 多个重载或加参数 `curated: true`
- **UI：** 3×4 grid 卡片 / 每张卡显示 vCPU / RAM / 磁盘 / 带宽 / 月价；地区选择器独立放在顶部

### 6. 自动命名 + 可编辑
- **已有：** `apps/api/src/controllers/claws/initiateClawPurchase.ts` 里的 `generateClawName()`（adj + noun 池）
- **改：** 抽成独立 endpoint `GET /api/claws/suggest-name` → 返回 `{ name: "swift-otter" }`
- **前端：** Step 4 (Review) 初次进入时请求并填入 input，可编辑
- **校验：** 同用户下重名拒绝（DB 已有 unique 约束？需确认 → 迁移加上）

### 7. Deploy 按钮
- **测试阶段：** 直接调 `POST /api/claws/initiate-purchase` —— 目前的 dev-mode 分支已经能用（POLAR 产品 env 未配时自动跳过支付直接 provision）
- **生产模式：** 未来接 Polar；本阶段不动
- **用户体验：** 点完按钮 → 转到 `/dashboard?provisioning={clawId}` → 列表里显示该实例为"部署中"状态 + 进度指示

### 8. Dashboard 重做
- **现状：** `apps/web/src/pages/Dashboard.tsx`（424 行）
- **设计原则：** 实例数量少（通常 1–5 个），页面要"撑起来"而不是空荡
- **布局：**
  - 顶部：大号欢迎条 + 快捷"部署新实例"按钮
  - 主区：每个实例一张大卡片（不是 table 行）
    - 左侧：claw logo + name + status dot（running / stopped / deploying）
    - 中间：provider logo + 配置摘要 + 运行时长
    - 右侧：主操作按钮（Open Chat）+ dropdown（暂停/重启/删除/诊断）
  - 空状态：大图 + "来部署你的第一个 Claw" CTA
- **操作映射：**
  - Open Chat → 跳 `/claw/:id/chat`（已有 `DashboardChatView.tsx` 可复用）
  - 暂停 → `POST /api/claws/:id/stop`
  - 恢复 → `POST /api/claws/:id/start`
  - 删除 → confirm 后 `DELETE /api/claws/:id`
  - 诊断 → 开 `ClawDiagnosticsDialog`（已存在，复用）
- **拆组件：** `apps/web/src/components/dashboard/ClawInstanceCard.tsx` 大卡替代现有 `ClawCard`

### 9. 单实例监控页
- **新路由：** `/claw/:id` — 实例总览
- **⚠️ 开放问题：** 监控数据源？选一种：
  - **A.** 从 provider API（Lightsail `GetInstanceMetricData` / Hetzner `/servers/:id/metrics`）—— 时延高、口径不统一
  - **B.** OpenClaw 实例内部暴露 `/metrics` endpoint —— 口径一致，但要改 openclaw 镜像或 sidecar
  - **C.** 先只显示 provider 能拿到的粗粒度（status / 上次重启 / IP）+ OpenClaw gateway 的 health（已有 `checkSubdomainReady`）
- **推荐先做 C**（不阻塞主流程），B 放到 Phase 1.1
- **UI：** 4 张小卡（CPU / RAM / 磁盘 / 网络） + 1 张大状态卡 + 连接信息区 + 危险区（删除实例）
- **复用：** `ClawLogsContent` / `ClawTerminalContent` / `ClawDiagnosticsContent` 作为 tab

---

## 开发顺序（建议）

| # | 工作块 | 依赖 | 估时 |
|---|---|---|---|
| 1 | DB migration 0029：加 `clawType` 列 | 无 | 0.5h |
| 2 | 后端 `/api/claws/suggest-name` + `getProviders` 加 `curated plans` 参数 | #1 | 2h |
| 3 | 每 provider 策展 12 档 plan 白名单 | #2 | 1h × 3 provider |
| 4 | 前端 `clawTypes.ts` 注册表 + `NewClaw/` 壳子 + 路由 | #1 | 2h |
| 5 | Step 1 / 2 / 3 / 4 页面实现 | #3 #4 | 4–6h |
| 6 | Dashboard 卡片式重做（`ClawInstanceCard`） | 无 | 4h |
| 7 | 实例详情页 `/claw/:id`（C 方案监控） | #6 | 3h |
| 8 | 删掉旧 `CreateClawModal` + 回归测试 | #5 #6 | 1h |

总估：**~20h**，单人 2–3 天节奏可落。

---

## 开放问题（需要你拍板）

1. **"12 种配置组合"** — 是按场景分组做精选（轻/标/高/ARM × 3），还是你希望的另一种切法？
2. **Lightsail 优先级** — PRD 里"AWS 第一"已接受。要不要把 Lightsail 列为默认选中（减少点击）？
3. **监控数据源** — 先 C 方案（轻量），还是同步做 B 方案（改 OpenClaw 镜像暴露 metrics）？
4. **Polar 测试跳过** — 确认本阶段完全不接，只走 dev-mode 自动 provision？
5. **旧 `CreateClawModal.tsx`** — 删除 OK？还是保留一周以防回退？
6. **Claw 类型 coming-soon 的体验** — 只是展示还是可以"提前登记兴趣"（留邮件）？

---

## 暂存记录

本 plan 文件路径：`/home/dz/myclaw/PHASE_1_PLAN.md`
对应 MEMORY.md 里也会加一条索引，session 断掉后可以从这里接上。
