import { stage } from './terminology-preview-html'

import type { TerminologyPreviewCatalog } from './terminology-preview-html'

function styleStage(name: string, content: string) {
  return stage(`<div class="pv-style" data-name="${name}">${content}</div>`, name)
}

export const TERMINOLOGY_STYLE_PREVIEWS: TerminologyPreviewCatalog = {
  'minimalism': styleStage('minimalism', '<div class="pv-style-copy"><small>LESS, BUT BETTER</small><strong>专注一件事</strong><span>充足留白 · 克制层级</span></div><span class="pv-style-action">继续</span>'),
  'apple-hig': styleStage('apple-hig', '<div class="pv-app-shell"><div class="pv-app-nav"><strong>今天</strong><span>•••</span></div><div class="pv-app-card"><span class="pv-style-orb"></span><div class="pv-copy"><strong>专注模式</strong><span>清晰、熟悉、易操作</span></div><span class="pv-switch-on">开启</span></div></div>'),
  'notion-style': styleStage('notion-style', '<div class="pv-doc-side"><span>⌂ 工作区</span><strong>▾ 项目</strong><span>　◻ 需求</span><span>　◻ 计划</span></div><div class="pv-doc-page"><small>PROJECT WIKI</small><strong>产品发布计划</strong><span>☑ 确认范围</span><span>☐ 完成测试</span></div>'),
  'bento-grid': styleStage('bento-grid', '<div class="pv-bento"><div class="pv-bento-wide"><small>本周增长</small><strong>+24%</strong></div><div><small>用户</small><strong>8.6K</strong></div><div><small>任务</small><strong>18</strong></div></div>'),
  'glassmorphism': styleStage('glassmorphism', '<div class="pv-glass-orb pv-glass-left"></div><div class="pv-glass-card"><small>NOW PLAYING</small><strong>Night Drive</strong><span>03:18 ━━━━━ 04:02</span></div><div class="pv-glass-orb pv-glass-right"></div>'),
  'neo-brutalism': styleStage('neo-brutalism', '<div class="pv-brutal-card"><small>NEW DROP</small><strong>拒绝无聊</strong><span>粗边框、硬阴影、高反差</span><span class="pv-brutal-button">马上看看 ↗</span></div>'),
  'swiss-style': styleStage('swiss-style', '<div class="pv-swiss-index">01</div><div class="pv-swiss-copy"><strong>清晰胜过装饰</strong><span>严格网格 / 无衬线 / 非对称编排</span></div><div class="pv-swiss-mark"></div>'),
  'editorial': styleStage('editorial', '<div class="pv-editorial-head"><small>THE WEEKLY REVIEW · 08</small><strong>设计如何塑造信任</strong></div><div class="pv-editorial-columns"><span>从标题、引言到正文，阅读节奏像杂志一样被精心安排。</span><span>图文比例与留白共同建立叙事。</span></div>'),
  'skeuomorphism': styleStage('skeuomorphism', '<div class="pv-device"><small>VOLUME</small><div class="pv-dial">72</div><div class="pv-device-track"><span></span></div><strong>实体旋钮般的反馈</strong></div>'),
  'flat-design': styleStage('flat-design', '<div class="pv-flat-icon">✓</div><div class="pv-style-copy"><strong>任务完成</strong><span>纯色块 · 清楚图标 · 无材质装饰</span></div><span class="pv-flat-button">知道了</span>'),
  'material-design': styleStage('material-design', '<div class="pv-material-card"><small>MONDAY, AUG 25</small><strong>团队日程</strong><span>10:00　设计评审</span><span>14:30　版本发布</span></div><span class="pv-fab">＋</span>'),
  'neumorphism': styleStage('neumorphism', '<div class="pv-neu-panel"><span class="pv-neu-button">◀</span><div class="pv-copy"><strong>Ambient Mix</strong><span>柔和同色阴影塑造凹凸</span></div><span class="pv-neu-button">▶</span></div>'),
  'saas-marketing': styleStage('saas-marketing', '<div class="pv-saas-hero"><small>WORKFLOW OS</small><strong>把一周工作压缩成一天</strong><span>自动汇总、分派并追踪每项任务</span><span class="pv-button">免费开始</span></div><div class="pv-saas-proof"><strong>32%</strong><span>更快交付</span></div>'),
  'b2b-corporate': styleStage('b2b-corporate', '<div class="pv-corporate"><div class="pv-corp-nav"><strong>NORTHSTAR</strong><span>解决方案　案例　服务</span></div><div class="pv-corp-body"><strong>可核验的企业级交付</strong><span>99.99% 可用性　|　24/7 支持</span><div class="pv-row"><span class="pv-node">安全审计</span><span class="pv-node">客户案例</span></div></div></div>'),
  'dtc-ecommerce': styleStage('dtc-ecommerce', '<div class="pv-product-photo">COAST / 01</div><div class="pv-product-detail"><small>夏日限定</small><strong>轻量旅行包</strong><span>¥ 499　★★★★★</span><span class="pv-style-action">加入购物袋</span></div>'),
  'dark-ui': styleStage('dark-ui', '<div class="pv-dark-panel"><div class="pv-dark-nav"><strong>CONTROL</strong><span>LIVE</span></div><div class="pv-dark-chart"><span>72%</span><div class="pv-dark-bars"><b></b><b></b><b></b><b></b></div></div><small>暗色表面 + 高亮数据焦点</small></div>'),
  'playful-illustration': styleStage('playful-illustration', '<div class="pv-play-character"><span class="pv-ear">•</span><strong>◡</strong><span class="pv-ear">•</span></div><div class="pv-play-copy"><strong>今天也完成啦！</strong><span>角色、手绘形状与活泼色彩</span><span class="pv-play-pill">领取奖励 ★</span></div>'),
  'organic-design': styleStage('organic-design', '<div class="pv-leaf pv-leaf-one">芽</div><div class="pv-organic-copy"><small>GROWN WITH CARE</small><strong>让自然进入日常</strong><span>大地色 · 流动曲线 · 真实质感</span></div><div class="pv-leaf pv-leaf-two">叶</div>'),
  'y2k': styleStage('y2k', '<div class="pv-y2k-star">✦</div><div class="pv-y2k-window"><small>WELCOME_2_THE_FUTURE</small><strong>CYBER CLUB</strong><span>ONLINE / 2000</span><span class="pv-y2k-button">ENTER.exe</span></div><div class="pv-y2k-star">✧</div>'),
  'memphis': styleStage('memphis', '<div class="pv-memphis-shape pv-memphis-circle"></div><div class="pv-memphis-copy"><small>MAKE IT</small><strong>LOUD &amp; JOYFUL</strong><span>几何形、波浪线与跳跃节奏</span></div><div class="pv-memphis-shape pv-memphis-square"></div>'),
  'terminal-aesthetic': styleStage('terminal-aesthetic', '<div class="pv-terminal"><div class="pv-terminal-bar"><span>● ● ●</span><strong>deploy.sh</strong></div><span>$ pnpm build</span><span>✓ compiled successfully</span><span>$ deploy --production_</span></div>'),
  'wabi-sabi': styleStage('wabi-sabi', '<div class="pv-wabi-mark">○</div><div class="pv-wabi-copy"><small>一 期 一 会</small><strong>不完美，也完整</strong><span>自然材料、留白与时间痕迹</span></div><div class="pv-wabi-line"></div>'),
  'bauhaus': styleStage('bauhaus', '<div class="pv-bauhaus"><div class="pv-bauhaus-circle"></div><div class="pv-bauhaus-square"></div><div class="pv-bauhaus-bar"></div></div><div class="pv-bauhaus-copy"><strong>FORM</strong><strong>FOLLOWS</strong><strong>FUNCTION</strong><small>基本几何 · 原色 · 功能主义</small></div>'),
  'art-deco': styleStage('art-deco', '<div class="pv-deco-lines"><span></span><b>✦</b><span></span></div><div class="pv-deco-copy"><small>GRAND OPENING</small><strong>THE AURELIA</strong><span>对称 · 金色线条 · 几何秩序</span></div><div class="pv-deco-lines"><span></span><b>◆</b><span></span></div>'),
}
