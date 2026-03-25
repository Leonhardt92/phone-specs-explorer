# phone_specs_advanced_filters_fullsite_complete_v4

这是完整整站包，已按正确的充电数据模型重构。

## 已整合的主要功能
- 左侧基础筛选区 + 右侧高级筛选入口栏
- 摄像头 / 屏幕 / 无线 / 其他硬件高级筛选
- 布尔项改为勾选框
- 结果列表支持点击展开
- 详情页为高利用率多列卡片布局
- 详情页底部有引用资料区，支持视频超链接
- 最大充电功率筛选
- 充电协议树形筛选（协议是父节点，功率档位是子节点）

## 页面文件
### 列表页
- `index.html`
- `assets/css/index.css`
- `assets/js/index.js`

### 详情页
- `detail.html`
- `assets/css/detail.css`
- `assets/js/detail.js`

### 多语言
- `assets/js/i18n.js`
- `locales/zh/common.json`
- `locales/en/common.json`
- `data/filters/languages.csv`

## 主要数据文件

### 1. 基础机型信息
- `data/items/phones.csv`

字段：
- `id`
- `brand`
- `model`
- `soc`
- `battery_mah`
- `length_mm`
- `width_mm`
- `thickness_mm`

### 2. 摄像头规格
- `data/items/phone_camera_specs.csv`

字段：
- `phone_id`
- `lens_role`
- `mp`
- `cmos_size_inch`
- `aperture`
- `ois`

### 3. 屏幕规格
- `data/items/phone_screen_specs.csv`

字段：
- `phone_id`
- `screen_size_inch`
- `resolution_tier`
- `max_refresh_hz`
- `max_brightness_nits`

### 4. 无线规格
- `data/items/phone_wireless_specs.csv`

字段：
- `phone_id`
- `wifi`

### 5. 频段
- `data/items/phone_bands.csv`

字段：
- `phone_id`
- `generation`
- `mode`
- `band`

说明：
- 详情页会按 `generation + mode` 分组显示频段
- 列表页无线筛选里使用树形频段筛选

### 6. 其他硬件规格
- `data/items/phone_hardware_specs.csv`

字段：
- `phone_id`
- `has_3_5mm`
- `usb_spec`
- `has_nfc`
- `has_ir`
- `motor_type`

对应关系：
- `has_3_5mm` → 3.5mm 耳机孔
- `usb_spec` → USB 规格
- `has_nfc` → NFC
- `has_ir` → 红外
- `motor_type` → 震动马达类型

### 7. 最大充电功率
- `data/items/phone_charging_specs.csv`

字段：
- `phone_id`
- `max_power_w`

对应关系：
- `max_power_w` → 手机最大充电功率

说明：
- “充电功率”筛选看的是这个字段
- 它表示整机最大充电功率，不等于某个单独协议下的功率

### 8. 充电协议关系
- `data/items/phone_charging_protocols.csv`

字段：
- `phone_id`
- `protocol`
- `power_w`

对应关系：
- `protocol` → 协议本体，例如 `USB PD`、`USB PD PPS`
- `power_w` → 该协议下可达到的功率档位

说明：
- 一台手机可以有多条协议记录
- 充电协议树形筛选是从这张表动态聚合生成的
- 树的父节点表示“支持该协议”
- 树的子节点表示“支持该协议下的具体功率档位”

### 9. 内存与存储
- `data/items/phone_memory.csv`
- `data/items/phone_storage.csv`

### 10. 引用资料
- `data/items/phone_references.csv`

字段：
- `phone_id`
- `title`
- `url`
- `kind`

`kind` 说明：
- `official` → 官方资料
- `video` → 视频链接

## 筛选配置文件

### 基础筛选
- `data/filters/brands.csv`
- `data/filters/battery_ranges.csv`
- `data/filters/ram_options.csv`
- `data/filters/storage_options.csv`
- `data/filters/length_ranges.csv`
- `data/filters/width_ranges.csv`
- `data/filters/thickness_ranges.csv`

### 充电筛选
- `data/filters/charging_power_ranges.csv`

说明：
- 最大充电功率区间单独配置
- 充电协议树不依赖固定配置文件，而是从 `phone_charging_protocols.csv` 动态聚合生成

### 摄像头筛选
- `data/filters/camera_mp_ranges.csv`
- `data/filters/camera_cmos_ranges.csv`
- `data/filters/camera_aperture_ranges.csv`

### 屏幕筛选
- `data/filters/screen_size_ranges.csv`
- `data/filters/screen_resolution_options.csv`
- `data/filters/screen_refresh_ranges.csv`
- `data/filters/screen_brightness_ranges.csv`

### 无线 / 硬件筛选
- `data/filters/wifi_options.csv`
- `data/filters/usb_options.csv`
- `data/filters/motor_type_options.csv`

### 频段树形结构
- `data/filters/band_modes.csv`
- `data/filters/band_options.csv`

说明：
- `band_modes.csv` 定义大类和模式骨架
- `band_options.csv` 定义 band 排序
- `phone_bands.csv` 定义每台手机实际支持哪些 band

## 编辑建议
- 改某台手机的 3.5mm / NFC / 红外 / USB / 马达：改 `phone_hardware_specs.csv`
- 改某台手机的最大充电功率：改 `phone_charging_specs.csv`
- 改某台手机支持的协议及其功率档位：改 `phone_charging_protocols.csv`
- 改某台手机支持的频段：改 `phone_bands.csv`
- 新增详情页底部资料 / 视频链接：改 `phone_references.csv`
- 新增筛选选项：改 `data/filters/` 下对应 CSV


## v5 修复
- 修复高级筛选打开后左侧基础搜索区仍然漏出来的问题
- 充电协议树形下拉在基础搜索页允许正常向下展开
- 当高级筛选面板打开时，搜索区重新裁切隐藏


## v6 补齐
上一版缺少：
- `locales/zh/common.json`
- `locales/en/common.json`
- 多个 `data/filters/*.csv`
- 多个 `data/items/*.csv`

这一版已经补齐为可独立运行的完整静态站点包。


## v8：震动马达类型改成多语言友好结构

### 修改文件
- `data/filters/motor_type_options.csv`
- `data/items/phone_hardware_specs.csv`
- `assets/js/index.js`
- `assets/js/detail.js`

### 新结构
`motor_type_options.csv`：

- `value`
- `label_zh`
- `label_en`
- `sort_order`

`phone_hardware_specs.csv` 里的 `motor_type` 现在写稳定值，例如：
- `x_axis_linear`
- `rotor`

前端会按当前语言自动显示中文或英文。


## v9 修复
- 修复详情页 `getMotorLabel is not defined` 报错。


## v10 修复
- 修复详情页 `motorRows is not defined` 报错（Promise.all 解构缺少 `motorRows`）。


## v11 修复
- 修复高级筛选打开后基础搜索区偶发没有完全隐藏的问题。
- 打开高级筛选时，基础搜索区现在直接隐藏，不再只依赖位移动画裁切。


## v12 修复
- 修复高级筛选面板打开后基础搜索区仍然漏出来的问题。
- 这次不再只依赖 CSS 类切换，而是在 `openPanel()` / `closePanel()` 中直接控制显示隐藏：
  - 打开高级筛选：`.filter-main` → `display:none`
  - 关闭高级筛选：`.filter-main` → `display:block`


## 多语言扩展

- 马达与 SoC 采用 `label_<lang>` 动态字段，例如 `label_zh`、`label_en`、`label_ja`。
- 新增语言时，除了补充 `locales/<lang>/common.json` 与 `data/filters/base/languages.csv` 外，数据类 CSV 只需增加对应 `label_<lang>` 列。
- SoC 树配置位于 `data/filters/chipset/soc_groups.csv` 与 `data/filters/chipset/soc_variants.csv`。
