# 闪耀优俊少女 · 种马搜索器 Android

“种马搜索器”的独立 Android 轻量版。它在 App 内完成 B 站游戏登录，并提供针对手机屏幕设计的角色、因子和推荐结果界面。

当前版本为 `v0.1.26`，仍处于测试阶段。

## 功能

- 按角色、因子星级和优先级搜索并排序好友种马。
- 分别设置蓝、红、绿、白因子条件，以及家系和本体最低星级。
- 支持攻略技能清单智能识别、部分繁中名称转换和 OCR 错字容错。
- 选择金技能时自动使用对应的下位白技能因子。
- 使用“角色 / 因子 / 结果”三页式手机界面。
- 智能识别下方仍可继续手动选择；蓝、红因子直接完整显示，绿、白因子保留搜索和每批 8 项的翻页浏览。
- 手机端已选因子按高、中、低、必需标签切换，以双列小卡展示，点击小卡即可在底部面板修改星级和优先级。
- 因子编辑面板使用内嵌星级与优先级按钮，点外部空白自动保存，只保留删除操作。
- 智能识别预览采用双列小卡和每批 8 项的分页；白因子的已选区统一展示剧本、技能和比赛因子。
- 绿、白因子的具体可选项统一采用双列小卡和每批 8 项的分页。
- 结果页依次显示候选的全部蓝红因子、已选绿白因子和其余因子；搜索过程中显示真实查询进度与候选累计数。
- 支持触摸拖动颜色顺序，并保留上下按钮作为替代操作。

因子与技能名称资料参考：[赛马娘WIKI_BWIKI](https://wiki.biligame.com/umamusume/)。

## 构建调试版

需要 JDK 17 或更高版本，以及包含 Android 35 平台和 Build Tools 35.0.0 的 Android SDK。

在 PowerShell 中运行：

```powershell
.\scripts\build-debug.ps1 -SdkRoot "C:\Android\Sdk"
```

生成的调试安装包位于：

```text
app/build/outputs/apk/debug/uma-seed-searcher-android-v0.1.26-debug.apk
```

如果本机已安装 Gradle 8.9，也可以运行：

```powershell
gradle assembleDebug
```

Gradle 生成的调试安装包位于 `app/build/outputs/apk/debug/app-debug.apk`。

## 项目结构

| 路径 | 用途 |
| --- | --- |
| `app/` | Android WebView 容器和移动端界面 |
| `scripts/build-debug.ps1` | 不依赖 Gradle 安装的本地调试构建脚本 |
| 根目录 JavaScript | 因子识别、搜索、评分和访问保护逻辑 |
| `icons/` | 注入界面使用的应用图标 |

构建时会把根目录中的共享 JavaScript 和图标复制进 APK，不在 Android assets 中维护第二份搜索逻辑。

## 隐私边界

- App 只申请网络权限，不申请读取文件、相册、通讯录或定位权限。
- B 站登录发生在 B 站页面中，App 不提供读取、显示、导出或上传 Cookie 的接口。
- 因子偏好只保存在本机 WebView 存储中。
- B 站游戏及登录所需页面保留在 App 内，其他网站交给系统浏览器打开。
- SSL 证书异常时停止加载页面。

## 许可证

本项目采用 [MIT License](./LICENSE)。
