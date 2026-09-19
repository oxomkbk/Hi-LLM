import {
  comparePreview,
  flowPreview,
  formPreview,
  layoutPreview,
  stage,
  windowPreview,
} from './terminology-preview-html'

import type { TerminologyPreviewCatalog } from './terminology-preview-html'

const FORM_PREVIEWS: TerminologyPreviewCatalog = {
  'button': stage('<div class="pv-demo-block"><small>保存修改</small><span class="pv-button">保存</span><span class="pv-caption">点击后执行明确动作</span></div>'),
  'link': stage('<div class="pv-demo-block"><span>查看完整使用说明</span><span class="pv-link">前往帮助中心 ↗</span><span class="pv-caption">链接负责页面跳转</span></div>'),
  'radio': stage('<div class="pv-choice-list"><strong>配送方式</strong><span><b class="pv-radio-on">●</b> 标准配送</span><span><b class="pv-radio-off"></b> 次日送达</span><small>只能选择一项</small></div>'),
  'checkbox': stage('<div class="pv-choice-list"><strong>订阅内容</strong><span><b class="pv-check-on">✓</b> 产品更新</span><span><b class="pv-check-on">✓</b> 每周精选</span><small>可以同时选择多项</small></div>'),
  'switch': stage('<div class="pv-setting"><div class="pv-copy"><strong>消息通知</strong><span>新消息到达时提醒我</span></div><span class="pv-switch-on">已开启</span></div>'),
  'slider': stage('<div class="pv-demo-block"><div class="pv-row"><strong>价格范围</strong><span>¥200 — ¥800</span></div><div class="pv-slider"><span></span><b></b><b></b></div><small>拖动两端调整范围</small></div>'),
  'rate': stage('<div class="pv-demo-block"><strong>这次体验怎么样？</strong><span class="pv-stars">★ ★ ★ ★ ☆</span><small>4 / 5 分</small></div>'),
  'input': formPreview([['邮箱地址', 'name@example.com']], '继续'),
  'textarea': stage('<div class="pv-form"><div class="pv-form-row"><small>问题描述</small><div class="pv-textarea">请详细描述发生了什么……<span>46 / 500</span></div></div><span class="pv-button">提交反馈</span></div>'),
  'input-number': stage('<div class="pv-demo-block"><small>购买数量</small><div class="pv-stepper"><span>−</span><strong>2</strong><span>＋</span></div><span class="pv-caption">只接受数字并可步进</span></div>'),
  'select': stage('<div class="pv-form"><small>项目状态</small><div class="pv-field"><span>进行中</span><strong>⌄</strong></div><div class="pv-option-list"><span>待开始</span><strong>✓ 进行中</strong><span>已完成</span></div></div>'),
  'autocomplete': stage('<div class="pv-form"><small>城市</small><div class="pv-field"><span>杭</span><strong>⌕</strong></div><div class="pv-option-list"><strong>杭州</strong><span>杭州市 · 浙江省</span><span>杭锦旗 · 内蒙古</span></div></div>'),
  'cascader': stage('<div class="pv-cascade"><div><strong>浙江省</strong><span>江苏省</span><span>广东省</span></div><div><strong>杭州市　›</strong><span>宁波市</span><span>温州市</span></div><div><strong>西湖区</strong><span>余杭区</span></div></div>'),
  'tree-select': stage('<div class="pv-tree"><strong>▾ 产品</strong><span class="pv-indent">▾ 设计工具</span><span class="pv-indent-deep">☑ 原型协作</span><span class="pv-indent-deep">☐ 图像处理</span><span class="pv-indent">▸ 开发工具</span></div>'),
  'date-picker': stage('<div class="pv-calendar"><div class="pv-calendar-head"><span>‹</span><strong>2026 年 8 月</strong><span>›</span></div><div class="pv-calendar-grid"><small>一</small><small>二</small><small>三</small><small>四</small><small>五</small><span>24</span><strong>25</strong><span>26</span><span>27</span><span>28</span></div></div>'),
  'time-picker': stage('<div class="pv-time"><div><span>08</span><strong>09</strong><span>10</span></div><b>:</b><div><span>15</span><strong>30</strong><span>45</span></div><span class="pv-button">确定 09:30</span></div>'),
  'color-picker': stage('<div class="pv-color-picker"><div class="pv-color-area"><span></span></div><div class="pv-swatches"><b data-name="red"></b><b data-name="blue"></b><b data-name="green"></b><b data-name="purple"></b></div><strong>#2866DF</strong></div>'),
  'upload': stage('<div class="pv-upload"><span class="pv-upload-icon">↑</span><strong>拖放文件到这里</strong><span>或点击选择 · PNG / PDF · 最大 10 MB</span><div class="pv-upload-file">季度报告.pdf　上传中 68%</div></div>'),
  'form': formPreview([['姓名', '林小满'], ['工作邮箱', 'lin@example.com']], '创建账号'),
  'label': stage('<div class="pv-form"><div class="pv-form-row"><strong>工作邮箱</strong><span class="pv-field">name@company.com</span><small>标签始终说明该填什么</small></div></div>'),
  'placeholder': stage('<div class="pv-form"><div class="pv-form-row"><strong>邮箱</strong><span class="pv-field pv-muted-field">you@example.com</span><small>占位提示不是字段标签</small></div></div>'),
}

const CONTENT_ADDITIONS: TerminologyPreviewCatalog = {
  tree: stage('<div class="pv-tree"><strong>▾ src</strong><span class="pv-indent">▾ components</span><span class="pv-indent-deep">Card.tsx</span><span class="pv-indent-deep">Button.tsx</span><span class="pv-indent">▸ pages</span></div>'),
  segmented: stage('<div class="pv-segmented"><span>日</span><strong>周</strong><span>月</span></div><div class="pv-copy"><strong>本周数据</strong><span>并排选择一种视图</span></div>'),
}

const FEEDBACK_PREVIEWS: TerminologyPreviewCatalog = {
  'alert': stage('<div class="pv-alert"><strong>账户即将到期</strong><span>请在 3 天内续费，以免服务中断。</span><b>立即续费</b></div>'),
  'toast': stage('<div class="pv-page-ghost"><span></span><span></span><span></span></div><div class="pv-toast"><strong>✓ 已保存</strong><span>修改已同步</span></div>'),
  'notification': stage('<div class="pv-notification"><div class="pv-row"><strong>通知中心</strong><span class="pv-badge">3</span></div><div class="pv-list-item"><span class="pv-avatar">邀</span><div class="pv-copy"><strong>你收到项目邀请</strong><span>2 分钟前</span></div></div><div class="pv-list-item"><span class="pv-avatar">评</span><div class="pv-copy"><strong>设计稿有新评论</strong><span>10 分钟前</span></div></div></div>'),
  'modal': stage('<div class="pv-modal-back"><span></span><span></span></div><div class="pv-modal"><strong>删除项目？</strong><span>删除后将无法恢复。</span><div class="pv-row"><span class="pv-node">取消</span><span class="pv-node pv-node-danger">确认删除</span></div></div>'),
  'drawer': stage('<div class="pv-drawer-page"><div class="pv-list"><span class="pv-list-item">项目 Alpha</span><span class="pv-list-item">项目 Beta</span></div><div class="pv-drawer"><strong>项目详情</strong><span>负责人　林小满</span><span>状态　进行中</span><span>截止　8 月 30 日</span></div></div>'),
  'popconfirm': stage('<div class="pv-demo-block"><span class="pv-node pv-node-danger">删除</span><div class="pv-pop"><strong>确定删除？</strong><span>取消　 <b>确定</b></span></div></div>'),
  'popover': stage('<div class="pv-demo-block"><span class="pv-avatar">林</span><div class="pv-pop"><strong>林小满</strong><span>产品设计师</span><small>查看个人主页</small></div></div>'),
  'tooltip': stage('<div class="pv-demo-block"><div class="pv-tooltip">复制链接</div><span class="pv-node">⧉</span><small>悬停图标时解释含义</small></div>'),
  'progress': stage('<div class="pv-demo-block"><div class="pv-row"><strong>正在上传设计稿.zip</strong><span>68%</span></div><div class="pv-progress"><span></span></div><small>14.2 MB / 20.8 MB</small></div>'),
  'skeleton': stage('<div class="pv-skeleton"><span class="pv-skeleton-media"></span><div><b></b><span></span><span></span></div></div>'),
  'result': stage('<div class="pv-result"><span class="pv-result-icon">✓</span><strong>付款成功</strong><span>订单号 #A1024 · ¥299</span><span class="pv-button">查看订单</span></div>'),
  'spinner': stage('<div class="pv-result"><span class="pv-spinner">◌</span><strong>正在生成报告</strong><span>请稍候，不要关闭页面</span></div>'),
  'menu': stage('<div class="pv-menu"><strong>工作台</strong><span class="pv-menu-active">▣ 项目</span><span>◫ 数据</span><span>⚙ 设置</span><small>团队空间</small><span>成员管理</span></div>'),
  'breadcrumb': stage('<div class="pv-breadcrumb"><span>首页</span><b>›</b><span>资源库</span><b>›</b><strong>术语助手</strong></div>'),
  'steps': flowPreview(['填写信息', '确认订单', '完成支付'], 1),
  'dropdown': stage('<div class="pv-demo-block"><span class="pv-node">林小满⌄</span><div class="pv-option-list"><span>个人资料</span><span>账户设置</span><strong>退出登录</strong></div></div>'),
  'anchor': stage('<div class="pv-doc-preview"><div class="pv-copy"><strong>快速开始</strong><span>安装</span><span>配置</span><span>发布</span></div><div class="pv-anchor-list"><strong>本页目录</strong><span>快速开始</span><span class="pv-link">配置</span><span>发布</span></div></div>'),
  'back-top': stage('<div class="pv-long-page"><span></span><span></span><span></span><span></span><span></span></div><div class="pv-back-top">↑<small>顶部</small></div>'),
  'skip-link': stage('<div class="pv-skip-demo"><strong class="pv-skip-link">跳到主要内容</strong><div class="pv-row"><span>Logo</span><span>导航一</span><span>导航二</span></div><div class="pv-pane pv-pane-accent"><strong>主要内容获得焦点</strong></div></div>'),
  'search': stage('<div class="pv-search"><span>⌕</span><strong>设计系统</strong><small>⌘ K</small></div><div class="pv-list"><div class="pv-list-item"><strong>设计系统改版</strong><span>匹配项目</span></div><div class="pv-list-item"><strong>设计令牌清单</strong><span>匹配文档</span></div></div>'),
}

const WEBSITE_SECTION_PREVIEWS: TerminologyPreviewCatalog = {
  'hero': windowPreview('让团队更快交付', '<div class="pv-hero"><div class="pv-copy"><strong>一个页面说清核心价值</strong><span>醒目标题、简短说明和主行动</span></div><span class="pv-button">免费开始</span></div>'),
  'cta': stage('<div class="pv-cta"><small>准备好了吗？</small><strong>今天就完成第一次发布</strong><span class="pv-button">免费试用 14 天</span><span>无需信用卡</span></div>'),
  'user-voice': stage('<div class="pv-quote-card"><strong>“上线两周，处理时间减少了 42%。”</strong><div class="pv-row"><span class="pv-avatar">周</span><span>周宁 · 客服负责人</span></div></div>'),
  'header': layoutPreview('header', '<div class="pv-layout-header"><strong>LOGO</strong><span>产品　价格　案例</span><b>登录</b></div><div class="pv-layout-content">页面正文</div>'),
  'logo': stage('<div class="pv-logo-set"><div><span class="pv-logo-mark">N</span><strong>NORTH</strong><small>桌面横版</small></div><div><span class="pv-logo-mark">N</span><small>移动图标</small></div><div class="pv-logo-dark"><span class="pv-logo-mark">N</span><small>深色反白</small></div></div>'),
  'navbar': layoutPreview('navbar', '<div class="pv-layout-header"><strong>ACME</strong><span>首页　<strong>项目</strong>　团队　设置</span><b>＋ 新建</b></div><div class="pv-active-rule"></div><div class="pv-layout-content">项目列表</div>'),
  'footer': layoutPreview('footer', '<div class="pv-layout-content">页面正文</div><div class="pv-layout-footer"><strong>ACME</strong><span>产品　帮助　隐私</span><small>© 2026</small></div>'),
  'faq': stage('<div class="pv-list"><div class="pv-list-item"><strong>可以随时取消吗？</strong><span>＋</span></div><div class="pv-list-item"><div class="pv-copy"><strong>数据如何迁移？</strong><span>支持 CSV 导入并提供迁移向导。</span></div><span>－</span></div></div>'),
  'pricing': stage('<div class="pv-price"><small>基础版</small><strong>¥49</strong><span>个人使用</span></div><div class="pv-price pv-price-featured"><small>最受欢迎</small><strong>¥99</strong><span>成长团队</span></div><div class="pv-price"><small>企业版</small><strong>询价</strong><span>高级安全</span></div>'),
  'social-proof': stage('<div class="pv-proof"><small>超过 100,000 个团队正在使用</small><div class="pv-row"><strong>NORTH</strong><strong>ORBIT</strong><strong>FRAME</strong><strong>MOSS</strong></div></div>'),
}

const PAGE_LAYOUT_PREVIEWS: TerminologyPreviewCatalog = {
  'top-nav': layoutPreview('top-nav', '<div class="pv-layout-header"><strong>Logo</strong><span>导航　导航　导航</span></div><div class="pv-layout-main"><strong>页面内容</strong><span>顶部导航，下方完整内容区</span></div>'),
  'sidebar': layoutPreview('sidebar', '<div class="pv-layout-side"><strong>菜单</strong><span>概览</span><span>项目</span><span>成员</span></div><div class="pv-layout-main"><strong>控制台</strong><span>右侧主内容区</span></div>'),
  'single-page': layoutPreview('single-page', '<div class="pv-single-page"><strong>01 首屏</strong><span>02 功能</span><span>03 案例</span><span>04 联系</span></div><div class="pv-page-rail"><b></b></div>'),
  'doc-layout': layoutPreview('doc-layout', '<div class="pv-layout-side"><strong>文档导航</strong><span>安装</span><span>配置</span></div><div class="pv-layout-main"><strong>快速开始</strong><span>正文内容……</span></div><div class="pv-layout-toc"><strong>本页目录</strong><span>准备</span><span>下一步</span></div>'),
  'card-grid': layoutPreview('card-grid', '<div class="pv-mini-grid"><span>卡片 1</span><span>卡片 2</span><span>卡片 3</span><span>卡片 4</span><span>卡片 5</span><span>卡片 6</span></div>'),
  'centered-column': layoutPreview('centered-column', '<div class="pv-centered-column"><small>阅读时间 6 分钟</small><strong>如何建立清晰的信息层级</strong><span>内容保持在舒适行宽，两侧留出空间。</span></div>'),
  'masonry': layoutPreview('masonry', '<div class="pv-masonry"><span class="pv-masonry-tall">A</span><span>B</span><span class="pv-masonry-mid">C</span><span>D</span><span class="pv-masonry-tall">E</span></div>'),
  'split-screen': layoutPreview('split-screen', '<div class="pv-split-brand"><strong>BUILD</strong><strong>BETTER</strong><span>品牌介绍</span></div><div class="pv-split-form"><strong>欢迎回来</strong><span class="pv-field">邮箱</span><span class="pv-button">登录</span></div>'),
  'responsive-design': stage('<div class="pv-device-desktop"><div class="pv-mini-grid"><span>1</span><span>2</span><span>3</span></div><small>桌面：3 列</small></div><span class="pv-arrow">→</span><div class="pv-device-mobile"><div class="pv-col"><span>1</span><span>2</span><span>3</span></div><small>手机：1 列</small></div>'),
}

const CSS_LAYOUT_PREVIEWS: TerminologyPreviewCatalog = {
  'space': comparePreview('拥挤', '分组清晰', '所有间距都相同', '组内 8px · 组间 24px'),
  'margin': stage('<div class="pv-spacing-demo"><div class="pv-space-outer">外部区域<div class="pv-space-box">内容块</div><b>margin 24</b></div></div>'),
  'padding': stage('<div class="pv-spacing-demo"><div class="pv-space-box pv-space-padding"><b>padding 20</b><strong>内容不再贴边</strong></div></div>'),
  'flex': stage('<div class="pv-flex-demo"><span>取消</span><span>预览</span><strong>发布</strong></div><small class="pv-caption">同一行 · 垂直居中 · 自动分配</small>'),
  'grid': stage('<div class="pv-grid-demo"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span></div>'),
  'z-index': stage('<div class="pv-layer pv-layer-one">页面 z: 1</div><div class="pv-layer pv-layer-two">浮层 z: 10</div><div class="pv-layer pv-layer-three">弹窗 z: 100</div>'),
  'sticky': stage('<div class="pv-scroll-demo"><div class="pv-sticky-bar">始终停在顶部</div><span></span><span></span><span></span><small>内容滚动</small></div>'),
  'position': stage('<div class="pv-position-card"><strong>项目卡片</strong><span>正文按正常流排列</span><b>NEW</b></div><small class="pv-caption">角标固定在卡片右上角</small>'),
  'centering': stage('<div class="pv-center-demo"><span>水平 + 垂直居中</span></div>'),
  'box-model': stage('<div class="pv-box-margin">MARGIN<div class="pv-box-border">BORDER<div class="pv-box-padding">PADDING<div class="pv-box-content">320 × 80</div></div></div></div>'),
  'overflow': stage('<div class="pv-overflow-box"><strong>卡片内容</strong><span>第一段</span><span>第二段</span><span>第三段</span><b>滚动查看 ↓</b></div><small class="pv-caption">内容超出容器，保留访问方式</small>'),
}

const VISUAL_PREVIEWS: TerminologyPreviewCatalog = {
  'typography': stage('<div class="pv-type-scale"><strong>主标题 32</strong><b>章节标题 20</b><span>正文文字 14，负责舒适阅读。</span><small>辅助信息 11</small></div>'),
  'serif-sans': stage('<div class="pv-font-compare"><div class="pv-font-serif"><strong>有温度的标题</strong><span>Serif / 衬线体</span></div><div class="pv-font-sans"><strong>清晰的正文</strong><span>Sans / 无衬线体</span></div></div>'),
  'text-truncate': stage('<div class="pv-list"><div class="pv-list-item"><strong class="pv-truncate">这是一个特别长特别长的项目标题，容器放不下</strong><span>…</span></div><div class="pv-list-item"><strong>短标题完整显示</strong></div></div>'),
  'divider': stage('<div class="pv-divider-demo"><strong>账户信息</strong><span>姓名　林小满</span><b></b><strong>安全设置</strong><span>两步验证　已开启</span></div>'),
  'border-radius': comparePreview('直角卡片', '圆角卡片', 'border-radius: 0', 'border-radius: 16px'),
  'shadow': stage('<div class="pv-shadow-card"><strong>浮在页面上方</strong><span>阴影表达层级，不是装饰噪声</span></div>'),
  'opacity': stage('<div class="pv-opacity-row"><span data-name="strong">100%</span><span data-name="medium">60%</span><span data-name="soft">30%</span></div><small class="pv-caption">同一元素的视觉强度逐级减弱</small>'),
  'gradient': stage('<div class="pv-gradient-demo"><span></span><b></b><strong>蓝色 → 紫色</strong></div>'),
  'corner-feel': stage('<div class="pv-corners"><span data-name="sharp"><strong>理性</strong><small>0px</small></span><span data-name="soft"><strong>友好</strong><small>12px</small></span><span data-name="round"><strong>活泼</strong><small>999px</small></span></div>'),
  'backdrop-blur': stage('<div class="pv-blur-scene"><div class="pv-blur-content"><strong>滚动内容</strong><span>文章图片与文字</span></div><div class="pv-blur-nav"><strong>半透明导航</strong><span>背后内容被柔化</span></div></div>'),
  'dark-mode': stage('<div class="pv-theme-compare"><div class="pv-theme-light"><strong>Light</strong><span>☀ 文本 / 边界 / 卡片</span></div><div class="pv-theme-dark"><strong>Dark</strong><span>☾ 全部语义颜色同步切换</span></div></div>'),
  'design-token': stage('<div class="pv-token-list"><span><b>color.brand</b> #2866DF</span><span><b>space.md</b> 16px</span><span><b>radius.card</b> 12px</span></div><span class="pv-arrow">→</span><div class="pv-token-card"><strong>统一组件</strong><span>按钮 · 卡片 · 输入框</span></div>'),
  'contrast': stage('<div class="pv-contrast-bad"><span>低对比，难以阅读</span><small>2.1 : 1</small></div><div class="pv-contrast-good"><strong>清楚可读的文字</strong><small>7.4 : 1 ✓</small></div>'),
  'visual-hierarchy': stage('<div class="pv-hierarchy"><small>产品更新 · 8 月 25 日</small><strong>一眼先看到核心结论</strong><span>随后阅读解释与细节，最后发现行动入口。</span><b>查看完整报告 →</b></div>'),
  'transition': stage('<div class="pv-motion-steps"><span>灰色</span><b>25%</b><b>50%</b><b>75%</b><strong>蓝色</strong></div><small class="pv-caption">状态在一段时间内平滑变化</small>'),
  'animation': stage('<div class="pv-motion-frames"><span>↑</span><span>↗</span><span>→</span><span>↘</span><span>↓</span></div><small class="pv-caption">多个关键帧组成连续运动</small>'),
  'easing': stage('<div class="pv-easing"><div><span>线性</span><b>·　·　·　·　·</b></div><div><span>缓入缓出</span><b>··　·　·　··</b></div></div>'),
  'spring': stage('<div class="pv-spring"><span>0</span><b>120</b><b>92</b><b>104</b><strong>100</strong></div><small class="pv-caption">越过目标，再回弹稳定</small>'),
  'fade-in-out': stage('<div class="pv-fade"><span data-name="strong">旧内容</span><span data-name="medium">旧 / 新</span><strong>新内容</strong></div>'),
  'hover': stage('<div class="pv-pointer-demo"><span class="pv-node">默认按钮</span><strong class="pv-node pv-node-accent">悬停按钮 ↖</strong></div><small class="pv-caption">鼠标经过时提供可点击反馈</small>'),
  'active': stage('<div class="pv-pointer-demo"><span class="pv-button">默认高度</span><strong class="pv-pressed">按下 2px</strong></div>'),
  'focus': stage('<div class="pv-form"><span class="pv-field">普通输入框</span><strong class="pv-focus-field">键盘焦点清晰可见</strong><small>按 Tab 移动到这里</small></div>'),
  'drag': stage('<div class="pv-drag-list"><span>⋮⋮　需求评审</span><strong>⋮⋮　视觉设计　↕</strong><span>⋮⋮　开发验收</span></div>'),
  'disabled': stage('<div class="pv-pointer-demo"><span class="pv-button">可以提交</span><strong class="pv-disabled-button">信息未完整，暂不可提交</strong></div>'),
  'cursor': stage('<div class="pv-cursor-demo"><span>普通文字　↖</span><strong class="pv-link">可点击链接　☝</strong><small>指针形状表达交互能力</small></div>'),
  'selection': stage('<div class="pv-selection-demo">拖动鼠标后，<strong>这段文字被品牌色高亮</strong>，方便复制。</div>'),
}

export const TERMINOLOGY_UI_PREVIEWS: TerminologyPreviewCatalog = {
  ...FORM_PREVIEWS,
  ...CONTENT_ADDITIONS,
  ...FEEDBACK_PREVIEWS,
  ...WEBSITE_SECTION_PREVIEWS,
  ...PAGE_LAYOUT_PREVIEWS,
  ...CSS_LAYOUT_PREVIEWS,
  ...VISUAL_PREVIEWS,
}

export const UI_PREVIEW_TERM_IDS = Object.freeze(Object.keys(TERMINOLOGY_UI_PREVIEWS))
