# 更新中心

Docker / Docker Compose 部署可以在管理后台直接升级，不需要 Kubernetes 或 Helm。

## 它做什么

1. 从 GitHub Releases 或 Docker Hub 解析最新稳定版本
2. 下载对应架构的 `metapi-evolution-<version>-<arch>.tar.gz`
3. 用发布的 `checksums.txt` 校验 sha256，架构不匹配或校验失败则拒绝
4. 解压到 `$DATA_DIR/runtime/releases/<version>`，通过符号链接原子切换 `current`
5. 重启后由稳定 runner 做健康检查；失败则自动回退到上一版本

## 回退只发生一次

自动回退最多一次。同一个目标版本第二次健康检查失败时，升级停在 `failed`
状态并保持可见，不会反复回退再重试。需要手动确认后再发起下一次升级。

## 不支持的运行时

| 运行时 | 行为 |
|---|---|
| Linux amd64 / arm64 | 支持应用内升级 |
| Linux armv7 | 镜像可运行，但没有发布 bundle，升级按钮禁用并说明原因，需手动拉取新镜像 |
| 非 Linux | 升级按钮禁用，桌面版走自己的更新通道 |

armv7 继续被 Docker 镜像支持，是因为 Node 24+ 不再发布 `linux/arm/v7`，
镜像因此固定在 Node 22。更新中心如实报告能力，而不是显示一个无法工作的按钮。

## 配置

更新中心的配置保存在设置表，键为 `update_center_config_v2`：

| 字段 | 含义 | 默认 |
|---|---|---|
| `enabled` | 是否允许发起升级 | `false` |
| `githubReleasesEnabled` | 是否查询 GitHub Releases | `true` |
| `dockerHubTagsEnabled` | 是否查询 Docker Hub 标签 | `true` |
| `defaultDeploySource` | 默认来源，`github-release` 或 `docker-hub-tag` | `github-release` |

旧的 `update_center_k3s_config_v1` 会在首次读取时迁移到新键，
`enabled` 和来源偏好保留，集群相关字段丢弃。旧键不再写入，也不会被删除。

## 磁盘布局

```
$DATA_DIR/runtime/
├── releases/<version>/   解压后的不可变版本
├── current -> releases/<version>   当前运行版本
├── previous -> releases/<version>  回退目标
└── update-state.json     升级状态，跨重启保留
```

`current` 通过临时符号链接再 `rename` 切换，切换本身是原子的。
健康确认发生在重启之后，由 runner 完成。
