# 安卓端维护范围

- 同步 PC 更新时，同时核对种马搜索共享模块、金白技能关系、繁简名称与因子编号别名，以及技能查找的支援卡、技能、配色和实装日期。
- 共享资料以同级 `browser-extension` 维护目录为来源，使用 `node scripts/sync-hint-finder.mjs`；不得退回旧 `hint-finder/dist` 快照。
- 安卓的 `content.js`、`mobile-ui.js`、`android.css` 和 `embedded.js` 包含手机导航与返回逻辑，不直接覆盖为 PC 容器代码。
- 同步后枚举 `tests/*.test.cjs`、`tests/*.test.mjs` 并运行 Node 测试，再构建与核对 APK。Node 22 不能依赖 `node --test tests` 自动展开目录。
- 模拟器只使用用户指定的雷电实例，禁止使用 MuMu。操作前核对雷电实例、宿主进程和 ADB 端口归属，再核对设备型号；不能仅凭 `emulator-xxxx` 序号或 ADB 可执行文件的安装目录认定设备属于雷电。存在地址冲突时使用已核实属于雷电的连接，不停止其他模拟器或任务。
- 测试用 WebView 调试只能显式开启；最终交付 APK 关闭调试，包名、版本号及签名须与既有更新流程兼容。
- 仅同步与本地验证不自动发布。发布按用户当次授权执行，同步 Release 附件和 `downloads/uma-seed-searcher-android-latest.apk`。
- 不提交 `.local`、签名私钥、账号数据、个人路径或测试截图。来源记录使用仓库标识和文件哈希，不写本机绝对路径。
