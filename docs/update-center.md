# 更新中心

Docker / Docker Compose 可通过稳定的 runtime supervisor 在后台升级，无需 Kubernetes、Helm、Docker socket 或额外的部署助手。

## 使用条件

- 使用包含 supervisor 的新版 Docker 镜像，或通过 `node scripts/release/runtimeRunner.mjs` 启动源码构建。
- Linux amd64 / arm64，且 `$DATA_DIR` 持久化、可写；同一数据目录只运行一个 supervisor。
- 在更新中心开启升级，再手动选择版本。后台检查只通知，**不会自动安装**。
- 首次迁入本功能须先拉取一次新 Docker 镜像；旧进程没有 supervisor，不能靠切换文件自行重启。

armv7 镜像继续保留，但不发布应用内升级包，按钮会禁用并说明原因。非 Linux、桌面运行时和未受 supervisor 管理的进程也不会显示可用的服务器自升级能力。桌面客户端沿用自己的更新通道。

## 升级过程

1. 查询本项目的 GitHub Releases / Docker Hub 版本。应用内安装的是 **GitHub Release 中的升级包**，不是 Docker 镜像；`latest` / `dev` 等仅有镜像的别名须通过拉取镜像更新。
2. 下载 `metapi-evolution-<version>-<amd64|arm64>.tar.gz` 及 `checksums.txt`。下载有超时和大小上限；缺少校验文件、校验失败、路径越界或架构不符时拒绝安装。
3. 升级包包含服务器、两套已构建的 WebUI、数据库迁移文件、生产依赖及**与原生依赖一起构建的 Node 可执行文件**。安装前会验证 manifest 和原生模块能否加载。Docker 镜像 digest 不会被误当成压缩包 checksum。
4. 解压到新的不可变版本目录；不会覆盖正在运行的版本或回退目标。状态文件以临时文件、`fsync` 和原子 `rename` 写入。
5. 应用请求 supervisor 激活版本。supervisor 停止旧进程、运行候选版本的迁移，再启动新进程，保持稳定的容器入口不变。
6. 健康检查必须确认**本次新进程**的启动标识。只有健康检查通过，任务才显示成功；下载或切换符号链接不算升级成功。

升级会有短暂服务中断，不是集群滚动发布。任务及日志持久化，WebUI 断线后可重新查询结果，不会因进程重启丢失。

## 一次性回退

候选版本缺少入口、迁移失败、启动退出或健康检查失败时，supervisor 最多自动恢复一次之前的版本并启动它。回退结果和原因保留在更新中心。若上一版本也无法启动，保持失败记录，不在两个版本之间反复切换。

每次**用户明确发起的新升级**是独立事务，可以再次尝试；不是按整个安装历史累计“只准回退一次”。也可在确实存在上一版本时手动回退。

> 回退针对应用运行文件，不会自动降级数据库。涉及数据库结构变更前须另做一致性备份；破坏性迁移应安排维护窗口，不能依赖应用回退来撤销数据变更。

重新拉取并替换 Docker 镜像时，新镜像优先：supervisor 识别镜像 build ID 变化并采用新镜像内容，不会被数据卷中旧的 `current` 覆盖。同一镜像普通重启则继续使用已安装的运行版本。

## 配置与兼容

设置表键为 `update_center_config_v2`：

| 字段 | 含义 | 默认 |
|---|---|---|
| `enabled` | 允许手动发起升级 | `false` |
| `githubReleasesEnabled` | 查询 GitHub Releases | `true` |
| `dockerHubTagsEnabled` | 查询 Docker Hub 标签 | `true` |
| `defaultDeploySource` | 首选版本来源 | `github-release` |

旧的 `update_center_k3s_config_v1` 只作为迁移输入：保留启用和来源偏好，丢弃集群字段；新配置只写新键，旧键不删除。无需 helper token、Namespace、Chart Ref 或集群权限。

## 持久化目录

```text
$DATA_DIR/runtime/
├── releases/<version>-<checksum>/  不可变升级包
├── releases/image-<build-id>       镜像内的引导版本
├── current                        当前版本指针
├── previous                       回退目标指针
├── tasks/<id>.json                跨重启任务和日志
├── latest-task.json               最近一次任务
├── image.json                     镜像标识
└── update-state.json              激活阶段及一次性回退记录
```

不要在运行期间手工删除 `current`、`previous` 或 `tasks`；升级中断时先查看任务错误。下载未激活前中断，supervisor 在下次启动时清理暂存目录并保留旧版本。

## 发布和验证

Release workflow 使用与镜像一致的原生 Docker 构建分别生成 amd64 / arm64 升级包；两份独立 checksum 在发布时合并成 `checksums.txt`。CI 在两种架构上演练真实容器升级、checksum 拒绝、手动回退、迁移失败恢复和容器重启后的状态恢复：

```bash
docker buildx build -f docker/Dockerfile --target runtime --load -t metapi-runtime:test .
docker buildx build -f docker/Dockerfile --target server-bundle \
  --build-arg METAPI_BUNDLE_VERSION=99.0.0 --output type=local,dest=runtime-bundles .
node scripts/release/smokeRuntimeUpgrade.mjs --image metapi-runtime:test --bundles runtime-bundles
```

演练只使用临时 Docker 网络、测试数据卷和本地 HTTPS 制品服务，不发布公共版本、不修改现有部署。
