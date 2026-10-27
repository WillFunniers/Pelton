# zh.14 — Scheduled Outbox Viewer（定时发送只读预览）

Status: **计划待确认（未开始编码）**
Target version: `v2026.4.4_zh.14`
Baseline: upstream `main` @ `78ec3717895c852239eb4eb33c9d7eb46d894d71`（2026-09-29, PR #477），latest tag `v2026.4.4` (`eaca82d4d`)
Custom line: `zh.13`

> 本文档是编码前的计划。按约定，**确认后才开始写代码**。
> 注：本文件位于 `docs/`（发布到 docs.pelton.app 的文档树）。它不在 `zensical.toml` 的 `nav` 列表中，因此不会出现在文档站点导航里，但会进入仓库。若不希望它进入公开文档树，可移到 `../docs/`（工作区层）或在打包前删除。

---

## 1. 目标与非目标

### 目标（MVP）

| # | 能力 | 说明 |
|---|---|---|
| 1 | 查看未来待发送邮件列表 | 时间 / 主题 / 收件人 / 附件数 |
| 2 | 查看单封定时邮件完整内容 | 头部 + 正文（HTML 或纯文本）+ 附件清单 |
| 3 | 发送前取消 | 复用既有原子取消，失败时明确提示 |
| 4 | 取消后由用户自行重建 | 本版本**不**恢复草稿 |

### 明确不做

- ❌ 编辑已排期邮件内容
- ❌ 修改发送时间 / 拖动改时间
- ❌ 恢复 Draft
- ❌ 新增 Scheduled 文件夹或侧栏入口
- ❌ 改造 Compose 发送流程
- ❌ 附件下载 / 附件预览（仅显示文件名与大小）

### 硬性禁止（本次实现的红线）

- ❌ 修改 `Compose.svelte`
- ❌ 修改 `internal/desktop/bind_sync.go`
- ❌ 修改 `internal/smtp/**`
- ❌ 新增 migration / 修改数据库结构
- ❌ 新增 MIME parser（必须复用 `internal/rfc822`）
- ❌ 绕过 `mailview.Sanitize`
- ❌ `innerHTML` 直接渲染邮件正文
- ❌ 预览中加载远程图片

---

## 2. 当前实现位置（已核实）

### 2.1 「定时」不是状态，是 `queued` + 未来的 `next_attempt_at`

`internal/outbox/outbox.go:20-25` 只有 4 个状态：

```go
StateQueued  = "queued"
StateSending = "sending"
StateSent    = "sent"
StateFailed  = "failed"
```

前端派生「scheduled」标签（`frontend/src/components/common/OutboxPanel.svelte:41`）：

```ts
const SCHEDULED_THRESHOLD_MS = 60 * 1000
isScheduled(row) = row.state === 'queued' && nextAttemptAt - now > 60s
```

没有独立 scheduler：后台是 `outbox.worker`（5s 轮询 + 启动即 `DrainOnce`）。

### 2.2 写入链路（本版本**完全不改**）

```
Compose.svelte:311 send(scheduledAt?)
  → lib/mailcompose.ts:67 buildRequest()            ComposeRequest
  → api.ts sendMessage(req)
  → internal/desktop/bind_compose.go:72 SendMessage()
      ├─ buildMessage()            :217
      ├─ resolveNotBefore()        :198   sendAt → notBefore
      └─ protectionOptions()       :91    PGP 在此应用
  → internal/smtp/send.go:19 Enqueue()
      └─ BuildRaw()  ★ MIME 冻结点（builder.go）
  → internal/outbox/outbox.go:69 Queue.Enqueue()
  → internal/storage/outbox.go:32 InsertOutbox()
      └─ outbox.raw_message BLOB
```

### 2.3 MIME 冻结内容（已核实 `internal/smtp/builder.go`）

| 字段 | 冻结 | 位置 |
|---|---|---|
| From | ✅ | `topHeaders` builder.go:106 |
| To | ✅ | builder.go:108 |
| Cc | ✅ | builder.go:111 |
| Subject | ✅ | builder.go:113 |
| Date | ✅ | builder.go:114 |
| Message-ID | ✅ | builder.go:116/120（enqueue 时生成） |
| Text + HTML | ✅ | `bodyPart()` builder.go:161（multipart/alternative） |
| Attachments | ✅ | `contentEntity()` builder.go:135，字节内联在 BLOB |
| In-Reply-To / References / MIME-Version / User-Agent | ✅ | builder.go:122-130 |
| **Bcc** | ❌ **有意省略** | builder.go:95 *"Bcc is deliberately omitted from the transmitted headers"* |

**结论：MIME freeze 已经存在，改造成本为 0。** 唯一缺的是 Bcc（仅存在于 `outbox.recipients` 信封列，与 To/Cc 混合，无法还原具体地址）。

### 2.4 可复用的既有能力（本方案的全部依赖）

| 能力 | 位置 | 现状 |
|---|---|---|
| MIME 解析 | `internal/rfc822/rfc822.go:77` `Parse(raw []byte) (*Message, error)` | 已有、已测试；`Message{MessageID,Subject,From,To,Cc,Date,Text,HTML,Size,Attachments,Header}`；`Attachment{Filename,ContentType,ContentID,Content}`（**已解码**） |
| HTML 消毒 | `internal/mailview/mailview.go:174` `Sanitize(html, allowRemote, allowFonts) string` | 已有；收信同一路径（`bind_messages.go:189`） |
| CID 内联 | `internal/mailview/mailview.go:287` `ResolveCIDs(html, map[string]string) string` | 已有；只需一个 map（不同于 `bind_messages.go:238` 的读盘版本 `inlineDataURLs`） |
| 原子取消 | `internal/outbox/outbox.go:136` `Cancel` → `storage.DeleteOutboxIfState(id,'queued')` | 已有；与 `ClaimDueOutbox` 事务化认领互斥 |
| 列表 | `internal/desktop/bind_compose.go:447` `ListOutbox` | 已有 |
| 字体偏好 | `internal/desktop/bind_messages.go:195` `(*App).senderFonts()` | 已有 |
| 时间格式 | `internal/desktop/dto.go:396` `formatDate(t)` | 已有 |

**不存在、需要新增**：`storage.GetOutbox(id)`（`ErrOutboxNotFound` 已定义但只被 update 使用）。

---

## 3. 修改范围

### 3.1 新增文件

```
internal/storage/outbox_test.go                             GetOutbox 测试（含 ErrOutboxNotFound）
internal/desktop/bind_scheduled_test.go                     GetScheduledPreview + CID + 取消竞态测试
frontend/src/components/common/ScheduledPanel.svelte        定时邮件列表
frontend/src/components/common/ScheduledPreview.svelte      只读预览窗口
frontend/src/lib/scheduled.ts                               srcdoc 构造（可测试的纯函数）
frontend/src/lib/scheduled.test.ts                          srcdoc / DTO 渲染测试
frontend/src/components/common/ScheduledPreview.test.ts     附件列表渲染测试
```

### 3.2 修改文件（全部为**追加**，不重构）

| 文件 | 改动 | 近期 upstream churn |
|---|---|---|
| `internal/storage/outbox.go` | + `GetOutbox(ctx, id)`（复用已有 `scanOutbox`） | 2 🟢 |
| `internal/desktop/bind_compose.go` | + `ScheduledPreviewDTO` + `GetScheduledPreview(id)`；`OutboxRowDTO` **追加** `Subject`/`AttachmentCount` | 4 🟢 |
| `internal/rfc822/rfc822.go` | + `Subject(raw []byte) string`（**见 §3.4 决策与待确认项**） | 4 🟢 |
| `frontend/src/lib/api.ts` | + `getScheduledPreview(id)`（含 demo 分支） | — |
| `frontend/src/lib/types.ts` | + `ScheduledPreview` 接口；`OutboxRow` 追加 `subject`/`attachmentCount` | — |
| `frontend/src/components/common/OutboxPanel.svelte` | + 主题显示 + 定时行「查看」按钮 | 2 🟢 |
| `frontend/src/components/common/StatusBar.svelte` | + 定时入口按钮（见 §3.3） | — |
| `frontend/src/lib/locales/*.ts` | + 约 12 个 key × 11 份目录 | — |

### 3.3 明确**不**修改

```
❌ frontend/src/components/compose/Compose.svelte      (禁止)
❌ internal/desktop/bind_sync.go                        (禁止)
❌ internal/smtp/**                                     (禁止)
❌ internal/storage/migrations/**                        (禁止：零 migration)
❌ frontend/src/components/detail/**                     (churn 20，避免)
❌ frontend/src/components/sidebar/**                    (churn 16，避免)
❌ frontend/src/stores/outbox.ts                         (无需改)
```

### 3.4 关键实现决策

#### D1 — 列表主题的取数方式（**待确认项 #2**）

`ListOutbox` 在每次 `outbox:changed` 事件都会执行。若在其中对**每一行**调用 `rfc822.Parse`，会连附件字节一起解码（`Parse` 返回 `Attachment.Content []byte`），大附件时浪费明显。

**方案对比**

| 方案 | 代价 | 评价 |
|---|---|---|
| (a) `ListOutbox` 对所有行 `rfc822.Parse` | 每次事件全量解码附件 | ❌ 浪费 |
| (b) 只对 scheduled 行 parse | 混合行为，非 scheduled 行无主题 | ⚠️ UI 不一致 |
| (c) **在 `internal/rfc822` 加 header-only `Subject(raw) string`** | ~12 行，复用该包已有的 `reader()`（rfc822.go:116）与 `net/mail` 头部路径 | ✅ **推荐** |

**推荐 (c)**：它**不是新增 MIME parser** —— 是同一个包、同一条 stdlib 头部读取路径，只是不解码 body。列表用 `rfc822.Subject`，预览用 `rfc822.Parse`，职责分明。

> 这与任务书「必须复用 `internal/rfc822.Parse()`」的字面要求有偏差（新增了一个同包 helper），因此列为待确认项。若不接受 (c)，则退回 (b) 并接受混合行为。

#### D2 — Bcc 只报数量，不还原地址

```
hiddenBccCount = max(0, len(outbox.recipients) - (len(parsed.To) + len(parsed.Cc)))
```

信封 `recipients` 是 To+Cc+Bcc 的并集（`smtp.Message.Recipients()` builder.go:73），而 MIME 头里只有 To/Cc。差额即被隐藏的密送数量。**不尝试还原地址**（符合任务要求）。
注意：需对地址做**去重后**比较，避免同一地址同时出现在 To 与信封里造成误算；差额为负时钳到 0。

#### D3 — HTML 渲染路径（安全）

```
raw HTML（来自 rfc822.Parse 的 .HTML）
  → 构造 cid map：{ ContentID: "data:<type>;base64,<...>" }  ← 来自 rfc822.Attachment.Content
  → mailview.ResolveCIDs(html, cidMap)
  → mailview.Sanitize(html, allowRemote=false, a.senderFonts())   ★ 唯一消毒入口
  → 前端 iframe srcdoc
```

**iframe 策略：比 `MailBody` 更严格。**

`MailBody` 需要 CSP `script-src 'nonce-…'`（链接点击转发 + VT 徽章），预览**两者都不需要**，因此：

- `sandbox` 属性留空（**不**加 `allow-scripts`）→ 邮件内任何脚本都无法执行
- CSP：`default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:` —— **无 `script-src`，无 `http:`/`https:`**
- 不使用 `innerHTML`；只用 `iframe.srcdoc = …`
- 主题色通过 `getComputedStyle` 读 token 注入（与 `MailBody` 同法，`mailpalette` 复用），使预览观感与阅读窗一致

纯文本邮件（`HTML === ''`）走 `<pre>`，不进 iframe —— 与 `MailBody.svelte:266` 一致。

#### D4 — PGP 加密邮件的降级

`outbox` 表**没有** `protection` 列，加密邮件的 `raw_message` 是 PGP/MIME 或 armored 密文，`rfc822.Parse` 会把它当正文 → 预览出乱码。

**处理**：解析前做一次字节级嗅探（无新 parser）：

```go
func looksEncrypted(raw []byte) bool   // 前缀 "-----BEGIN PGP MESSAGE-----"
                                       // 或 Content-Type: multipart/encrypted
```

命中则 `ScheduledPreviewDTO.Protected = true`，前端显示「此邮件已加密，无法预览内容」，仅展示收件人/主题/时间/附件数。

签名（`sign`）邮件**不受影响** —— 它仍是普通 MIME，正文可正常预览。

#### D5 — 取消语义与用户预期

后端 `CancelSend` 已存在且原子（`DeleteOutboxIfState(id,'queued')`）。前端：

| `cancelSend` 返回 | UI |
|---|---|
| `true` | 关闭预览 → toast「定时邮件已取消」+ **明确说明内容不会保留**（本版本不走 Draft 路线，与两处既有 docstring 的承诺不同，必须对用户讲清楚） |
| `false` | toast「邮件已开始发送，无法取消」 |

> 注：`internal/desktop/bind_compose.go:127` 与 `OutboxPanel.svelte:5` 的注释都写着「取消后回到草稿」，但实现从未做这件事。本版本**依然不做**（任务明确禁止恢复 Draft），但会**修正这两处注释**，使注释不再承诺未实现的行为。

#### D6 — `ScheduledPanel` 的入口（**待确认项 #1**）

任务书要求新增 `ScheduledPanel.svelte`（列表）与 `ScheduledPreview.svelte`（详情），同时要求 `OutboxPanel` 增加「查看入口」，但未说明 `ScheduledPanel` 从哪里打开。

**提议（默认）**：

- `StatusBar.svelte` 在有定时邮件时显示一个「N 定时」按钮 → 打开 `ScheduledPanel`
- `OutboxPanel` 保持现有职责，定时行增加主题 + 「查看」按钮
- 两处「查看」都渲染同一个自洽的 `ScheduledPreview`（自己按 `id` 取数，通过 `on:close` 关闭）→ **无重复取数逻辑，也无需重构 OutboxPanel**

若希望更小：可**只**做 `OutboxPanel` + `ScheduledPreview`，把 `ScheduledPanel` 的列表能力并入 OutboxPanel 的定时分区 —— 但这与任务书的文件清单不一致，故默认按上面执行。

---

## 4. 为什么不选择 Draft 路线

调查确认存在一条「保留本地草稿作为真相源」的替代路线（`local_drafts` 已存完整 `ComposeRequest`）。**本版本不采用**，理由如下：

| # | 理由 |
|---|---|
| 1 | **与任务约束冲突**：本版本明确禁止编辑。Draft 路线的**唯一**优势就是可编辑，在本版本中完全用不上 |
| 2 | **必须改 `Compose.svelte`**（禁止）：`Compose.svelte:325` 发信后 `deleteDraft(session.draftId)`；且**常见情况下根本没有草稿** —— 新建邮件 `session.draftId === 0`，要保留就必须新增「定时发送前先 `saveDraft`」的写入，这正是被禁止的 Compose 改造 |
| 3 | **双真相源**：草稿 JSON 与 outbox BLOB 各存一份附件，需要一致性维护（改/删/发送成功的清理时序），引入持续性 bug 面 |
| 4 | **写放大**：`local_drafts` 是 settings 表里的**单个 JSON 数组**，每次 `SaveDraft` 整体重写（`bind_compose.go:325`/`417`），附件 base64 在内 → 随草稿数与附件体积线性劣化 |
| 5 | **加密草稿不可预览**：`SaveDraft` 对 `encrypts(Protection)` 的草稿会**密封**并把 `Request` 清空为 `{AccountID, Protection}`（`bind_compose.go:305-312`）→ 加密定时邮件从草稿根本读不出内容。而 MIME 路线天然可用（并可按 D4 优雅降级） |
| 6 | **需要 MIME 解析能力却不用**：`raw_message` 已是完整 MIME，`internal/rfc822` 已能解析 → 数据已经就绪，Draft 路线是**绕过现成能力去建第二套存储** |
| 7 | **同步风险**：Draft 路线要改 `Compose.svelte`（近期 churn 8）与 settings JSON 结构；MIME 路线零 migration、只碰 churn ≤4 的文件 |

**结论**：MIME 路线是「用已有数据 + 已有解析器 + 已有消毒器」的最小实现；Draft 路线是为将来（Phase 2 编辑）准备的重型方案，届时再评估。

---

## 5. 数据契约

### 5.1 Backend DTO

```go
// internal/desktop/bind_compose.go
type ScheduledPreviewDTO struct {
    ID             int64                  `json:"id"`
    AccountID      int64                  `json:"accountId"`
    From           string                 `json:"from"`
    To             string                 `json:"to"`
    Cc             string                 `json:"cc"`
    Subject        string                 `json:"subject"`
    Date           string                 `json:"date"`
    ScheduledAt    string                 `json:"scheduledAt"`
    Text           string                 `json:"text"`
    HTML           string                 `json:"html"`            // 已经过 ResolveCIDs + Sanitize
    Attachments    []ScheduledAttachment  `json:"attachments"`
    HiddenBccCount int                    `json:"hiddenBccCount"`
    Protected      bool                   `json:"protected"`        // PGP 加密，正文不可预览
}

type ScheduledAttachment struct {
    Filename    string `json:"filename"`
    ContentType string `json:"contentType"`
    Size        int64  `json:"size"`
}
```

`OutboxRowDTO`（`bind_compose.go:434`）**追加**两个字段（不重排、不改名）：

```go
    Subject         string `json:"subject"`
    AttachmentCount int    `json:"attachmentCount"`
```

### 5.2 Frontend 类型

```ts
// frontend/src/lib/types.ts
export interface ScheduledPreview { /* 与 DTO 对齐 */ }
```

### 5.3 i18n keys（约 12 个 × 11 份目录）

```
scheduled.title / scheduled.empty / scheduled.loading
scheduled.view / scheduled.cancel / scheduled.cancelConfirm
scheduled.cancelled / scheduled.tooLate / scheduled.cancelNotRetained
scheduled.protected / scheduled.hiddenBcc / scheduled.attachments / scheduled.scheduledFor
```

`check-locales` 要求 11 份目录 key 完全对齐 → 必须全部补齐。

---

## 6. 测试计划

### 6.1 Backend

| # | 测试 | 文件 |
|---|---|---|
| 1 | `GetOutbox(不存在ID)` 返回 `ErrOutboxNotFound` | `internal/storage/outbox_test.go` |
| 2 | MIME 样例（multipart/alternative + attachment + inline cid）→ `Parse` 成功、`HTML` 非空、附件存在、`ResolveCIDs` 把 `cid:` 替换为 data URL | `internal/desktop/bind_scheduled_test.go` |
| 3 | 取消竞态：`queued` → `Cancel` 成功；`sending` → `Cancel` 返回 false | `internal/desktop/bind_scheduled_test.go` |
| 4 | `hiddenBccCount` 计算（含负值钳制与去重） | `internal/desktop/bind_scheduled_test.go` |
| 5 | `looksEncrypted` 判定（armored / multipart/encrypted / 普通邮件） | `internal/desktop/bind_scheduled_test.go` |

样例 MIME 用 Go 侧构造（现有 `bind_sync_sent_test.go` 已有构造 raw 的先例），或用 `smtp.BuildRaw` 生成以确保与冻结格式一致 —— **后者更好**：它验证的是真实产出格式，而不是手写假设。

> 注意：本机跑 Go 测试需要 `env -u GOOS -u GOARCH -u CC -u CXX CGO_ENABLED=0 GOOS=linux GOARCH=amd64 …`（`internal/desktop` 还需 `park-build.sh` 的 parking 技巧，因宿主无 GTK 头）。

### 6.2 Frontend

| # | 测试 | 文件 |
|---|---|---|
| 1 | `ScheduledPreview` 在给定 DTO 下渲染出 From/To/Subject/时间 | `ScheduledPreview.test.ts` |
| 2 | 附件列表显示文件名与人类可读大小 | 同上 |
| 3 | `protected` 时显示降级提示、不渲染 iframe | 同上 |
| 4 | srcdoc 构造：包含 CSP、**不含** `script-src`、不含 `http:` | `lib/scheduled.test.ts` |
| 5 | 纯文本邮件走 `<pre>` 而非 iframe | 同上 |

### 6.3 回归（既有，必须全绿）

- `frontend: pnpm test`（当前 449 passed / 34 files）
- `frontend: pnpm check`（0 errors / 0 warnings）
- `frontend: pnpm check:locales`（11 × 1755 + 新增）
- Go：24 个 Linux 包 + `internal/desktop` 套件
- 渲染验收探针：`glassaccept.mjs`（玻璃冻结不变）、`zones.mjs`、`netease.mjs`、`mailboxedit.mjs`

---

## 7. 风险评估

| # | 风险 | 等级 | 缓解 |
|---|---|---|---|
| R1 | **HTML 注入** —— 草稿正文是用户在 contenteditable 中写的 HTML，从未消毒 | 中 | 强制走 `mailview.Sanitize`；iframe **无 `allow-scripts`**、CSP 无 `script-src`；不用 `innerHTML` |
| R2 | **远程图片/追踪像素泄露** | 低 | `Sanitize(..., allowRemote=false, ...)` + CSP `img-src data:`；预览**不提供**「加载远程图片」开关 |
| R3 | `rfc822.Parse` 解码附件字节 → 大附件内存开销 | 中 | 预览为**单封按需**加载（用户点「查看」才触发）；列表按 D1(c) 用 header-only 取主题 |
| R4 | **Bcc 无法显示** | 低 | 按 D2 只报数量；UI 文案明确「隐藏收件人 X 个」 |
| R5 | **PGP 加密邮件预览出乱码** | 中 | D4 字节嗅探 + `Protected` 降级提示 |
| R6 | 取消后用户以为内容被保留（既有 docstring 承诺过） | 中 | D5：取消成功 toast **明确说明内容不保留**；同时修正两处误导性注释 |
| R7 | 与上游 future 冲突 | **低** | 零 migration；只碰 churn ≤4 的文件；全部为追加式改动；不动 `detail/`、`sidebar/`、`compose/` |
| R8 | `OutboxRowDTO` 追加字段影响既有消费方 | 低 | 追加而非重排；`OutboxRow` 类型同步追加可选字段 |
| R9 | 新增 `rfc822.Subject` 偏离任务书「只用 `Parse`」的字面要求 | 低 | 列为待确认项 #2；不接受则退回方案 (b) |
| R10 | demo 模式 | 低 | `getScheduledPreview` 需 `isDemoActive()` 分支（现有 `listOutbox`/`getMessageHtml` 均有此模式） |

**总体风险等级：低。**
理由：零 migration、零写路径改动、发送链路完全不动、复用两个已测试包（`rfc822`、`mailview`）与既有原子取消原语。

---

## 8. 代码规模预估

| 区域 | 行数 |
|---|---|
| Go：`storage.GetOutbox` + `rfc822.Subject` + `GetScheduledPreview` + DTO + 嗅探 | ~130–170 |
| Go：测试 | ~150–200 |
| Svelte：`ScheduledPanel` | ~120–160 |
| Svelte：`ScheduledPreview` | ~170–220 |
| TS：`lib/scheduled.ts` + api + types | ~70–100 |
| i18n：12 keys × 11 目录 | ~132 |
| **合计** | **~770–980 行（含测试与 i18n）** |

纯生产逻辑约 490–650 行；其中约 1/3 是测试与语言目录，且绝大多数是**新增而非修改**。

---

## 9. 待确认项（已确认）

| # | 问题 | 决定 |
|---|---|---|
| **1** | `ScheduledPanel` 从哪里打开？ | **已确认**：StatusBar 在有定时邮件时显示「N 定时」按钮 → 打开 `ScheduledPanel`；`OutboxPanel` 的定时行同时提供「查看」。两处共用 `ScheduledPreview` |
| **2** | 是否允许在 `internal/rfc822` 新增 header-only `Subject(raw)`？ | **已确认允许**：已实现（列表取主题不解码附件） |
| **3** | 计划文档位置 | 保留在 `docs/`（未列入 `zensical.toml` 的 `nav`，不进文档站点导航） |
| **4** | 附件是否只显示元数据？ | 是（文件名 + 大小），不提供下载/预览 |
| **5** | 是否修正 `bind_compose.go:127` 与 `OutboxPanel.svelte:5` 两处误导性注释？ | 是（已修正） |

---

## 10. 完成标准

1. 修改文件列表（含每处改动摘要）
2. 架构说明（数据流 + 安全边界）
3. 测试结果（新增测试 + 全量回归）
4. 该实现的提交 ID 与源码状态标识

---

## 11. 实施顺序（确认后）

1. `internal/storage/outbox.go`：`GetOutbox` + 测试
2. `internal/rfc822/rfc822.go`：`Subject` helper（若 #2 通过）
3. `internal/desktop/bind_compose.go`：DTO + `GetScheduledPreview` + `OutboxRowDTO` 追加字段
4. Go 测试（5 项）
5. `frontend/src/lib/{types.ts,api.ts,scheduled.ts}` + 测试
6. `ScheduledPreview.svelte` + 测试
7. `ScheduledPanel.svelte`
8. `OutboxPanel.svelte` / `StatusBar.svelte` 追加入口
9. i18n 11 份目录 + `check:locales`
10. 全量回归（pnpm test / check / check:locales / Go / 渲染探针）
11. 打包 `v2026.4.4_zh.14` 并核对工件不变量

---

## 12. 实现记录

### 12.1 计划外的重要发现：`rfc822.Parse` 不返回真正的内联图片

计划书 §2.4 与 §3 假设 `rfc822.Attachment` 能给出内联图片的字节与 `ContentID`，因而 `ResolveCIDs` 可把 `cid:` 换成 data URL。**实测该假设不成立。**

`internal/rfc822/rfc822.go` 的 `parts()` 按 go-message 的部件类型分派：

```go
switch header := part.Header.(type) {
case *mail.InlineHeader:      // Content-Disposition: inline（或缺省）
    ... 只作为 text/plain 或 text/html 的候选
case *mail.AttachmentHeader:  // Content-Disposition: attachment
    ... 才收集 Filename / ContentType / ContentID / Content
}
```

`internal/smtp/builder.go` 的 `inlineLeaf()` 写的是 `Content-Disposition: inline; filename=…` + `Content-ID: <…>`，因此内联图片走 `InlineHeader` 分支，其**字节与 `ContentID` 都不进入 `msg.Attachments`**。

用真实 `BuildRaw` 产物做探针实测（multipart/related 内嵌 1 张内联图 + 1 个普通附件）：

```
Attachments=1
  [0] filename="data.csv" ctype="text/csv" cid="" len=8
```

内联图片（`cid:chart@example.com`）**完全消失**，且因 text 部分先到，`Text` 也未受影响。

**处理方式（未扩大范围）**

- **不**扩展 `parts()`：它是收信与发信共用的解析器，让内联部件变成 attachment 会改变**收信**路径的存储形态（附件行数、磁盘占用、阅读窗附件列表），远超本任务范围。
- **不**在 desktop 层自己走 MIME：那等于新增解析器，违反任务约束。
- 保留 `ResolveCIDs`：它对「以 attachment 形式到达但带 Content-ID」的部件仍然有效（正是 `mailview.ReferencedCIDs` 注释描述的实际情况），成本为零。
- 真正的内联 `cid:` 引用**原样保留**在 HTML 中，由预览 iframe 的 CSP（`img-src data:`）拒绝加载 → 该位置不显示图片，而不是去网络取图。这正是安全要求希望的行为。
- 用 `TestScheduledPreviewLeavesInlineCIDUnresolved` **显式断言**该限制，而非默默容忍：上游一旦让 `rfc822` 返回内联部件，该测试会失败，届时可有意打开解析。

**影响**：定时邮件预览中内联图片不显示；收件人、主题、正文文字、附件列表均正常。若需要内联图片，正确做法是单独向上游提 issue/PR 扩展 `rfc822`，而不是在本功能里绕开。

### 12.2 另一处修正：头无法解析时隐藏密送会多报

初版 `hiddenBccCount` 在 `mail.ParseAddressList` 失败时只清空「已命名」集合，导致信封里**每个**收件人都被算作隐藏 → **多报**，与「宁可少报」的意图相反，也违反隐私直觉（宣称存在并不存在的密送收件人）。

修正：任一个非空的头列表解析失败即整体返回 0（`namedRecipients` 返回 `ok=false`）。`TestHiddenBccCountUnderReportsOnBadHeaders` 覆盖。

### 12.3 实际改动清单

**新增**

```
internal/storage/outbox_test.go                          GetOutbox：缺失 id、raw 字节往返
internal/desktop/bind_scheduled_test.go                  预览 / 加密降级 / 取消竞态 / 密送计数 / 列表标签
frontend/src/lib/scheduled.ts                            阈值谓词 + 预览 frame 构造
frontend/src/lib/scheduled.test.ts                       10 项
frontend/src/components/common/ScheduledPanel.svelte     定时列表
frontend/src/components/common/ScheduledPreview.svelte   只读预览
frontend/src/components/common/ScheduledPreview.test.ts  10 项
（internal/rfc822/rfc822_test.go 追加 2 项）
```

**修改**

```
internal/storage/outbox.go               + GetOutbox（新增函数，未动既有）
internal/rfc822/rfc822.go                + Subject（header-only，不解码 body）
internal/desktop/bind_compose.go         + ScheduledPreviewDTO / ScheduledAttachment
                                         + GetScheduledPreview / previewIsEncrypted
                                         + sanitizedPreviewHTML / previewAttachments
                                         + previewAttachmentCount / hiddenBccCount / namedRecipients
                                         OutboxRowDTO 追加 subject + attachmentCount
                                         ListOutbox 仅对未到期的 queued 行填这两项
                                         修正 CancelSend 里承诺「取消回草稿」的误导性注释
frontend/src/lib/types.ts                OutboxRow 追加两字段；新增 ScheduledAttachment / ScheduledPreview
frontend/src/lib/api.ts                  + getScheduledPreview（含 demo 分支）
frontend/src/lib/demo.ts                 demoOutbox 增加一条定时行；+ demoScheduledPreview
frontend/src/components/common/OutboxPanel.svelte  定时行显示主题 + 「查看」入口；改用共享 isScheduledRow
frontend/src/components/common/StatusBar.svelte    「N 定时」按钮 + ScheduledPanel 弹层 + scrim
frontend/src/lib/locales/*.ts            11 份目录各 +22 key
frontend/wailsjs/**                      wails 重新生成的绑定
```

**未修改（约束遵守）**

```
✅ frontend/src/components/compose/Compose.svelte
✅ internal/desktop/bind_sync.go
✅ internal/smtp/**
✅ internal/storage/migrations/**   （零 migration）
✅ frontend/src/components/detail/**
✅ frontend/src/components/sidebar/**
```

### 12.4 测试结果

| 套件 | 结果 |
|---|---|
| `frontend: pnpm test` | **469 passed / 36 files**（此前 449 / 34；+20 项 +2 文件） |
| `frontend: pnpm check` | **0 errors / 0 warnings** |
| `frontend: check:locales` | **11 catalogs agree on 1777 strings**（此前 1755；+22） |
| Go `go test ./...`（Linux，CGO 关闭） | **全部通过** |

### 12.5 安全边界（实现后的实际形态）

```
outbox.raw_message (冻结的成品 MIME)
  → rfc822.Parse                    (已有，已测试)
  → ResolveCIDs(html, cidMap)       (已有；只对带 Content-ID 的 attachment 部件生效)
  → mailview.Sanitize(html, false, senderFonts())   ← 唯一消毒入口，remote 恒为 false
  → ScheduledPreviewDTO.HTML
  → buildPreviewSrcdoc(…)           (lib/scheduled.ts)
  → <iframe sandbox="" srcdoc=…>    ← 无 allow-scripts；CSP 无 script-src、无 http(s):
```

三道锁：① 后端 `Sanitize` 移除脚本与远程引用；② CSP `default-src 'none'` + `img-src data:` 使远程请求不可能；③ `sandbox=""` 未授予任何能力，脚本无法执行。全程不使用 `innerHTML`，只赋值 `iframe.srcdoc`（独立文档）。

### 12.6 尚未验证

- 预览 iframe 的视觉观感与阅读窗是否一致（jsdom 不渲染 iframe 内容）——建议在真实构建上人工确认一次。
- 打包工件不变量（SHA256、`frontend/dist` 逐文件一致、无 `zz_*` 残留、parked 文件已还原）。
