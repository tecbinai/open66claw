# 上游 OpenClaw 代码修改清单

> 本文档记录 66Claw 对上游 `src/` 目录的所有修改，便于合并上游更新时快速定位冲突并理解修改意图。

## 修改列表

### 1. 频道并行启动

**文件：** `src/gateway/server-channels.ts`

**修改内容：** 将 `startChannels()` 从串行 `for...await` 改为 `Promise.allSettled` 并行启动所有频道。

**修改原因：** 每个频道的 `startChannel()` 相互独立，串行启动在频道较多时增加不必要的等待时间。并行启动可缩短 gateway 启动耗时。

**影响范围：** 仅影响启动顺序，各频道功能不受影响。失败的频道会被单独 catch 并打印错误日志。

```diff
- for (const plugin of listChannelPlugins()) {
-   await startChannel(plugin.id);
- }
+ const results = await Promise.allSettled(
+   plugins.map((plugin) => startChannel(plugin.id)),
+ );
```

### 2. 延迟 Discovery 初始化

**文件：** `src/gateway/server.impl.ts`

**修改内容：** 将 mDNS/Bonjour 发现服务从同步启动改为 `void (async () => { ... })()` 异步后台执行，不阻塞 gateway 就绪。

**修改原因：** `startGatewayDiscovery()` 包含 `getMachineDisplayName()` 和 mDNS 广播初始化，耗时 3-10 秒。CN 场景主要是本地使用（loopback），不依赖 mDNS 发现。延迟执行让 gateway 更快可用。

**影响范围：** discovery 功能不受影响，仅启动时机延后。如果 discovery 初始化失败，错误会被 catch 并记录日志，不影响 gateway 运行。

```diff
- const machineDisplayName = await getMachineDisplayName();
- const discovery = await startGatewayDiscovery({ ... });
- bonjourStop = discovery.bonjourStop;
+ void (async () => {
+   try {
+     const machineDisplayName = await getMachineDisplayName();
+     const discovery = await startGatewayDiscovery({ ... });
+     bonjourStop = discovery.bonjourStop;
+   } catch (err) {
+     logDiscovery.error(`deferred discovery init failed: ${String(err)}`);
+   }
+ })();
```

## 合并上游时的注意事项

1. `git merge` 或 `git rebase` 上游代码时，这两个文件可能产生冲突
2. 冲突时保留上述修改逻辑，适配上游新增的参数或结构变化即可
3. 如果上游已实现类似优化（并行启动或延迟 discovery），可直接采用上游版本并移除本文档对应条目
4. 这两处修改均为性能优化，不涉及功能变更，回退不影响正确性
