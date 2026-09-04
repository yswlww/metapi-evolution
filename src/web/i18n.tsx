import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { zhToEnSupplemental } from './i18n.supplement.js';

export type Language = 'zh' | 'en';

const LANGUAGE_STORAGE_KEY = 'app_language';

const zhToEn: Record<string, string> = {
  '管理员': 'Admin',
  '登录令牌无效': 'Invalid admin token',
  '当前 IP 不在管理白名单中': 'Current IP is not in admin allowlist',
  '当前识别到的管理端 IP（由服务端判定）：': 'Current recognized admin IP (server-side detected):',
  '无法连接到服务器': 'Unable to connect to server',
  '请输入管理员令牌后继续。': 'Enter admin token to continue.',
  '管理员令牌': 'Admin Token',
  '管理员入口': 'Admin Access',
  '部署文档': 'Deployment Docs',
  '管理员登录后继续。': 'Continue with admin sign-in.',
  '仅校验本地服务访问权限，不会把令牌发送到第三方。': 'Only checks local service access and never sends the token to a third party.',
  '验证中...': 'Verifying...',
  '登录': 'Sign In',
  '中转站的中转站': 'The Hub of Hubs',
  '把分散的 New API / One API / OneHub 等站点聚合成统一网关，自动发现模型、智能路由、成本更优。': 'Turn fragmented New API / One API / OneHub sites into one unified gateway with auto model discovery, smart routing, and better cost control.',
  '兼容 New API / One API / OneHub / DoneHub / Veloera / AnyRouter / Sub2API': 'Compatible with New API / One API / OneHub / DoneHub / Veloera / AnyRouter / Sub2API',
  '用户名不能为空': 'Username cannot be empty',
  '用户名最多 24 个字符': 'Username can be at most 24 characters',
  '个人信息': 'Profile',
  '右上角头像实时预览': 'Top-right avatar live preview',
  '用户名': 'Username',
  '例如：小王': 'e.g. Alex',
  '头像（Dicebear 随机） · 风格：': 'Avatar (Dicebear Random) · Style:',
  '换一个随机头像': 'Randomize Avatar',
  '取消': 'Cancel',
  '保存': 'Save',
  '关闭': 'Close',
  '打开': 'Open',
  '导航': 'Navigate',
  '重置': 'Reset',
  '全部': 'All',
  '清空': 'Clear',
  '全部已读': 'Mark All Read',
  '控制台': 'Console',
  '仪表盘': 'Dashboard',
  '站点': 'Sites',
  '账号': 'Accounts',
  '未关联站点': 'Unlinked Site',
  '余额': 'Balance',
  '令牌管理': 'Account Tokens',
  '签到记录': 'Check-in Logs',
  '全部签到': 'Check In All',
  '签到中...': 'Checking In...',
  '刷新状态中...': 'Refreshing...',
  '刷新账户状态': 'Refresh Account Status',
  '+ 添加账号': '+ Add Account',
  '路由': 'Routes',
  '模型路由': 'Model Routes',
  '使用日志': 'Usage Logs',
  '暂无使用日志': 'No Usage Logs',
  '可用性监控': 'Availability Monitor',
  '系统': 'System',
  '设置': 'Settings',
  '程序日志': 'System Logs',
  '导入/导出': 'Import/Export',
  '通知设置': 'Notification Settings',
  '暂无通知': 'No Notifications',
  '模型广场': 'Model Marketplace',
  '模型广场刷新进行中': 'Marketplace refresh in progress',
  '已开始刷新模型广场': 'Started refreshing marketplace',
  '没有找到匹配结果': 'No matching results',
  '搜索站点、账号、模型、日志...': 'Search sites, accounts, models, logs...',
  '模型操练场': 'Model Playground',
  '模型测试': 'Model Testing',
  '关于': 'About',
  '关于 Metapi': 'About Metapi',
  '站点文档': 'Site Docs',
  '任务状态已更新': 'Task status updated',
  '会话已过期，请重新登录': 'Session expired, please sign in again',
  '首次使用建议先阅读站点文档：': 'For first-time setup, read site docs: ',
  '首次使用建议先阅读快速上手：': 'For first-time setup, start with Quick Start: ',
  '首次使用建议先阅读快速开始：': 'For first-time setup, start with Quick Start: ',
  '个人信息已保存': 'Profile saved',
  '搜索': 'Search',
  '搜索 (Ctrl+K)': 'Search (Ctrl+K)',
  '通知': 'Notifications',
  '浅色': 'Light',
  '深色': 'Dark',
  '跟随系统': 'Follow System',
  '浅色模式': 'Light Mode',
  '深色模式': 'Dark Mode',
  '退出登录': 'Sign Out',
  '收起侧边栏': 'Collapse Sidebar',
  '系统设置': 'System Settings',
  '站点管理': 'Site Management',
  '账号管理': 'Connection Management',
  '导入 / 导出': 'Import / Export',
  '监控内嵌': 'Embedded Monitor',
  '实例监控': 'Instance Monitor',
  '监控当前 Metapi 的站点、账号、路由和请求健康': 'Monitor this Metapi instance\'s sites, accounts, routes, and request health',
  '账号健康': 'Account Health',
  '路由通道': 'Route Channels',
  '近 24h 请求': 'Last 24h Requests',
  '站点状态': 'Site Status',
  '健康检查': 'Health Check',
  '检查中...': 'Checking...',
  '异常账号': 'Problem Accounts',
  '风险路由': 'Risky Routes',
  '近期失败请求': 'Recent Failed Requests',
  '暂无异常账号': 'No problem accounts',
  '暂无风险路由': 'No risky routes',
  '暂无近期失败请求': 'No recent failed requests',
  '快速排查：': 'Quick troubleshooting:',
  '更新时间：': 'Updated at:',
  '波动': 'Degraded',
  '检查时间': 'Checked At',
  '站点/账号': 'Site/Account',
  '状态码': 'Status Code',
  '站点公告': 'Site Announcements',
  '连接管理': 'Connection Management',
  '连结管理': 'Link Management',
  '链接管理': 'Link Management',
  'OAuth 管理': 'OAuth Management',
  '下游密钥': 'Downstream Keys',
  '下游密匙': 'Downstream Keys',
  '下游密钥管理': 'Downstream Key Management',
  '下游 Key': 'Downstream Key',
  '筛选日志': 'Filter Logs',
  '代理调试追踪': 'Proxy Debug Traces',
  '调试设置': 'Debug Settings',
  '最近调试追踪': 'Recent Debug Traces',
  '查看详情': 'View Details',
  '请求模型': 'Requested Model',
  '实际模型': 'Actual Model',
  '缓存 Tokens': 'Cache Tokens',
  '缓存创建 Tokens': 'Cache Creation Tokens',
  '计费过程': 'Billing Process',
  '下游请求路径': 'Downstream Request Path',
  '上游请求路径': 'Upstream Request Path',
  '错误信息': 'Error Message',
  '复制完整密钥': 'Copy Full Key',
  '完整密钥暂不可用，请刷新页面后重试': 'Full key is not available yet. Refresh the page and try again.',
  '已复制到剪贴板': 'Copied to clipboard',
  '复制失败': 'Copy failed',
  '未授权模型': 'No Authorized Models',
  '未授权群组': 'No Authorized Groups',
  '默认倍率': 'Default Multiplier',
  '无标签': 'No Tags',
  '匹配任一标签': 'Match Any Tag',
  '匹配全部标签': 'Match All Tags',
  '编辑下游密钥': 'Edit Downstream Key',
  '新增下游密钥': 'New Downstream Key',
  '创建密钥': 'Create Key',
  '支持为每个下游密钥独立配置分组、标签、额度与有效期。高级限制项可按需展开。': 'Configure groups, tags, quotas, and expiration independently for each downstream key. Expand advanced limits when needed.',
  '输入标签后按回车或逗号': 'Enter a tag, then press Enter or comma',
  '输入标签后按回车或逗号，例如：移动端、VIP、项目A': 'Enter tags, then press Enter or comma, e.g. Mobile, VIP, Project A',
  '通用': 'General',
  '上游返回': 'Upstream Response',
  '成本不限': 'Unlimited Cost',
  '不改动主分组': 'Keep Main Group Unchanged',
  '统一设为主分组': 'Set Unified Main Group',
  '不改动标签': 'Keep Tags Unchanged',
  '追加标签': 'Append Tags',
  '站点倍率 JSON': 'Site Multiplier JSON',
  '模型白名单': 'Model Allowlist',
  '群组范围': 'Group Scope',
  '暂无公告': 'No Announcements',
  '当前没有可显示的站点公告。': 'There are no site announcements to display.',
  '手动同步': 'Manual Sync',
  '清空公告': 'Clear Announcements',
  '品牌': 'Brands',
  '全部品牌': 'All Brands',
  '其他': 'Other',
  '供应商': 'Providers',
  '排序方式': 'Sort By',
  '账号数': 'Accounts',
  '令牌数': 'Tokens',
  '延迟': 'Latency',
  '成功率': 'Success Rate',
  '名称': 'Name',
  '收起': 'Collapse',
  '筛选': 'Filter',
  '加载元数据中...': 'Loading metadata...',
  '卡片视图': 'Card View',
  '表格视图': 'Table View',
  '模糊搜索模型名称': 'Fuzzy Search Model Name',
  '覆盖槽位': 'Coverage Slots',
  '去重账号': 'Unique Accounts',
  '平均延迟': 'Avg Latency',
  '共': 'Total',
  '个模型': 'models',
  '个账号': 'accounts',
  '个令牌': 'tokens',
  '个站点': 'sites',
  '令牌': 'Token',
  '复制': 'Copy',
  '复制模型名': 'Copy Model Name',
  '展开': 'Expand',
  '健康': 'Healthy',
  '风险': 'Risk',
  '低延迟': 'Low Latency',
  '基础信息': 'Basic Info',
  '接口能力': 'Endpoint Capabilities',
  '分组计费': 'Group Pricing',
  '暂无标签': 'No Tags',
  '未提供': 'Not Provided',
  '暂无价格元数据': 'No Pricing Metadata',
  '正在加载价格元数据...': 'Loading pricing metadata...',
  '正在加载模型元数据...': 'Loading model metadata...',
  '上游未提供模型说明。': 'Upstream did not provide a model description.',
  '上游未提供文字说明，但已同步标签、能力或价格信息。': 'Upstream did not provide a text description, but tags, capabilities, or pricing data were synchronized.',
  '当前上游仅返回模型 ID，未返回说明字段（常见于很多站点）。': 'The upstream returned only model IDs and no description field (common on many sites).',
  '暂无模型数据': 'No Model Data',
  '请先检查站点与账号状态，然后点击刷新。': 'Check site and account status first, then refresh.',
  '模型名称': 'Model Name',
  '操作': 'Actions',
  '每页条数': 'Rows Per Page',
  '查看': 'Viewing',
  '来自供应商': 'From Provider',
  '品牌的所有模型': 'Brand Models',
  '的模型': 'models',
  '其他未归类的模型': 'Other uncategorized models',
  '所有模型 accountCount 累计值，同一账号在多个模型中会重复计数': 'Cumulative accountCount across all models; same account may be counted repeatedly.',
  '当前筛选范围内去重后的唯一账号数': 'Unique deduplicated accounts in current filters.',
  '刷新选中概率': 'Refresh Selection Probability',
  '自动重建': 'Auto Rebuild',
  '手动增改路由': 'Manual Route Edit',
  '隐藏手动模式': 'Hide Manual Mode',
  '新建群组': 'Create Group',
  '收起群组创建': 'Hide Group Creator',
  '用于创建群组路由（聚合多个上游模型为一个下游模型名，即模型重定向）；自动路由仍会保持开启。': 'Use this to create a group route (aggregate multiple upstream models as one downstream model name); auto-routing remains enabled.',
  '群组显示名（可选，例如 claude-opus-4-6）': 'Group display name (optional, e.g. claude-opus-4-6)',
  '创建群组': 'Create Group',
  '群组已创建': 'Group created',
  '创建群组失败': 'Failed to create group',
  '搜索模型路由...': 'Search model routes...',
  '通道数量': 'Channel Count',
  '排序字段': 'Sort Field',
  '切换排序方向': 'Toggle Sort Direction',
  '升序 ↑': 'Ascending ↑',
  '降序 ↓': 'Descending ↓',
  '手动模式适合高级场景；自动路由仍会保持开启。': 'Manual mode fits advanced scenarios; auto-routing stays enabled.',
  '路由名称（可选，例如 claude 系列）': 'Route name (optional, e.g. Claude Series)',
  '图标（可选，支持 emoji）': 'Icon (optional, supports emoji)',
  '模型匹配（如 gpt-4o、claude-*、re:^claude-.*$）': 'Model pattern (e.g. gpt-4o, claude-*, re:^claude-.*$)',
  '正则请使用 re: 前缀；例如 re:^claude-(opus|sonnet)-4-6$': 'Use re: prefix for regex, e.g. re:^claude-(opus|sonnet)-4-6$',
  '模型映射 key 支持精确匹配、通配符和 re: 正则；按顺序匹配，精确优先。': 'Model mapping keys support exact, glob and re: regex; evaluated in order with exact priority.',
  '规则预览：命中样本': 'Rule preview: matched samples',
  '当前暂无可预览模型，请先同步模型。': 'No preview models yet. Sync models first.',
  '当前规则未命中任何样本模型。': 'Current rule does not match any sample models.',
  '仅展示前 12 个命中样本。': 'Showing only the first 12 matched samples.',
  '映射预览': 'Mapping preview',
  '启用': 'Enabled',
  '禁用': 'Disabled',
  '通道': 'channels',
  '按模型过滤': 'Filter by model',
  '排序保存中': 'Saving order',
  '删除路由': 'Delete Route',
  '选择账号': 'Select Account',
  '条路由': 'routes',
  '品牌路由': 'Brand Routes',
  '群组': 'Groups',
  '全部群组': 'All Groups',
  '群组路由': 'Group Routes',
  '查看群组路由': 'Viewing group routes',
  '查看未归类品牌路由': 'Viewing uncategorized brand routes',
  '当前精确路由': 'Current exact routes',
  '条，为避免首屏卡顿，默认不自动计算概率，点击“加载选择解释”后按需获取。': 'routes. To avoid first-screen lag, probabilities are not auto-calculated by default. Click "Load Selection Explanation" to fetch when needed.',
  '通配符路由按请求实时决策；概率解释仅在精确模型路由中展示。': 'Wildcard routes are decided in real time; probability explanation is shown only for exact model routes.',
  '通配符路由按请求实时决策；概率解释在当前路由内统一估算。': 'Wildcard routes are decided in real time; probability explanation is estimated uniformly within the current route.',
  '系统会根据模型可用性自动生成路由。优先级按 P0/P1 等桶管理，同一桶内可有多个通道；拖动通道或灰色分隔线即可调整。精确模型路由会自动过滤只支持该模型的账号和令牌。群组路由中的优先级调整会直接回写来源通道。选中概率表示请求到达时该通道被选中的概率。成本来源优先级为：实测成本 → 账号配置成本 → 目录参考价 → 默认回退单价。': 'Routes are auto-generated by model availability. Priorities are managed as P0/P1 buckets, and multiple channels can share the same bucket; drag channels or the gray separators to adjust them. Exact model routes auto-filter accounts and tokens that support that model. Priority edits inside group routes write back to the source channels directly. Selection probability is the chance a channel is chosen. Cost priority: measured cost -> account configured cost -> catalog reference price -> default fallback unit price.',
  '该群组会将多个来源模型聚合为一个对外模型名；这里调整优先级桶时会直接回写来源通道。若某个来源模型被其他群组复用，保存前会提示影响范围。': 'This group aggregates multiple source models into one public model name. Priority bucket edits here write back to the source channels directly. If a source model is reused by other groups, you will be warned about the impact before saving.',
  '通配符路由按请求实时决策；下方优先级桶在整条路由内全局生效，来源模型只作为通道标签展示。': 'Wildcard routes decide per request. The priority buckets below apply globally across the whole route, while source models are shown only as channel labels.',
  '系统会根据模型可用性自动生成路由；精确模型路由会自动过滤只支持该模型的账号和令牌。': 'Routes are auto-generated by model availability; exact model routes auto-filter accounts and tokens that support that model.',
  'P 值是硬优先级，只会在当前最高可用优先级内结合权重、成本和健康度随机选择': 'P value is a hard priority. Selection stays within the highest available priority tier, then chooses randomly using weight, cost, and health signals.',
  '忽略 P 值，按全局顺序依次调用；连续失败 3 次后进入分级冷却': 'Ignore P value and call in global order; after 3 consecutive failures the channel enters staged cooldown.',
  '先避开最近失败或不健康站点，再在稳定池里按顺序轮询；P 值表示轮询顺位': 'Avoid recently failed or unhealthy sites first, then rotate through the stable pool in order; P value means rotation order.',
  '当前策略不看 P 值；如果之后切回其他策略，拖拽保存的顺序仍会保留。': 'This strategy does not use P value; if you switch back to other strategies later, the saved drag order is still kept.',
  '当前策略下，稳定站点会按 P 顺序轮换；不稳定站点会被自动降权或临时避让。': 'Under this strategy, stable sites rotate by P order; unstable sites are automatically downweighted or temporarily avoided.',
  '只要更高优先级还有可用通道，后面的通道本次就不会参与选择。': 'As long as a higher-priority tier still has available channels, later channels will not participate in this selection.',
  '选中概率用于解释当前策略下这一次请求更可能落到哪里；轮询和稳定优先更适合把它当作顺序参考。': 'Selection probability explains where this request is more likely to land under the current strategy; for round robin and stable first it is better treated as an order hint.',
  '代理端点': 'Proxy Endpoints',
  '路由行为': 'Routing Behavior',
  '指标口径': 'Metric Notes',
  'metapi 将多个上游兼容供应商聚合为统一的 OpenAI / Claude 下游兼容入口。': 'Metapi aggregates multiple upstream compatible providers into a unified OpenAI / Claude compatible downstream endpoint.',
  '核心目标：自动签到、自动模型发现、自动路由重建、统一代理可观测性。': 'Core goals: auto check-in, auto model discovery, auto route rebuild, and unified proxy observability.',
  '1. 路由根据模型可用性自动生成。': '1. Routes are auto-generated based on model availability.',
  '2. 当模型或账号发生变更时，路由通道会自动重建。': '2. Route channels are auto-rebuilt when models or accounts change.',
  '3. 手动覆盖配置为可选项，且会尽可能保留。': '3. Manual overrides are optional and kept whenever possible.',
  '4. 成本来源优先级：实测成本 → 账号配置成本 → 目录参考价 → 默认回退单价。': '4. Cost source priority: measured cost -> account configured cost -> catalog reference price -> default fallback unit price.',
  '5. 同站点多通道会进行概率分摊，避免仅因通道数量导致过度偏置。': '5. Multi-channel routes from the same site share probability to avoid bias from channel count alone.',
  '1. 模型广场价格来自上游目录数据，用于展示参考。': '1. Marketplace prices come from upstream catalog data for reference.',
  '2. 路由实测成本来自代理真实请求统计，两者不是同一数据源。': '2. Route measured cost comes from real proxy requests; it is not the same data source.',
  '3. 覆盖槽位是模型维度累计值；去重账号是唯一账号数。': '3. Coverage slots are model-level cumulative counts; unique accounts are deduplicated account counts.',
  '请求超时（': 'Request timed out (',
  '未知账号': 'Unknown Account',
  '未知站点': 'Unknown Site',
  '未知': 'Unknown',
  '未设置': 'Not Set',
  '成功': 'Success',
  '失败': 'Failed',
  '警告': 'Warning',
  '信息': 'Info',
  '异常': 'Error',
  '加载中...': 'Loading...',
  '刷新': 'Refresh',
  '保存中...': 'Saving...',
  '保存失败': 'Save failed',
  '同步中...': 'Syncing...',
  '同步': 'Sync',
  '添加': 'Add',
  '编辑': 'Edit',
  '删除': 'Delete',
  '选择站点': 'Select Site',
  '选择令牌（可选）': 'Select Token (optional)',
  '选择账号后同步站点令牌': 'Select an account to sync site tokens',
  '站点名称': 'Site Name',
  '站点 URL (例如 https://api.example.com)': 'Site URL (e.g. https://api.example.com)',
  '自动检测': 'Auto Detect',
  '检测中': 'Detecting',
  '保存站点': 'Save Site',
  '保存修改': 'Save Changes',
  '编辑站点': 'Edit Site',
  '添加站点': 'Add Site',
  '阿里云 CodingPlan / OpenAI': 'Alibaba Cloud Coding Plan / OpenAI',
  '阿里云 CodingPlan / Claude': 'Alibaba Cloud Coding Plan / Claude',
  '智谱 Coding Plan / OpenAI': 'Zhipu Coding Plan / OpenAI',
  '智谱 Coding Plan / Claude': 'Zhipu Coding Plan / Claude',
  '豆包 Coding Plan / OpenAI': 'Doubao Coding Plan / OpenAI',
  '百度 CodingPlan / OpenAI': 'Baidu Coding Plan / OpenAI',
  '百度 CodingPlan / Claude': 'Baidu Coding Plan / Claude',
  '暂无站点': 'No Sites',
  '点击“+ 添加站点”开始使用。': 'Click "+ Add Site" to start.',
  '重建中...': 'Rebuilding...',
  '发送中...': 'Sending...',
  '导入中...': 'Importing...',
  '创建中...': 'Creating...',
  '更新中...': 'Updating...',
  '登录并添加...': 'Logging in and adding...',
  '添加中...': 'Adding...',
  '同步站点令牌': 'Sync Site Tokens',
  '同步全部账号': 'Sync All Accounts',
  '+ 新增令牌': '+ New Token',
  '保存通知设置': 'Save Notification Settings',
  '发送测试通知': 'Send Test Notification',
  '通知设置已保存': 'Notification settings saved',
  '测试通知已发送': 'Test notification sent',
  '操作失败': 'Operation failed',
  '操作已中止': 'Operation aborted',
  '清空日志': 'Clear Logs',
  '加载更多': 'Load More',
  '全部类型': 'All Types',
  '仅看未读': 'Unread Only',
  '时间': 'Time',
  '类型': 'Type',
  '级别': 'Level',
  '标题': 'Title',
  '内容': 'Content',
  '状态': 'Status',
  '已读': 'Read',
  '未读': 'Unread',
  '标记已读': 'Mark Read',
  '标记中...': 'Marking...',
  '清空中...': 'Clearing...',

  // About page
  '中转站的中转站 — 将你在各处注册的 New API / One API / OneHub 等 AI 中转站聚合为一个统一网关。一个 API Key、一个入口，自动发现模型、智能路由、成本最优。': 'The hub of hubs — aggregate all your New API / One API / OneHub relay sites into one unified gateway. One API Key, one endpoint, with auto model discovery, smart routing, and cost optimization.',
  '核心特色': 'Key Features',
  '统一代理网关': 'Unified Proxy Gateway',
  '一个 Key、一个入口，兼容 OpenAI / Claude 下游格式': 'One Key, one endpoint, compatible with OpenAI / Claude downstream formats',
  '智能路由引擎': 'Smart Routing Engine',
  '按成本、延迟、成功率自动选择最优通道，故障自动转移': 'Auto-selects the optimal channel by cost, latency, and success rate with automatic failover',
  '多站点聚合': 'Multi-Site Aggregation',
  '集中管理 New API / One API / OneHub / DoneHub / Veloera 等': 'Centrally manage New API / One API / OneHub / DoneHub / Veloera and more',
  '自动模型发现': 'Auto Model Discovery',
  '上游新增模型自动出现在模型列表，零配置路由生成': 'New upstream models appear automatically, with zero-config route generation',
  '跨站模型覆盖、定价对比、延迟与成功率实测数据': 'Cross-site model coverage, pricing comparison, latency and success rate metrics',
  '自动签到': 'Auto Check-in',
  '定时签到 + 余额刷新，不再手动操心': 'Scheduled check-in and balance refresh, never miss one again',
  '多渠道告警': 'Multi-Channel Alerts',
  'Webhook / Bark / Server酱 / 邮件，余额不足及时提醒': 'Webhook / Bark / ServerChan / Email — get notified when balance is low',
  '轻量部署': 'Lightweight Deployment',
  '单 Docker 容器，内置 SQLite，无外部依赖': 'Single Docker container with built-in SQLite, no external dependencies',
  '技术栈': 'Tech Stack',
  '高性能 Node.js 后端框架': 'High-performance Node.js backend framework',
  '用户界面库': 'User interface library',
  '端到端类型安全': 'End-to-end type safety',
  '原子化样式框架': 'Utility-first CSS framework',
  '轻量 TypeScript ORM': 'Lightweight TypeScript ORM',
  '零配置嵌入式数据库': 'Zero-config embedded database',
  '项目链接': 'Project Links',
  '数据与隐私': 'Data & Privacy',
  'Metapi 完全自托管，所有数据（账号、令牌、路由、日志）均存储在本地 SQLite 数据库中，不会向任何第三方发送数据。代理请求仅在你的服务器与上游站点之间直连传输。': 'Metapi is fully self-hosted. All data (accounts, tokens, routes, logs) is stored in a local SQLite database and never sent to any third party. Proxy requests travel directly between your server and upstream sites.',
};

for (const [source, target] of Object.entries(zhToEnSupplemental)) {
  if (!zhToEn[source]) {
    zhToEn[source] = target;
  }
}

const HAS_HAN_RE = /[\u3400-\u9fff]/;
const HAN_BLOCK_RE = /[\u3400-\u9fff]+/g;
const LATIN_OR_DIGIT_RE = /[A-Za-z0-9]/;
const TRANSLATABLE_ATTRS = ['placeholder', 'title', 'aria-label'] as const;
const SKIP_PARENT_SELECTOR = 'script, style, code, pre, kbd, samp';
const zhToEnPhrases = Object.entries(zhToEn).sort((a, b) => b[0].length - a[0].length);
const textNodeOriginalMap = new WeakMap<Text, string>();
const elementAttrOriginalMap = new WeakMap<Element, Map<string, string>>();

const CJK_PUNCT_TO_ASCII: Record<string, string> = {
  '，': ', ',
  '。': '. ',
  '：': ': ',
  '；': '; ',
  '！': '! ',
  '？': '? ',
  '（': '(',
  '）': ')',
  '【': '[',
  '】': ']',
  '“': '"',
  '”': '"',
  '‘': '\'',
  '’': '\'',
  '、': ', ',
};

const FALLBACK_HAN_PHRASES: Record<string, string> = {
  '使用日志': 'Usage Logs',
  '连接管理': 'Connection Management',
  '连结管理': 'Link Management',
  '链接管理': 'Link Management',
  '下游密钥': 'Downstream Keys',
  '下游密匙': 'Downstream Keys',
  '站点公告': 'Site Announcements',
  '模型广场': 'Model Marketplace',
  '模型操练场': 'Model Playground',
  '模型测试': 'Model Testing',
  '程序日志': 'Program Logs',
  '通知设置': 'Notification Settings',
  '导入导出': 'Import Export',
  '系统设置': 'System Settings',
  '站点管理': 'Site Management',
  '账号管理': 'Account Management',
  '路由管理': 'Route Management',
  '可用性监控': 'Availability Monitor',
  '代理调试追踪': 'Proxy Debug Traces',
  '调试追踪': 'Debug Traces',
  '调试设置': 'Debug Settings',
  '最近调试追踪': 'Recent Debug Traces',
  '路由决策': 'Route Decision',
  '请求响应头': 'Request Response Headers',
  '请求响应体': 'Request Response Body',
  '流式分片': 'Streaming Chunks',
  '上游返回': 'Upstream Response',
  '站点日志回填': 'Site Log Backfill',
  '下游请求路径': 'Downstream Request Path',
  '上游请求路径': 'Upstream Request Path',
  '最终上游路径': 'Final Upstream Path',
  '原始下游请求头': 'Original Downstream Request Headers',
  '原始下游请求体': 'Original Downstream Request Body',
  '最终响应': 'Final Response',
  '候选': 'Candidates',
  '目标地址': 'Target URL',
  '目标客户端': 'Target Client',
  '目标模型': 'Target Model',
  '执行器': 'Executor',
  '恢复逻辑': 'Recovery Logic',
  '降级决策': 'Fallback Decision',
  '降级原因': 'Fallback Reason',
  '过滤范围': 'Filter Scope',
  '定向过滤': 'Targeted Filter',
  '保留策略': 'Retention Policy',
  '保留时长': 'Retention Duration',
  '抓取体积上限': 'Capture Size Limit',
  '计费过程': 'Billing Process',
  '用量来源': 'Usage Source',
  '缓存创建': 'Cache Creation',
  '缓存价格': 'Cache Price',
  '提示价格': 'Prompt Price',
  '补全价格': 'Completion Price',
  '模型倍率': 'Model Multiplier',
  '输出倍率': 'Output Multiplier',
  '缓存倍率': 'Cache Multiplier',
  '分组倍率': 'Group Multiplier',
  '缓存': 'Cache',
  '补全': 'Completion',
  '提示': 'Prompt',
  '输入': 'Input',
  '输出': 'Output',
  '花费': 'Cost',
  '预估费用': 'Estimated Cost',
  '总计': 'Total',
  '用时': 'Duration',
  '首字': 'First Byte',
  '流式': 'Streaming',
  '非流': 'Non-streaming',
  '推测': 'Inferred',
  '客户端详情': 'Client Details',
  '日志详情': 'Log Details',
  '追踪详情': 'Trace Details',
  '暂无追踪详情': 'No trace details',
  '调试追踪上一页': 'Previous Debug Trace Page',
  '调试追踪下一页': 'Next Debug Trace Page',
  '显示第': 'Showing',
  '错误信息': 'Error Message',
  '未记录': 'Not Recorded',
  '下游路径': 'Downstream Path',
  '上游路径': 'Upstream Path',
  '客户端': 'Client',
  '请求模型': 'Requested Model',
  '实际模型': 'Actual Model',
  '站点': 'Site',
  '账号': 'Account',
  '模型': 'Model',
  '状态': 'Status',
  '操作': 'Actions',
  '时间': 'Time',
  '开始': 'Start',
  '结束': 'End',
  '详情': 'Details',
  '模式': 'Mode',
  '重试': 'Retry',
  '成功': 'Success',
  '失败': 'Failed',
  '全部': 'All',
  '暂无': 'None',
  '未知': 'Unknown',
  '通用': 'General',
  '开启': 'Enable',
  '关闭': 'Close',
  '刷新': 'Refresh',
  '清空': 'Clear',
  '保存': 'Save',
  '新增': 'Add',
  '编辑': 'Edit',
  '删除': 'Delete',
  '复制': 'Copy',
  '查看': 'View',
  '展开': 'Expand',
  '收起': 'Collapse',
  '加载': 'Loading',
  '筛选': 'Filter',
  '搜索': 'Search',
  '选择': 'Select',
  '全选': 'Select All',
  '反选': 'Invert Selection',
  '取消': 'Cancel',
  '确认': 'Confirm',
  '随机': 'Random',
  '移除': 'Remove',
  '停止': 'Stop',
  '发送': 'Send',
  '重置': 'Reset',
  '跳转': 'Go To',
  '部署': 'Deploy',
  '测试': 'Test',
  '测活': 'Health Check',
  '测速': 'Speed Test',
  '探测': 'Probe',
  '检查更新': 'Check for Updates',
  '更多': 'More',
  '范围概览': 'Scope Overview',
  '当前范围汇总': 'Current Scope Summary',
  '当前范围': 'Current Scope',
  '固定窗口对比': 'Fixed Window Comparison',
  '使用趋势': 'Usage Trend',
  '使用统计': 'Usage Statistics',
  '调用': 'Calls',
  '总调用': 'Total Calls',
  '请求数': 'Requests',
  '累计请求': 'Total Requests',
  '累计成本': 'Total Cost',
  '累计消耗': 'Total Spend',
  '总消耗': 'Total Spend',
  '资源消耗': 'Resource Usage',
  '消耗总额': 'Total Spend',
  '消耗': 'Spend',
  '成本': 'Cost',
  '成本额度': 'Cost Limit',
  '成本优先': 'Cost First',
  '请求额度': 'Request Limit',
  '额度窗口': 'Quota Window',
  '额度': 'Quota',
  '总额度': 'Total Quota',
  '不限额度': 'Unlimited Quota',
  '成本不限': 'Unlimited Cost',
  '不限': 'Unlimited',
  '用量': 'Usage',
  '清零用量': 'Reset Usage',
  '批量清零用量': 'Batch Reset Usage',
  '批量归类': 'Batch Categorize',
  '归类标签': 'Categorize Tags',
  '批量': 'Batch',
  '应用到所选密钥': 'Apply to Selected Keys',
  '下游': 'Downstream',
  '密钥': 'Key',
  '复制完整密钥': 'Copy Full Key',
  '完整密钥暂不可用请刷新页面后重试': 'Full key is not available yet. Refresh the page and try again',
  '未授权模型': 'No Authorized Models',
  '未授权群组': 'No Authorized Groups',
  '默认倍率': 'Default Multiplier',
  '倍率': 'Multiplier',
  '站点倍率': 'Site Multiplier',
  '模型白名单': 'Model Allowlist',
  '群组范围': 'Group Scope',
  '授权范围': 'Authorization Scope',
  '主分组': 'Main Group',
  '未分组': 'Ungrouped',
  '不改动主分组': 'Keep Main Group Unchanged',
  '统一设为主分组': 'Set Unified Main Group',
  '标签': 'Tags',
  '无标签': 'No Tags',
  '不改动标签': 'Keep Tags Unchanged',
  '追加标签': 'Append Tags',
  '匹配任一标签': 'Match Any Tag',
  '匹配全部标签': 'Match All Tags',
  '备注说明': 'Notes',
  '备注': 'Notes',
  '填写业务场景负责人或限制说明': 'Enter business scenario, owner, or limit notes',
  '留空表示不限': 'Leave empty for unlimited',
  '永久有效': 'Never Expires',
  '最近使用': 'Last Used',
  '到期': 'Expires',
  '已选': 'Selected',
  '可见密钥': 'Visible Keys',
  '个密钥': 'keys',
  '个群组': 'groups',
  '个模型': 'models',
  '个凭证': 'credentials',
  '个成员': 'members',
  '个问题': 'issues',
  '个连接': 'connections',
  '个重复': 'duplicates',
  '个会话附件': 'session attachments',
  '请求': 'Requests',
  '模型路由': 'Model Routes',
  '路由': 'Routes',
  '通道': 'Channels',
  '群组': 'Groups',
  '分组': 'Group',
  '成员摘要': 'Member Summary',
  '能力': 'Capability',
  '策略': 'Strategy',
  '轮询': 'Round Robin',
  '权重随机': 'Weighted Random',
  '稳定优先': 'Stable First',
  '均衡': 'Balanced',
  '权重': 'Weight',
  '优先级': 'Priority',
  '分界线': 'Separator',
  '冷却': 'Cooldown',
  '清除冷却': 'Clear Cooldown',
  '放到新档位': 'Move to New Tier',
  '覆盖档位': 'Covered Tiers',
  '缺少分组': 'Missing Group',
  '未生成': 'Not Generated',
  '直接使用连接': 'Directly Use Connection',
  '当前连接': 'Current Connection',
  '当前生效': 'Currently Active',
  '固定使用': 'Fixed Use',
  '已固定到': 'Fixed To',
  '已切换为轮询策略': 'Switched to Round Robin Strategy',
  '已切换为权重随机策略': 'Switched to Weighted Random Strategy',
  '已切换为稳定优先策略': 'Switched to Stable First Strategy',
  '确认批量': 'Confirm Batch',
  '退出批量': 'Exit Batch',
  '自定义排序': 'Custom Sort',
  '全选可见项': 'Select Visible Items',
  '全选可见': 'Select Visible',
  '置顶': 'Pin to Top',
  '上移': 'Move Up',
  '下移': 'Move Down',
  '重新绑定': 'Rebind',
  '确认重新绑定': 'Confirm Rebind',
  '单位成本': 'Unit Cost',
  '推荐': 'Recommended',
  '检测到': 'Detected',
  '已补入': 'Added',
  '已识别': 'Recognized',
  '包含': 'Contains',
  '连接': 'Connection',
  '用户': 'User',
  '不支持': 'Not Supported',
  '奖励': 'Reward',
  '建议': 'Suggestion',
  '分类': 'Category',
  '账户数据': 'Account Data',
  '今日': 'Today',
  '活跃账户': 'Active Accounts',
  '性能指标': 'Performance Metrics',
  '最近': 'Recent',
  '平均响应': 'Average Response',
  '无请求': 'No Requests',
  '一键测速': 'One-click Speed Test',
  '隐藏未使用': 'Hide Unused',
  '显示未使用': 'Show Unused',
  '访问': 'Access',
  '使用': 'Use',
  '低': 'Low',
  '高': 'High',
  '秒请求': 'Requests/sec',
  '公告': 'Announcements',
  '暂无公告': 'No Announcements',
  '当前没有可显示的站点公告': 'There are no site announcements to display',
  '本地时区': 'Local Time Zone',
  '首次发现': 'First Seen',
  '手动同步': 'Manual Sync',
  '清空公告': 'Clear Announcements',
  '更新提醒': 'Update Reminder',
  '暂无数据': 'No Data',
  '暂无趋势数据': 'No Trend Data',
  '暂无日志': 'No Logs',
  '暂无事件': 'No Events',
  '暂无完成记录': 'No Completed Records',
  '暂无可选策略': 'No Available Strategies',
  '当前运行': 'Current Running',
  '当前运行版本': 'Current Running Version',
  '可部署版本': 'Deployable Version',
  '可部署': 'Deployable',
  '未发现版本': 'No Version Found',
  '发现新版本': 'New Version Found',
  '已是最新': 'Up to Date',
  '已停用': 'Disabled',
  '空闲': 'Idle',
  '后台检查': 'Background Check',
  '最近任务': 'Recent Tasks',
  '最近发现': 'Last Found',
  '最近推送': 'Last Push',
  '最近完成': 'Last Completed',
  '任务快照': 'Task Snapshot',
  '部署日志': 'Deployment Logs',
  '回退历史': 'Rollback History',
  '填入当前候选': 'Fill Current Candidate',
  '填入手动区': 'Fill Manual Area',
  '实时日志流已断开已回退到任务详情快照': 'Live log stream disconnected; fell back to task detail snapshot',
  '适合直接跟随镜像标签推进部署': 'Suitable for following image tags directly for deployment',
  '当前来源还没有可部署版本': 'Current source has no deployable version yet',
  '检测到比当前运行版本更新的稳定版可直接发起部署': 'Detected a stable version newer than current running version; deployment can be started directly',
  '当前已运行该版本无需重复部署': 'This version is already running; no redeploy needed',
  '当前已运行该镜像无需重复部署': 'This image is already running; no redeploy needed',
  '当前运行版本与已发现的部署目标没有明显差异': 'No obvious difference between current running version and discovered deployment target',
  '后台会定时检查新版本并在首次发现时提醒一次': 'The background checks for new versions regularly and reminds once when first found',
  '以当前容器内运行版本为准': 'Uses the version running in the current container',
  '无法检查更新': 'Unable to Check Updates',
  '已可部署': 'Ready to Deploy',
  '数据预览': 'Data Preview',
  '导出数据': 'Export Data',
  '导出分区': 'Export Sections',
  '从备份文件恢复数据': 'Restore Data from Backup File',
  '敏感数据请离线保管': 'Keep sensitive data offline',
  '点击选择文件': 'Click to Choose File',
  '点击重新选择文件': 'Click to Choose Again',
  '包含分区': 'Included Sections',
  '结构有效': 'Structure Valid',
  '注意事项': 'Notes',
  '无有效数据': 'No Valid Data',
  '可留空': 'Optional',
  '留空则保持不变': 'Leave empty to keep unchanged',
  '书签': 'Bookmarks',
  '会话附件': 'Session Attachments',
  '附件': 'Attachment',
  '附件上传完成': 'Attachment Upload Complete',
  '正在上传附件': 'Uploading Attachment',
  '当前协议暂不支持会话附件': 'Current protocol does not support session attachments',
  '当前协议不支持这些会话附件': 'Current protocol does not support these session attachments',
  '当前协议暂不支持会话附件注入': 'Current protocol does not support session attachment injection',
  '当前界面的会话附件会以内联文档方式发送': 'Session attachments on this screen are sent as inline documents',
  '文档会以内联数据注入': 'Documents are injected as inline data',
  '图片会按图片部件发送': 'Images are sent as image parts',
  '音频会按音频部件发送': 'Audio is sent as audio parts',
  '缺少可重放的数据': 'Missing replayable data',
  '待上传': 'Pending Upload',
  '已上传': 'Uploaded',
  '移除附件': 'Remove Attachment',
  '图片': 'Image',
  '音频': 'Audio',
  '文档': 'Document',
  '图片生成': 'Image Generation',
  '图片结果': 'Image Result',
  '视频创建': 'Video Creation',
  '视频任务结果': 'Video Task Result',
  '对话': 'Conversation',
  '对话轮数': 'Conversation Turns',
  '测试模式': 'Test Mode',
  '请选择测试模式': 'Select Test Mode',
  '协议': 'Protocol',
  '输出格式': 'Output Format',
  '请选择协议': 'Select Protocol',
  '采样参数': 'Sampling Parameters',
  '开始对话测试': 'Start Conversation Test',
  '输入视频生成提示词': 'Enter video generation prompt',
  '输入图片提示词': 'Enter image prompt',
  '原图': 'Original Image',
  '参考图': 'Reference Image',
  '发送请求': 'Send Request',
  '请先补全当前模式所需的输入': 'Complete the inputs required for the current mode first',
  '恢复任务': 'Restore Task',
  '任务': 'Task',
  '匹配': 'Match',
  '已创建任务': 'Task Created',
  '调试': 'Debug',
  '预览': 'Preview',
  '响应': 'Response',
  '请求体': 'Request Body',
  '自定义请求': 'Custom Request',
  '设置': 'Settings',
  '秒': 'Seconds',
  '分钟': 'Minutes',
  '小时': 'Hours',
  '天': 'Days',
  '文本': 'Text',
  '文本值': 'Text Value',
  '文本值不能为空': 'Text value cannot be empty',
  '字段路径': 'Field Path',
  '规则': 'Rule',
  '动作': 'Action',
  '选择动作': 'Select Action',
  '新增规则': 'Add Rule',
  '常用预设': 'Common Presets',
  '还没有可视化规则': 'No visual rules yet',
  '无论原请求是否已有该字段都强制覆盖': 'Always override whether or not the original request has this field',
  '强制覆盖': 'Force Override',
  '一行一个关键词或逗号分隔': 'One keyword per line or comma separated',
  '之类的参数': 'similar parameters',
  '并发': 'Concurrency',
  '会话池': 'Session Pool',
  '定时任务': 'Scheduled Tasks',
  '保留天数': 'Retention Days',
  '批量测活': 'Batch Health Check',
  '随机生成': 'Random Generate',
  '选择单位': 'Select Unit',
  '高级输入连接串': 'Advanced Connection String Input',
  '允许覆盖目标数据库现有数据': 'Allow overwriting existing target database data',
  '测试连接': 'Test Connection',
  '开始迁移': 'Start Migration',
  '维护工具': 'Maintenance Tools',
  '会话与安全': 'Session and Security',
  '管理': 'Management',
  '告警去噪与冷静期': 'Alert Deduplication and Cooldown',
  '冷静期': 'Cooldown',
  '微信推送消息支持': 'WeChat Push Notification Support',
  '通过电子邮件推送提醒': 'Send reminders by email',
  '端口': 'Port',
  '接收地址': 'Recipient Address',
  '授权指引': 'Authorization Guide',
  '固定回调地址': 'Fixed Callback URL',
  '本地部署': 'Local Deployment',
  '云端部署': 'Cloud Deployment',
  '手动回调': 'Manual Callback',
  '等待授权完成': 'Waiting for Authorization Completion',
  '回调已提交等待授权完成': 'Callback submitted; waiting for authorization completion',
  '识别结果': 'Recognition Result',
  '已连接': 'Connected',
  '重新授权': 'Reauthorize',
  '拆回单体': 'Split Back to Single',
  '单体': 'Single',
  '官方': 'Official',
  '响应头推断': 'Inferred from Response Headers',
  '正常': 'Normal',
  '支持': 'Supported',
  '剩余': 'Remaining',
  '邮箱': 'Email',
  '计划': 'Plan',
  '项目': 'Project',
  '现在': 'Now',
  '当前浏览器不支持读取该文件': 'Current browser cannot read this file',
  '当前连接暂不支持额度窗口': 'Current connection does not support quota window yet',
  '额度窗口已从响应头推断': 'Quota window inferred from response headers',
  '已拆回单体': 'Split back to single',
  '已选择': 'Selected',
  '授权': 'Authorization',
  '站点隧道': 'Site Tunnel',
  '平台': 'Platform',
  '套餐': 'Plan',
  '生效订阅': 'Active Subscription',
  '总量': 'Total',
  '已用': 'Used',
  '已到期': 'Expired',
  '聚合面板适合多渠道统一管理': 'Aggregation panel for unified multi-channel management',
  '聚合面板适合统一转发与管理': 'Aggregation panel for unified forwarding and management',
  '当前值': 'Current Value',
  '开始探测范围': 'Start probing scope',
  '探测完成': 'Probe Complete',
  '触发频率限制': 'Triggered Rate Limit',
  '无权限': 'No Permission',
  '已手动停止': 'Manually Stopped',
  '已应用官方预设': 'Official Preset Applied',
  '顺序': 'Order',
  '冷却至': 'Cooling Until',
  '立即探测': 'Probe Now',
  '自定义头': 'Custom Headers',
  '已批量': 'Batch Completed',
  '是否继续': 'Continue?',
  '已将': 'Set',
  '改用高级规则': 'Use Advanced Rules',
  '返回简单模式': 'Return to Simple Mode',
  '确认选择': 'Confirm Selection',
  '可选择': 'Selectable',
  '选择绑定方式': 'Select Binding Method',
  '放到': 'Move to',
  '当前分组覆盖存在不确定性': 'Current group override is uncertain',
  '已覆盖': 'Covered',
  '成员': 'Members',
  '第': 'No.',
  '条规则缺少字段路径': 'rule is missing field path',
  '请求头': 'Request Header',
  '重复了': 'is duplicated',
  '最大费用': 'Maximum Cost',
  '最大请求数': 'Maximum Requests',
  '请输入上方确认语句': 'Enter the confirmation phrase above',
  '低延迟': 'Low Latency',
  '高延迟': 'High Latency',
  '条': 'items',
  '项': 'items',
  '个': 'items',
  '次': 'times',
  '等': 'etc.',
  '或': 'or',
  '无': 'None',
  '吗': 'Confirm',
};
const fallbackHanPhrases = Object.entries(FALLBACK_HAN_PHRASES).sort((a, b) => b[0].length - a[0].length);

function translateHanBlockFallback(block: string): string {
  let translated = block;
  for (const [source, target] of fallbackHanPhrases) {
    if (!translated.includes(source)) continue;
    translated = translated.split(source).join(` ${target} `);
  }
  translated = translated.replace(HAN_BLOCK_RE, ' ');
  return translated.replace(/\s+/g, ' ').trim() || 'Item';
}

function enforceStrictEnglish(text: string): string {
  const normalizedPunctuation = text.replace(/[，。：；！？（）【】“”‘’、]/g, (ch) => CJK_PUNCT_TO_ASCII[ch] ?? ch);
  const translatedHan = normalizedPunctuation.replace(HAN_BLOCK_RE, (block) => ` ${translateHanBlockFallback(block)} `);
  const compacted = translatedHan.replace(/\s+/g, ' ').trim();
  if (!compacted) return 'Untranslated';
  if (!LATIN_OR_DIGIT_RE.test(compacted)) return 'Untranslated';
  return compacted;
}

function resolveStoredLanguage(): Language {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored === 'zh' || stored === 'en') return stored;
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

let runtimeLanguage: Language = 'zh';

export function translateText(text: string, language: Language): string {
  if (language === 'zh') return text;
  if (!text) return text;
  if (!HAS_HAN_RE.test(text)) return zhToEn[text] ?? text;
  const exact = zhToEn[text];
  if (exact) return exact;

  let translated = text;
  for (const [source, target] of zhToEnPhrases) {
    if (!source || source === target) continue;
    if (!translated.includes(source)) continue;
    translated = translated.split(source).join(target);
  }
  if (HAS_HAN_RE.test(translated)) return enforceStrictEnglish(translated);
  return translated;
}

export function tr(text: string): string {
  return translateText(text, runtimeLanguage);
}

type I18nContextValue = {
  language: Language;
  setLanguage: (next: Language) => void;
  toggleLanguage: () => void;
  t: (text: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const resolved = resolveStoredLanguage();
    runtimeLanguage = resolved;
    return resolved;
  });

  useEffect(() => {
    runtimeLanguage = language;
    document.documentElement.setAttribute('lang', language === 'zh' ? 'zh-CN' : 'en');
  }, [language]);

  useEffect(() => {
    const root = document.body;
    if (!root) return;

    const shouldTranslateTextNode = (node: Text): boolean => {
      const parent = node.parentElement;
      if (!parent) return false;
      if (parent.closest(SKIP_PARENT_SELECTOR)) return false;
      if (parent.isContentEditable) return false;
      const value = node.nodeValue || '';
      if (!value.trim()) return false;
      if (!HAS_HAN_RE.test(value) && language !== 'zh') return false;
      return true;
    };

    const processTextNode = (node: Text) => {
      if (!shouldTranslateTextNode(node)) return;
      const current = node.nodeValue || '';
      const stored = textNodeOriginalMap.get(node);
      if (!stored) {
        textNodeOriginalMap.set(node, current);
      } else {
        const expected = translateText(stored, language);
        if (current !== expected && current !== stored) {
          textNodeOriginalMap.set(node, current);
        }
      }
      const source = textNodeOriginalMap.get(node) || current;
      const next = translateText(source, language);
      if (next !== current) {
        node.nodeValue = next;
      }
    };

    const processElementAttrs = (el: Element) => {
      if (el.matches(SKIP_PARENT_SELECTOR)) return;
      let attrMap = elementAttrOriginalMap.get(el);
      if (!attrMap) {
        attrMap = new Map<string, string>();
        elementAttrOriginalMap.set(el, attrMap);
      }

      for (const attr of TRANSLATABLE_ATTRS) {
        const current = el.getAttribute(attr);
        if (!current || !current.trim()) continue;
        const stored = attrMap.get(attr);
        if (!stored) {
          attrMap.set(attr, current);
        } else {
          const expected = translateText(stored, language);
          if (current !== expected && current !== stored) {
            attrMap.set(attr, current);
          }
        }

        const source = attrMap.get(attr) || current;
        const next = translateText(source, language);
        if (next !== current) {
          el.setAttribute(attr, next);
        }
      }
    };

    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        processTextNode(node as Text);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const el = node as Element;
      processElementAttrs(el);
      for (const child of Array.from(el.childNodes)) {
        walk(child);
      }
    };

    walk(root);
    if (language !== 'en') {
      return;
    }

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'characterData') {
          processTextNode(record.target as Text);
          continue;
        }

        if (record.type === 'attributes') {
          processElementAttrs(record.target as Element);
          continue;
        }

        if (record.type === 'childList') {
          for (const node of Array.from(record.addedNodes)) {
            walk(node);
          }
        }
      }
    });

    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...TRANSLATABLE_ATTRS],
    });

    return () => {
      observer.disconnect();
    };
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    runtimeLanguage = next;
    setLanguageState(next);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    document.documentElement.setAttribute('lang', next === 'zh' ? 'zh-CN' : 'en');
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage(language === 'zh' ? 'en' : 'zh');
  }, [language, setLanguage]);

  const t = useCallback((text: string) => translateText(text, language), [language]);

  const value = useMemo<I18nContextValue>(() => ({
    language,
    setLanguage,
    toggleLanguage,
    t,
  }), [language, setLanguage, toggleLanguage, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return value;
}
