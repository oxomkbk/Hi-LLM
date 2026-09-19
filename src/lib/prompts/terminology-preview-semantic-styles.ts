export const TERMINOLOGY_SEMANTIC_PREVIEW_CSS = `.preview-root .pv-demo-block{display:flex;width:100%;max-width:330px;flex-direction:column;gap:8px;align-items:center;justify-content:center;padding:12px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:12px}
.preview-root .pv-link{color:var(--preview-accent);font-weight:700;text-decoration:underline}
.preview-root .pv-choice-list{display:flex;width:230px;flex-direction:column;gap:8px;padding:12px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:12px}
.preview-root .pv-choice-list > span{display:flex;gap:8px;align-items:center;color:var(--preview-text);font-size:11px}
.preview-root .pv-radio-on{display:inline-flex;width:17px;height:17px;align-items:center;justify-content:center;color:var(--preview-accent);border:1px solid var(--preview-accent);border-radius:999px;font-size:9px}
.preview-root .pv-radio-off{display:inline-flex;width:17px;height:17px;border:1px solid var(--preview-border);border-radius:999px}
.preview-root .pv-check-on{display:inline-flex;width:17px;height:17px;align-items:center;justify-content:center;color:var(--preview-surface);background-color:var(--preview-accent);border-radius:4px;font-size:10px}
.preview-root .pv-setting{display:flex;width:100%;max-width:310px;gap:12px;align-items:center;justify-content:space-between;padding:11px 12px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:11px}
.preview-root .pv-switch-on{display:inline-flex;min-width:54px;height:26px;align-items:center;justify-content:center;padding:4px 9px;color:var(--preview-surface);background-color:var(--preview-success);border-radius:999px;font-size:9px;font-weight:700}
.preview-root .pv-switch-off{display:inline-flex;min-width:54px;height:26px;align-items:center;justify-content:center;padding:4px 9px;color:var(--preview-muted);background-color:var(--preview-bg);border:1px solid var(--preview-border);border-radius:999px;font-size:9px;font-weight:700}
.preview-root .pv-slider{display:flex;width:230px;height:8px;align-items:center;background-color:var(--preview-border);border-radius:999px}
.preview-root .pv-slider > span{display:block;width:62%;height:8px;background-color:var(--preview-accent);border-radius:999px}
.preview-root .pv-slider > b{display:block;width:18px;height:18px;margin-left:-4px;background-color:var(--preview-surface);border:3px solid var(--preview-accent);border-radius:999px}
.preview-root .pv-stars{color:var(--preview-warning);font-size:22px;letter-spacing:3px}
.preview-root .pv-form{display:flex;width:100%;max-width:300px;flex-direction:column;gap:8px;padding:12px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:12px}
.preview-root .pv-form-row{display:flex;flex-direction:column;gap:4px}
.preview-root .pv-textarea{display:flex;min-height:62px;flex-direction:column;justify-content:space-between;padding:9px;color:var(--preview-muted);background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:8px;font-size:10px}
.preview-root .pv-textarea > span{text-align:right}
.preview-root .pv-stepper{display:grid;width:140px;grid-template-columns:1fr 1fr 1fr;align-items:center;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:9px;text-align:center}
.preview-root .pv-stepper > span{padding:8px;color:var(--preview-accent);background-color:var(--preview-accent-soft);font-weight:700}
.preview-root .pv-option-list{display:flex;min-width:190px;flex-direction:column;gap:6px;padding:8px;color:var(--preview-text);background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:9px;box-shadow:0px 8px 24px 0px var(--preview-shadow);font-size:10px}
.preview-root .pv-option-list > strong{color:var(--preview-accent)}
.preview-root .pv-cascade{display:grid;width:100%;max-width:330px;grid-template-columns:1fr 1fr 1fr;overflow:hidden;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px}
.preview-root .pv-cascade > div{display:flex;min-height:108px;flex-direction:column;gap:8px;padding:10px;border-right:1px solid var(--preview-border);font-size:9px}
.preview-root .pv-calendar{display:flex;width:250px;flex-direction:column;gap:8px;padding:10px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:12px}
.preview-root .pv-calendar-head{display:flex;align-items:center;justify-content:space-between}
.preview-root .pv-calendar-grid{display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:5px;text-align:center}
.preview-root .pv-calendar-grid > strong{padding:5px;color:var(--preview-surface);background-color:var(--preview-accent);border-radius:999px}
.preview-root .pv-calendar-grid > span{padding:5px}
.preview-root .pv-time{display:flex;gap:10px;align-items:center;padding:12px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:12px}
.preview-root .pv-time > div{display:flex;width:46px;flex-direction:column;gap:5px;text-align:center}
.preview-root .pv-time > div > strong{padding:5px;color:var(--preview-surface);background-color:var(--preview-accent);border-radius:7px}
.preview-root .pv-color-picker{display:flex;width:250px;gap:9px;align-items:center;padding:10px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:12px}
.preview-root .pv-color-area{display:flex;width:76px;height:76px;align-items:flex-end;justify-content:flex-end;padding:8px;background-color:var(--preview-blue);border-radius:9px}
.preview-root .pv-color-area > span{display:block;width:14px;height:14px;background-color:var(--preview-surface);border:3px solid var(--preview-text);border-radius:999px}
.preview-root .pv-swatches{display:grid;grid-template-columns:1fr 1fr;gap:5px}
.preview-root .pv-swatches > b{display:block;width:22px;height:22px;border:1px solid var(--preview-border);border-radius:6px}
.preview-root .pv-swatches [data-name="red"]{background-color:var(--preview-red)}
.preview-root .pv-swatches [data-name="blue"]{background-color:var(--preview-blue)}
.preview-root .pv-swatches [data-name="green"]{background-color:var(--preview-earth)}
.preview-root .pv-swatches [data-name="purple"]{background-color:var(--preview-purple)}
.preview-root .pv-upload{display:flex;width:280px;min-height:120px;flex-direction:column;gap:5px;align-items:center;justify-content:center;padding:12px;background-color:var(--preview-surface);border:2px dashed var(--preview-accent);border-radius:12px;text-align:center}
.preview-root .pv-upload-icon{display:flex;width:32px;height:32px;align-items:center;justify-content:center;color:var(--preview-accent);background-color:var(--preview-accent-soft);border-radius:999px;font-size:18px}
.preview-root .pv-upload-file{padding:6px;color:var(--preview-success);background-color:var(--preview-bg);border-radius:7px;font-size:9px}
.preview-root .pv-muted-field{color:var(--preview-muted);font-style:italic}
.preview-root .pv-segmented{display:flex;padding:4px;background-color:var(--preview-bg);border:1px solid var(--preview-border);border-radius:10px}
.preview-root .pv-segmented > span{padding:7px 14px;color:var(--preview-muted)}
.preview-root .pv-segmented > strong{padding:7px 14px;background-color:var(--preview-surface);border-radius:7px;box-shadow:0px 4px 10px 0px var(--preview-shadow)}
.preview-root .pv-alert{display:flex;width:100%;max-width:330px;gap:8px;align-items:center;padding:11px;color:var(--preview-warning);background-color:var(--preview-surface);border:1px solid var(--preview-warning);border-radius:10px}
.preview-root .pv-alert > span{flex:1;color:var(--preview-text);font-size:10px}
.preview-root .pv-page-ghost{display:flex;width:250px;flex-direction:column;gap:8px}
.preview-root .pv-page-ghost > span{display:block;width:100%;height:22px;background-color:var(--preview-border);border-radius:7px}
.preview-root .pv-toast{display:flex;min-width:130px;flex-direction:column;gap:3px;padding:10px;color:var(--preview-success);background-color:var(--preview-surface);border:1px solid var(--preview-success);border-radius:10px;box-shadow:0px 8px 24px 0px var(--preview-shadow)}
.preview-root .pv-notification{display:flex;width:280px;flex-direction:column;overflow:hidden;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:12px}
.preview-root .pv-notification > .pv-row{padding:9px}
.preview-root .pv-modal-back{display:grid;width:300px;height:120px;grid-template-columns:1fr 1fr;gap:8px;padding:12px;background-color:var(--preview-border);border-radius:11px}
.preview-root .pv-modal-back > span{background-color:var(--preview-muted);border-radius:8px}
.preview-root .pv-modal{display:flex;width:205px;flex-direction:column;gap:8px;padding:13px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:12px;box-shadow:0px 12px 28px 0px var(--preview-shadow)}
.preview-root .pv-drawer-page{display:grid;width:330px;height:130px;grid-template-columns:1fr 1fr;overflow:hidden;background-color:var(--preview-bg);border:1px solid var(--preview-border);border-radius:11px}
.preview-root .pv-drawer{display:flex;flex-direction:column;gap:9px;padding:12px;background-color:var(--preview-surface);border-left:1px solid var(--preview-border);box-shadow:-8px 0px 20px 0px var(--preview-shadow);font-size:10px}
.preview-root .pv-pop{display:flex;min-width:150px;flex-direction:column;gap:6px;padding:9px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:9px;box-shadow:0px 8px 18px 0px var(--preview-shadow);font-size:10px}
.preview-root .pv-tooltip{padding:6px 9px;color:var(--preview-dark-text);background-color:var(--preview-dark-bg);border-radius:6px;font-size:9px}
.preview-root .pv-progress{display:flex;width:240px;height:8px;overflow:hidden;background-color:var(--preview-border);border-radius:999px}
.preview-root .pv-progress > span{display:block;width:68%;background-color:var(--preview-accent);border-radius:999px}
.preview-root .pv-skeleton{display:flex;width:280px;gap:12px;padding:12px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:12px}
.preview-root .pv-skeleton-media{display:block;width:82px;height:78px;background-color:var(--preview-border);border-radius:9px}
.preview-root .pv-skeleton > div{display:flex;flex:1;flex-direction:column;gap:9px}
.preview-root .pv-skeleton > div > b{display:block;width:75%;height:13px;background-color:var(--preview-border);border-radius:999px}
.preview-root .pv-skeleton > div > span{display:block;width:100%;height:9px;background-color:var(--preview-bg);border-radius:999px}
.preview-root .pv-result{display:flex;flex-direction:column;gap:7px;align-items:center;text-align:center}
.preview-root .pv-result-icon{display:flex;width:46px;height:46px;align-items:center;justify-content:center;color:var(--preview-surface);background-color:var(--preview-success);border-radius:999px;font-size:22px}
.preview-root .pv-spinner{display:flex;width:46px;height:46px;align-items:center;justify-content:center;color:var(--preview-accent);border:4px dashed var(--preview-accent);border-radius:999px;font-size:22px;transform:rotate(28deg)}
.preview-root .pv-menu{display:flex;width:190px;flex-direction:column;gap:7px;padding:11px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:11px;font-size:10px}
.preview-root .pv-menu-active{padding:7px;color:var(--preview-accent);background-color:var(--preview-accent-soft);border-radius:7px;font-weight:700}
.preview-root .pv-breadcrumb{display:flex;gap:9px;align-items:center;padding:10px 13px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:9px;font-size:10px}
.preview-root .pv-doc-preview{display:grid;width:300px;grid-template-columns:2fr 1fr;gap:15px;padding:12px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:11px}
.preview-root .pv-anchor-list{display:flex;flex-direction:column;gap:6px;padding-left:9px;border-left:2px solid var(--preview-border);font-size:9px}
.preview-root .pv-long-page{display:flex;width:230px;height:124px;flex-direction:column;gap:8px;padding:10px;overflow:hidden;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px}
.preview-root .pv-long-page > span{display:block;width:100%;min-height:22px;background-color:var(--preview-border);border-radius:5px}
.preview-root .pv-back-top{display:flex;width:44px;height:44px;flex-direction:column;align-items:center;justify-content:center;color:var(--preview-surface);background-color:var(--preview-accent);border-radius:999px;font-weight:700}
.preview-root .pv-skip-demo{display:flex;width:300px;flex-direction:column;gap:9px}
.preview-root .pv-skip-link{align-self:flex-start;padding:6px;color:var(--preview-accent);background-color:var(--preview-surface);border:3px solid var(--preview-accent);border-radius:6px}
.preview-root .pv-search{display:flex;width:290px;gap:8px;align-items:center;padding:10px;background-color:var(--preview-surface);border:2px solid var(--preview-accent);border-radius:9px}
.preview-root .pv-search > strong{flex:1}
.preview-root .pv-hero{display:flex;width:100%;gap:12px;align-items:center}
.preview-root .pv-cta{display:flex;width:300px;flex-direction:column;gap:8px;align-items:center;padding:16px;color:var(--preview-dark-text);background-color:var(--preview-dark-bg);border-radius:14px;text-align:center}
.preview-root .pv-quote-card{display:flex;width:290px;flex-direction:column;gap:12px;padding:16px;background-color:var(--preview-surface);border-left:4px solid var(--preview-accent);border-radius:8px;box-shadow:0px 8px 22px 0px var(--preview-shadow)}
.preview-root .pv-layout{display:grid;width:330px;height:128px;overflow:hidden;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:11px}
.preview-root .pv-layout-header{display:flex;grid-column:1 / span 3;gap:12px;align-items:center;justify-content:space-between;padding:9px;background-color:var(--preview-surface);border-bottom:1px solid var(--preview-border);font-size:9px}
.preview-root .pv-layout-content{display:flex;align-items:center;justify-content:center;padding:10px;color:var(--preview-muted);background-color:var(--preview-bg);font-size:10px}
.preview-root .pv-layout-footer{display:flex;grid-column:1 / span 3;gap:12px;align-items:center;justify-content:space-between;padding:10px;color:var(--preview-dark-text);background-color:var(--preview-dark-bg);font-size:9px}
.preview-root .pv-logo-set{display:flex;gap:10px;align-items:center}
.preview-root .pv-logo-set > div{display:flex;min-width:82px;flex-direction:column;gap:5px;align-items:center;padding:9px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px}
.preview-root .pv-logo-mark{display:flex;width:30px;height:30px;align-items:center;justify-content:center;color:var(--preview-surface);background-color:var(--preview-accent);border-radius:9px;font-weight:800}
.preview-root .pv-logo-dark{color:var(--preview-dark-text);background-color:var(--preview-dark-bg)}
.preview-root .pv-active-rule{height:4px;background-color:var(--preview-accent)}
.preview-root .pv-price{display:flex;width:94px;flex-direction:column;gap:6px;padding:11px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px;text-align:center}
.preview-root .pv-price-featured{color:var(--preview-accent);background-color:var(--preview-accent-soft);border:3px solid var(--preview-accent);transform:scale(1.06)}
.preview-root .pv-proof{display:flex;flex-direction:column;gap:14px;align-items:center}
.preview-root .pv-proof > .pv-row > strong{padding:7px;color:var(--preview-muted);border:1px solid var(--preview-border);font-size:9px}
.preview-root .pv-layout-main{display:flex;flex:1;flex-direction:column;gap:6px;align-items:center;justify-content:center;padding:12px;background-color:var(--preview-bg)}
.preview-root .pv-layout-side{display:flex;min-width:82px;flex-direction:column;gap:7px;padding:9px;color:var(--preview-dark-text);background-color:var(--preview-dark-surface);font-size:9px}
.preview-root .pv-layout-toc{display:flex;min-width:72px;flex-direction:column;gap:7px;padding:9px;border-left:1px solid var(--preview-border);font-size:8px}
.preview-root .pv-single-page{display:flex;flex:1;flex-direction:column;gap:9px;justify-content:center;padding:14px}
.preview-root .pv-page-rail{display:flex;width:16px;align-items:flex-start;justify-content:center;padding-top:12px;background-color:var(--preview-bg)}
.preview-root .pv-page-rail > b{display:block;width:5px;height:44px;background-color:var(--preview-accent);border-radius:999px}
.preview-root .pv-mini-grid{display:grid;width:100%;grid-template-columns:1fr 1fr 1fr;gap:6px;padding:8px}
.preview-root .pv-mini-grid > span{display:flex;min-height:45px;align-items:center;justify-content:center;background-color:var(--preview-accent-soft);border:1px solid var(--preview-border);border-radius:7px;font-size:9px}
.preview-root .pv-centered-column{display:flex;width:58%;flex-direction:column;gap:9px;justify-content:center;margin-left:auto;margin-right:auto;padding:12px}
.preview-root .pv-masonry{display:grid;width:100%;grid-template-columns:1fr 1fr 1fr;gap:6px;padding:8px;align-items:start}
.preview-root .pv-masonry > span{display:flex;min-height:34px;align-items:center;justify-content:center;background-color:var(--preview-accent-soft);border-radius:7px}
.preview-root .pv-masonry-tall{height:92px}
.preview-root .pv-masonry-mid{height:62px}
.preview-root .pv-split-brand{display:flex;flex:1;flex-direction:column;justify-content:center;padding:18px;color:var(--preview-dark-text);background-color:var(--preview-dark-bg)}
.preview-root .pv-split-form{display:flex;flex:1;flex-direction:column;gap:8px;justify-content:center;padding:14px}
.preview-root .pv-device-desktop{display:flex;width:220px;flex-direction:column;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px;text-align:center}
.preview-root .pv-device-mobile{display:flex;width:82px;flex-direction:column;padding:6px;background-color:var(--preview-surface);border:3px solid var(--preview-text);border-radius:12px;text-align:center}
.preview-root .pv-device-mobile .pv-col > span{padding:4px;background-color:var(--preview-accent-soft);border-radius:4px}
.preview-root .pv-compare{display:flex;width:100%;gap:10px;align-items:center;justify-content:center}
.preview-root .pv-pane{display:flex;min-width:112px;flex-direction:column;gap:5px;padding:10px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:9px;font-size:9px}
.preview-root .pv-pane-accent{color:var(--preview-accent);background-color:var(--preview-accent-soft);border-color:var(--preview-accent)}
.preview-root .pv-spacing-demo{display:flex;padding:16px;background-color:var(--preview-bg);border:1px dashed var(--preview-border)}
.preview-root .pv-space-outer{display:flex;flex-direction:column;gap:8px;padding:20px;color:var(--preview-muted);background-color:var(--preview-accent-soft);border:1px dashed var(--preview-accent);font-size:9px}
.preview-root .pv-space-box{display:flex;min-width:160px;min-height:62px;align-items:center;justify-content:center;color:var(--preview-text);background-color:var(--preview-surface);border:2px solid var(--preview-border)}
.preview-root .pv-space-padding{flex-direction:column;gap:6px;padding:20px}
.preview-root .pv-flex-demo{display:flex;width:280px;gap:12px;align-items:center;justify-content:space-between;padding:10px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px}
.preview-root .pv-flex-demo > strong{padding:7px;color:var(--preview-surface);background-color:var(--preview-accent);border-radius:7px}
.preview-root .pv-grid-demo{display:grid;width:280px;grid-template-columns:1fr 1fr 1fr;gap:8px}
.preview-root .pv-grid-demo > span{display:flex;min-height:48px;align-items:center;justify-content:center;background-color:var(--preview-accent-soft);border:1px solid var(--preview-accent);border-radius:7px}
.preview-root .pv-layer{display:flex;width:150px;height:72px;align-items:center;justify-content:center;border:2px solid var(--preview-border);border-radius:9px;font-size:9px}
.preview-root .pv-layer-one{background-color:var(--preview-bg);transform:translateX(35px)}
.preview-root .pv-layer-two{color:var(--preview-accent);background-color:var(--preview-accent-soft);border-color:var(--preview-accent);transform:translateY(14px)}
.preview-root .pv-layer-three{color:var(--preview-surface);background-color:var(--preview-danger);border-color:var(--preview-danger);transform:translateX(-35px)}
.preview-root .pv-scroll-demo{display:flex;width:260px;height:120px;flex-direction:column;gap:8px;padding:8px;overflow:hidden;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px}
.preview-root .pv-sticky-bar{padding:7px;color:var(--preview-surface);background-color:var(--preview-accent);border-radius:6px;text-align:center}
.preview-root .pv-scroll-demo > span{display:block;min-height:24px;background-color:var(--preview-border);border-radius:5px}
.preview-root .pv-position-card{display:flex;width:220px;min-height:100px;flex-direction:column;gap:8px;padding:18px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px}
.preview-root .pv-position-card > b{align-self:flex-end;margin-top:-58px;margin-right:-28px;padding:5px;color:var(--preview-surface);background-color:var(--preview-danger);border-radius:999px;font-size:8px}
.preview-root .pv-center-demo{display:flex;width:260px;height:120px;align-items:center;justify-content:center;background-color:var(--preview-bg);border:2px dashed var(--preview-border)}
.preview-root .pv-center-demo > span{padding:10px;color:var(--preview-accent);background-color:var(--preview-surface);border:2px solid var(--preview-accent);border-radius:8px}
.preview-root .pv-box-margin{padding:7px;color:var(--preview-warning);background-color:var(--preview-sand);font-size:8px;text-align:center}
.preview-root .pv-box-border{padding:7px;color:var(--preview-text);background-color:var(--preview-border)}
.preview-root .pv-box-padding{padding:14px;color:var(--preview-accent);background-color:var(--preview-accent-soft)}
.preview-root .pv-box-content{padding:14px;color:var(--preview-surface);background-color:var(--preview-accent)}
.preview-root .pv-overflow-box{display:flex;width:190px;height:104px;flex-direction:column;gap:7px;padding:10px;overflow:hidden;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:9px}
.preview-root .pv-overflow-box > b{padding:5px;color:var(--preview-accent);background-color:var(--preview-accent-soft);text-align:center}
.preview-root .pv-type-scale{display:flex;width:290px;flex-direction:column;gap:8px;padding:12px;background-color:var(--preview-surface);border-left:4px solid var(--preview-accent)}
.preview-root .pv-type-scale > strong{font-size:24px;line-height:1.1}
.preview-root .pv-type-scale > b{font-size:16px}
.preview-root .pv-font-compare{display:grid;width:300px;grid-template-columns:1fr 1fr;gap:10px}
.preview-root .pv-font-serif{display:flex;flex-direction:column;gap:8px;padding:13px;background-color:var(--preview-paper);border:1px solid var(--preview-border);font-family:var(--preview-font)}
.preview-root .pv-font-serif > strong{font-size:18px;font-style:italic}
.preview-root .pv-font-sans{display:flex;flex-direction:column;gap:8px;padding:13px;background-color:var(--preview-surface);border:1px solid var(--preview-border)}
.preview-root .pv-truncate{max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.preview-root .pv-divider-demo{display:flex;width:250px;flex-direction:column;gap:8px;padding:12px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px}
.preview-root .pv-divider-demo > b{height:1px;background-color:var(--preview-border)}
.preview-root .pv-shadow-card{display:flex;width:220px;flex-direction:column;gap:7px;padding:18px;background-color:var(--preview-surface);border-radius:13px;box-shadow:0px 14px 28px 0px var(--preview-shadow)}
.preview-root .pv-opacity-row{display:flex;gap:10px}
.preview-root .pv-opacity-row > span{display:flex;width:72px;height:72px;align-items:center;justify-content:center;color:var(--preview-dark-text);background-color:var(--preview-accent);border-radius:9px}
.preview-root .pv-opacity-row [data-name="medium"]{color:var(--preview-accent);background-color:var(--preview-accent-soft)}
.preview-root .pv-opacity-row [data-name="soft"]{color:var(--preview-muted);background-color:var(--preview-bg)}
.preview-root .pv-gradient-demo{display:flex;width:280px;height:100px;overflow:hidden;border-radius:14px}
.preview-root .pv-gradient-demo > span{flex:1;background-color:var(--preview-blue)}
.preview-root .pv-gradient-demo > b{flex:1;background-color:var(--preview-purple)}
.preview-root .pv-gradient-demo > strong{align-self:center;margin-left:-60px;color:var(--preview-dark-text);font-size:18px}
.preview-root .pv-corners{display:flex;gap:10px}
.preview-root .pv-corners > span{display:flex;width:82px;height:72px;flex-direction:column;gap:4px;align-items:center;justify-content:center;color:var(--preview-dark-text);background-color:var(--preview-accent);text-align:center}
.preview-root .pv-corners [data-name="soft"]{border-radius:12px}
.preview-root .pv-corners [data-name="round"]{border-radius:999px}
.preview-root .pv-blur-scene{display:flex;width:290px;height:115px;flex-direction:column;gap:7px;padding:9px;background-color:var(--preview-accent-soft);border-radius:12px}
.preview-root .pv-blur-content{display:flex;flex:1;gap:20px;align-items:center;justify-content:center;color:var(--preview-muted)}
.preview-root .pv-blur-nav{display:flex;gap:20px;align-items:center;justify-content:space-between;padding:9px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:9px;box-shadow:0px 5px 15px 0px var(--preview-shadow)}
.preview-root .pv-theme-compare{display:grid;width:290px;grid-template-columns:1fr 1fr;overflow:hidden;border:1px solid var(--preview-border);border-radius:12px}
.preview-root .pv-theme-light{display:flex;min-height:100px;flex-direction:column;gap:8px;justify-content:center;padding:14px;color:var(--preview-ink);background-color:var(--preview-paper)}
.preview-root .pv-theme-dark{display:flex;min-height:100px;flex-direction:column;gap:8px;justify-content:center;padding:14px;color:var(--preview-dark-text);background-color:var(--preview-dark-bg)}
.preview-root .pv-token-list{display:flex;flex-direction:column;gap:7px;padding:10px;background-color:var(--preview-bg);border:1px solid var(--preview-border);border-radius:9px;font-family:var(--preview-mono);font-size:9px}
.preview-root .pv-token-card{display:flex;flex-direction:column;gap:6px;padding:14px;color:var(--preview-accent);background-color:var(--preview-accent-soft);border:1px solid var(--preview-accent);border-radius:12px}
.preview-root .pv-contrast-bad{display:flex;width:135px;min-height:80px;flex-direction:column;gap:7px;justify-content:center;padding:10px;color:var(--preview-muted);background-color:var(--preview-bg);border-radius:9px}
.preview-root .pv-contrast-good{display:flex;width:135px;min-height:80px;flex-direction:column;gap:7px;justify-content:center;padding:10px;color:var(--preview-dark-text);background-color:var(--preview-dark-bg);border-radius:9px}
.preview-root .pv-hierarchy{display:flex;width:290px;flex-direction:column;gap:7px;padding:12px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px}
.preview-root .pv-hierarchy > strong{font-size:20px}
.preview-root .pv-hierarchy > b{color:var(--preview-accent)}
.preview-root .pv-motion-steps{display:flex;gap:8px;align-items:center}
.preview-root .pv-motion-steps > span{padding:8px;color:var(--preview-muted);background-color:var(--preview-border);border-radius:7px}
.preview-root .pv-motion-steps > b{display:flex;width:32px;height:32px;align-items:center;justify-content:center;color:var(--preview-accent);background-color:var(--preview-accent-soft);border-radius:7px;font-size:8px}
.preview-root .pv-motion-steps > strong{padding:8px;color:var(--preview-surface);background-color:var(--preview-accent);border-radius:7px}
.preview-root .pv-motion-frames{display:flex;gap:8px;align-items:center}
.preview-root .pv-motion-frames > span{display:flex;width:42px;height:42px;align-items:center;justify-content:center;color:var(--preview-accent);background-color:var(--preview-accent-soft);border-radius:999px;font-size:18px}
.preview-root .pv-easing{display:flex;width:280px;flex-direction:column;gap:12px}
.preview-root .pv-easing > div{display:flex;gap:12px;align-items:center;padding:9px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:8px}
.preview-root .pv-easing > div > b{color:var(--preview-accent);letter-spacing:8px}
.preview-root .pv-spring{display:flex;gap:6px;align-items:center}
.preview-root .pv-spring > span,.preview-root .pv-spring > b,.preview-root .pv-spring > strong{display:flex;width:42px;height:42px;align-items:center;justify-content:center;border:1px solid var(--preview-accent);border-radius:999px}
.preview-root .pv-spring > b{transform:translateY(-12px)}
.preview-root .pv-spring > strong{color:var(--preview-surface);background-color:var(--preview-accent)}
.preview-root .pv-fade{display:flex;gap:10px}
.preview-root .pv-fade > span,.preview-root .pv-fade > strong{display:flex;width:80px;height:70px;align-items:center;justify-content:center;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:9px}
.preview-root .pv-fade [data-name="medium"]{color:var(--preview-muted);background-color:var(--preview-accent-soft)}
.preview-root .pv-fade > strong{color:var(--preview-surface);background-color:var(--preview-accent)}
.preview-root .pv-pointer-demo{display:flex;gap:16px;align-items:center}
.preview-root .pv-pressed{padding:8px 12px;color:var(--preview-surface);background-color:var(--preview-accent);border-radius:8px;box-shadow:0px 2px 0px 0px var(--preview-shadow);transform:translateY(2px)}
.preview-root .pv-focus-field{padding:9px;color:var(--preview-text);background-color:var(--preview-surface);border:3px solid var(--preview-accent);border-radius:8px}
.preview-root .pv-drag-list{display:flex;width:240px;flex-direction:column;gap:7px}
.preview-root .pv-drag-list > span,.preview-root .pv-drag-list > strong{padding:9px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:8px}
.preview-root .pv-drag-list > strong{color:var(--preview-accent);border:2px solid var(--preview-accent);box-shadow:0px 8px 18px 0px var(--preview-shadow);transform:translateX(14px)}
.preview-root .pv-disabled-button{padding:8px 12px;color:var(--preview-muted);background-color:var(--preview-border);border-radius:8px}
.preview-root .pv-cursor-demo{display:flex;flex-direction:column;gap:10px;padding:12px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px}
.preview-root .pv-selection-demo{width:260px;padding:14px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px;line-height:1.7}
.preview-root .pv-selection-demo > strong{padding:2px;color:var(--preview-dark-text);background-color:var(--preview-accent)}
.preview-root .pv-style{display:flex;width:100%;height:100%;gap:12px;align-items:center;justify-content:center;padding:14px;overflow:hidden;border-radius:14px}
.preview-root .pv-style-copy{display:flex;flex:1;flex-direction:column;gap:6px}
.preview-root .pv-style-action{display:inline-flex;padding:7px 11px;color:var(--preview-dark-text);background-color:var(--preview-ink);border-radius:7px;font-size:9px;font-weight:700}
.preview-root .pv-style[data-name="minimalism"]{color:var(--preview-ink);background-color:var(--preview-paper);border:1px solid var(--preview-border)}
.preview-root .pv-style[data-name="minimalism"] .pv-style-copy{max-width:190px}
.preview-root .pv-style[data-name="apple-hig"]{background-color:var(--preview-bg)}
.preview-root .pv-app-shell{display:flex;width:285px;flex-direction:column;gap:10px;padding:11px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:18px;box-shadow:0px 12px 28px 0px var(--preview-shadow)}
.preview-root .pv-app-nav{display:flex;align-items:center;justify-content:space-between;font-size:10px}
.preview-root .pv-app-card{display:flex;gap:9px;align-items:center;padding:10px;background-color:var(--preview-bg);border-radius:13px}
.preview-root .pv-style-orb{display:block;width:32px;height:32px;background-color:var(--preview-blue);border-radius:10px}
.preview-root .pv-style[data-name="notion-style"]{align-items:stretch;padding:0;background-color:var(--preview-paper);border:1px solid var(--preview-border)}
.preview-root .pv-doc-side{display:flex;width:95px;flex-direction:column;gap:8px;padding:14px 9px;color:var(--preview-muted);background-color:var(--preview-bg);font-size:8px}
.preview-root .pv-doc-page{display:flex;flex:1;flex-direction:column;gap:8px;justify-content:center;padding:14px;color:var(--preview-ink)}
.preview-root .pv-doc-page > strong{font-size:17px}
.preview-root .pv-style[data-name="bento-grid"]{background-color:var(--preview-dark-bg)}
.preview-root .pv-bento{display:grid;width:280px;height:116px;grid-template-columns:1fr 1fr;gap:7px}
.preview-root .pv-bento > div{display:flex;flex-direction:column;gap:5px;justify-content:center;padding:10px;color:var(--preview-dark-text);background-color:var(--preview-dark-surface);border:1px solid var(--preview-accent);border-radius:12px}
.preview-root .pv-bento-wide{grid-row:1 / span 2}
.preview-root .pv-bento-wide > strong{font-size:25px;color:var(--preview-cyan)}
.preview-root .pv-style[data-name="glassmorphism"]{background-color:var(--preview-purple)}
.preview-root .pv-glass-orb{display:block;width:70px;height:70px;background-color:var(--preview-cyan);border-radius:999px}
.preview-root .pv-glass-left{transform:translateX(25px) translateY(-28px)}
.preview-root .pv-glass-right{background-color:var(--preview-pink);transform:translateX(-25px) translateY(28px)}
.preview-root .pv-glass-card{display:flex;min-width:180px;flex-direction:column;gap:8px;padding:18px;color:var(--preview-dark-text);background-color:var(--preview-dark-surface);border:2px solid var(--preview-dark-text);border-radius:18px;box-shadow:0px 14px 28px 0px var(--preview-shadow)}
.preview-root .pv-style[data-name="neo-brutalism"]{background-color:var(--preview-yellow)}
.preview-root .pv-brutal-card{display:flex;width:245px;flex-direction:column;gap:8px;padding:14px;color:var(--preview-ink);background-color:var(--preview-paper);border:4px solid var(--preview-ink);box-shadow:7px 7px 0px 0px var(--preview-shadow);transform:rotate(-2deg)}
.preview-root .pv-brutal-card > strong{font-size:22px;text-transform:uppercase}
.preview-root .pv-brutal-button{align-self:flex-start;padding:6px;color:var(--preview-paper);background-color:var(--preview-red);border:3px solid var(--preview-ink);font-weight:800}
.preview-root .pv-style[data-name="swiss-style"]{justify-content:space-between;color:var(--preview-ink);background-color:var(--preview-paper);border-left:8px solid var(--preview-red);border-radius:0}
.preview-root .pv-swiss-index{align-self:flex-start;color:var(--preview-red);font-size:26px;font-weight:800}
.preview-root .pv-swiss-copy{display:flex;max-width:200px;flex-direction:column;gap:10px;align-self:flex-end}
.preview-root .pv-swiss-copy > strong{font-size:24px;line-height:1.05}
.preview-root .pv-swiss-mark{display:block;width:38px;height:38px;align-self:flex-start;background-color:var(--preview-red);border-radius:999px}
.preview-root .pv-style[data-name="editorial"]{align-items:stretch;color:var(--preview-ink);background-color:var(--preview-paper);border-top:5px solid var(--preview-ink);border-radius:0}
.preview-root .pv-editorial-head{display:flex;width:46%;flex-direction:column;gap:8px;border-right:1px solid var(--preview-ink)}
.preview-root .pv-editorial-head > strong{font-size:22px;font-style:italic;line-height:1.15}
.preview-root .pv-editorial-columns{display:grid;flex:1;grid-template-columns:1fr 1fr;gap:9px;align-content:center;font-size:9px;line-height:1.6}
.preview-root .pv-style[data-name="skeuomorphism"]{background-color:var(--preview-sand)}
.preview-root .pv-device{display:flex;width:210px;flex-direction:column;gap:7px;align-items:center;padding:12px;color:var(--preview-ink);background-color:var(--preview-paper);border:3px solid var(--preview-gold);border-radius:18px;box-shadow:0px 10px 18px 0px var(--preview-shadow)}
.preview-root .pv-dial{display:flex;width:52px;height:52px;align-items:center;justify-content:center;background-color:var(--preview-sand);border:7px solid var(--preview-paper);border-radius:999px;box-shadow:0px 4px 10px 0px var(--preview-shadow);font-weight:800}
.preview-root .pv-device-track{display:flex;width:130px;height:7px;background-color:var(--preview-border);border-radius:999px}
.preview-root .pv-device-track > span{display:block;width:72%;background-color:var(--preview-gold);border-radius:999px}
.preview-root .pv-style[data-name="flat-design"]{background-color:var(--preview-blue)}
.preview-root .pv-flat-icon{display:flex;width:58px;height:58px;align-items:center;justify-content:center;color:var(--preview-blue);background-color:var(--preview-paper);border-radius:14px;font-size:28px}
.preview-root .pv-style[data-name="flat-design"] .pv-style-copy{color:var(--preview-dark-text)}
.preview-root .pv-flat-button{padding:7px 11px;color:var(--preview-ink);background-color:var(--preview-yellow);font-weight:700}
.preview-root .pv-style[data-name="material-design"]{background-color:var(--preview-bg)}
.preview-root .pv-material-card{display:flex;width:235px;flex-direction:column;gap:7px;padding:13px;background-color:var(--preview-surface);border-radius:8px;box-shadow:0px 10px 22px 0px var(--preview-shadow)}
.preview-root .pv-fab{display:flex;width:48px;height:48px;align-items:center;justify-content:center;color:var(--preview-surface);background-color:var(--preview-accent);border-radius:999px;box-shadow:0px 8px 18px 0px var(--preview-shadow);font-size:23px}
.preview-root .pv-style[data-name="neumorphism"]{background-color:var(--preview-bg)}
.preview-root .pv-neu-panel{display:flex;width:280px;gap:14px;align-items:center;justify-content:space-between;padding:18px;background-color:var(--preview-bg);border-radius:20px;box-shadow:9px 9px 20px 0px var(--preview-shadow)}
.preview-root .pv-neu-button{display:flex;width:40px;height:40px;align-items:center;justify-content:center;color:var(--preview-accent);background-color:var(--preview-bg);border-radius:999px;box-shadow:5px 5px 12px 0px var(--preview-shadow)}
.preview-root .pv-style[data-name="saas-marketing"]{background-color:var(--preview-paper)}
.preview-root .pv-saas-hero{display:flex;flex:1;flex-direction:column;gap:6px;color:var(--preview-ink)}
.preview-root .pv-saas-hero > strong{font-size:19px}
.preview-root .pv-saas-proof{display:flex;width:88px;flex-direction:column;gap:5px;padding:12px;color:var(--preview-dark-text);background-color:var(--preview-purple);border-radius:15px;text-align:center}
.preview-root .pv-saas-proof > strong{font-size:22px}
.preview-root .pv-style[data-name="b2b-corporate"]{padding:0;background-color:var(--preview-paper);border:1px solid var(--preview-border)}
.preview-root .pv-corporate{display:flex;width:100%;height:100%;flex-direction:column;color:var(--preview-ink)}
.preview-root .pv-corp-nav{display:flex;justify-content:space-between;padding:9px;color:var(--preview-dark-text);background-color:var(--preview-dark-bg);font-size:9px}
.preview-root .pv-corp-body{display:flex;flex:1;flex-direction:column;gap:8px;justify-content:center;padding:12px}
.preview-root .pv-style[data-name="dtc-ecommerce"]{align-items:stretch;padding:0;color:var(--preview-ink);background-color:var(--preview-paper);border:1px solid var(--preview-border)}
.preview-root .pv-product-photo{display:flex;width:48%;align-items:center;justify-content:center;color:var(--preview-paper);background-color:var(--preview-clay);font-size:16px;font-weight:800}
.preview-root .pv-product-detail{display:flex;flex:1;flex-direction:column;gap:8px;justify-content:center;padding:14px}
.preview-root .pv-product-detail > strong{font-size:18px}
.preview-root .pv-style[data-name="dark-ui"]{background-color:var(--preview-dark-bg)}
.preview-root .pv-dark-panel{display:flex;width:280px;flex-direction:column;gap:8px;padding:12px;color:var(--preview-dark-text);background-color:var(--preview-dark-surface);border:1px solid var(--preview-purple);border-radius:12px}
.preview-root .pv-dark-nav{display:flex;justify-content:space-between;color:var(--preview-cyan);font-size:9px}
.preview-root .pv-dark-chart{display:flex;gap:14px;align-items:flex-end}
.preview-root .pv-dark-chart > span{font-size:27px;font-weight:800}
.preview-root .pv-dark-bars{display:flex;height:48px;gap:5px;align-items:flex-end}
.preview-root .pv-dark-bars > b{display:block;width:18px;background-color:var(--preview-cyan);border-radius:4px}
.preview-root .pv-dark-bars > :nth-child(1){height:22px}
.preview-root .pv-dark-bars > :nth-child(2){height:34px;background-color:var(--preview-purple)}
.preview-root .pv-dark-bars > :nth-child(3){height:42px;background-color:var(--preview-pink)}
.preview-root .pv-dark-bars > :nth-child(4){height:48px}
.preview-root .pv-style[data-name="playful-illustration"]{color:var(--preview-ink);background-color:var(--preview-yellow)}
.preview-root .pv-play-character{display:flex;width:84px;height:84px;gap:8px;align-items:center;justify-content:center;background-color:var(--preview-pink);border:4px solid var(--preview-ink);border-radius:999px;box-shadow:6px 6px 0px 0px var(--preview-shadow);font-size:26px;transform:rotate(-5deg)}
.preview-root .pv-ear{display:flex;width:20px;height:30px;align-items:center;justify-content:center;background-color:var(--preview-cyan);border:3px solid var(--preview-ink);border-radius:999px;font-size:8px}
.preview-root .pv-play-copy{display:flex;flex-direction:column;gap:7px}
.preview-root .pv-play-copy > strong{font-size:18px}
.preview-root .pv-play-pill{align-self:flex-start;padding:6px 9px;color:var(--preview-dark-text);background-color:var(--preview-purple);border:2px solid var(--preview-ink);border-radius:999px;font-size:9px}
.preview-root .pv-style[data-name="organic-design"]{color:var(--preview-ink);background-color:var(--preview-sand)}
.preview-root .pv-leaf{display:flex;width:70px;height:82px;align-items:center;justify-content:center;color:var(--preview-paper);background-color:var(--preview-earth);border-radius:70% 30% 65% 35%;font-size:16px}
.preview-root .pv-leaf-one{transform:rotate(-12deg)}
.preview-root .pv-leaf-two{background-color:var(--preview-clay);transform:rotate(16deg)}
.preview-root .pv-organic-copy{display:flex;flex:1;flex-direction:column;gap:8px;align-items:center;text-align:center}
.preview-root .pv-organic-copy > strong{font-size:20px;font-style:italic}
.preview-root .pv-style[data-name="y2k"]{color:var(--preview-dark-text);background-color:var(--preview-dark-bg);border:3px solid var(--preview-cyan)}
.preview-root .pv-y2k-window{display:flex;width:225px;flex-direction:column;gap:6px;align-items:center;padding:12px;background-color:var(--preview-purple);border:3px solid var(--preview-cyan);border-radius:4px;box-shadow:6px 6px 0px 0px var(--preview-shadow);font-family:var(--preview-mono)}
.preview-root .pv-y2k-window > strong{color:var(--preview-yellow);font-size:21px}
.preview-root .pv-y2k-button{padding:5px;color:var(--preview-dark-bg);background-color:var(--preview-cyan);border:2px solid var(--preview-pink);font-size:9px;font-weight:800}
.preview-root .pv-y2k-star{color:var(--preview-pink);font-size:28px}
.preview-root .pv-style[data-name="memphis"]{color:var(--preview-ink);background-color:var(--preview-paper);border:3px solid var(--preview-ink)}
.preview-root .pv-memphis-shape{display:block;width:62px;height:62px;background-color:var(--preview-yellow);border:4px solid var(--preview-ink)}
.preview-root .pv-memphis-circle{background-color:var(--preview-pink);border-radius:999px;transform:translateY(-22px)}
.preview-root .pv-memphis-square{background-color:var(--preview-cyan);transform:rotate(15deg) translateY(20px)}
.preview-root .pv-memphis-copy{display:flex;flex-direction:column;gap:5px;text-align:center}
.preview-root .pv-memphis-copy > strong{font-size:20px}
.preview-root .pv-style[data-name="terminal-aesthetic"]{background-color:var(--preview-dark-bg)}
.preview-root .pv-terminal{display:flex;width:285px;flex-direction:column;gap:8px;padding:12px;color:var(--preview-terminal);background-color:var(--preview-ink);border:2px solid var(--preview-terminal);border-radius:4px;font-family:var(--preview-mono);font-size:10px}
.preview-root .pv-terminal-bar{display:flex;justify-content:space-between;padding-bottom:7px;color:var(--preview-muted);border-bottom:1px solid var(--preview-terminal)}
.preview-root .pv-style[data-name="wabi-sabi"]{color:var(--preview-ink);background-color:var(--preview-sand);border-radius:48% 10% 42% 18%}
.preview-root .pv-wabi-mark{display:flex;width:74px;height:74px;align-items:center;justify-content:center;color:var(--preview-clay);border:2px solid var(--preview-clay);border-radius:56% 44% 62% 38%;font-size:34px;transform:rotate(-8deg)}
.preview-root .pv-wabi-copy{display:flex;flex:1;flex-direction:column;gap:8px}
.preview-root .pv-wabi-copy > strong{font-size:20px;font-weight:500}
.preview-root .pv-wabi-line{width:48px;height:3px;align-self:flex-end;background-color:var(--preview-earth);transform:rotate(-18deg)}
.preview-root .pv-style[data-name="bauhaus"]{color:var(--preview-ink);background-color:var(--preview-paper);border:3px solid var(--preview-ink);border-radius:0}
.preview-root .pv-bauhaus{display:grid;width:105px;height:105px;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}
.preview-root .pv-bauhaus-circle{background-color:var(--preview-red);border-radius:999px}
.preview-root .pv-bauhaus-square{background-color:var(--preview-blue)}
.preview-root .pv-bauhaus-bar{grid-column:1 / span 2;background-color:var(--preview-yellow);border:3px solid var(--preview-ink)}
.preview-root .pv-bauhaus-copy{display:flex;flex-direction:column;gap:8px}
.preview-root .pv-bauhaus-copy > strong{font-size:16px;line-height:1.05}
.preview-root .pv-style[data-name="art-deco"]{flex-direction:column;gap:5px;color:var(--preview-gold);background-color:var(--preview-dark-bg);border:3px solid var(--preview-gold);border-radius:0}
.preview-root .pv-deco-lines{display:flex;width:220px;gap:8px;align-items:center}
.preview-root .pv-deco-lines > span{display:block;flex:1;height:2px;background-color:var(--preview-gold)}
.preview-root .pv-deco-copy{display:flex;flex-direction:column;gap:5px;align-items:center;text-align:center}
.preview-root .pv-deco-copy > strong{font-size:21px;letter-spacing:3px}
.preview-root .pv-address{display:flex;gap:2px;align-items:center;padding:12px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:9px;font-family:var(--preview-mono);font-size:10px}
.preview-root .pv-address > strong{color:var(--preview-accent)}
.preview-root .pv-address-parts{display:flex;gap:16px;color:var(--preview-muted);font-size:8px}
.preview-root .pv-request{display:flex;width:100%;gap:10px;align-items:center;justify-content:center}
.preview-root .pv-request > div{display:flex;min-width:120px;flex-direction:column;gap:5px;padding:10px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:9px;font-family:var(--preview-mono);font-size:9px}
.preview-root .pv-cookie{display:flex;width:250px;flex-direction:column;gap:7px;padding:12px;background-color:var(--preview-paper);border:2px dashed var(--preview-gold);border-radius:14px;font-family:var(--preview-mono);font-size:9px}
.preview-root .pv-lock{display:flex;width:70px;height:70px;align-items:center;justify-content:center;color:var(--preview-success);background-color:var(--preview-surface);border:4px solid var(--preview-success);border-radius:999px;font-size:26px}
.preview-root .pv-network{display:flex;gap:8px;align-items:center;justify-content:center}
.preview-root .pv-server-box{display:flex;min-width:165px;flex-direction:column;gap:6px;padding:11px;background-color:var(--preview-surface);border:2px solid var(--preview-accent);border-radius:10px}
.preview-root .pv-port-row{display:grid;grid-template-columns:1fr 2fr;gap:8px;font-family:var(--preview-mono);font-size:9px}
.preview-root .pv-port-row > span{color:var(--preview-accent)}
.preview-root .pv-chat-socket{display:flex;gap:10px;align-items:center}
.preview-root .pv-chat-socket > div{display:flex;flex-direction:column;gap:6px;padding:11px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px;font-size:9px}
.preview-root .pv-chat-socket > b{color:var(--preview-success);font-size:9px}
.preview-root .pv-api{display:grid;width:280px;grid-template-columns:1fr 1fr;overflow:hidden;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px}
.preview-root .pv-api-route{display:flex;flex-direction:column;gap:8px;justify-content:center;padding:12px}
.preview-root .pv-api-route > b{color:var(--preview-success)}
.preview-root .pv-api-response{display:flex;flex-direction:column;gap:4px;padding:10px;color:var(--preview-dark-text);background-color:var(--preview-dark-bg);border-radius:9px;font-family:var(--preview-mono);font-size:9px}
.preview-root .pv-origin{display:flex;min-width:115px;flex-direction:column;gap:6px;padding:11px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:9px}
.preview-root .pv-error-field{padding:7px;color:var(--preview-danger);background-color:var(--preview-surface);border:2px solid var(--preview-danger);border-radius:7px;font-size:9px}
.preview-root .pv-storage{display:grid;width:300px;grid-template-columns:1fr 1fr;gap:8px}
.preview-root .pv-storage > div{display:flex;flex-direction:column;gap:6px;padding:10px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:9px;font-family:var(--preview-mono);font-size:9px}
.preview-root .pv-database{display:flex;width:220px;flex-direction:column;overflow:hidden;background-color:var(--preview-surface);border:2px solid var(--preview-accent);border-radius:50% 50% 12px 12px}
.preview-root .pv-db-top{padding:8px;color:var(--preview-surface);background-color:var(--preview-accent);font-weight:800;text-align:center}
.preview-root .pv-table-row{display:flex;justify-content:space-between;padding:7px 10px;border-bottom:1px solid var(--preview-border);font-size:9px}
.preview-root .pv-framework{display:flex;max-width:290px;flex-direction:column;gap:9px;align-items:center;padding:13px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:12px}
.preview-root .pv-route-list{display:flex;width:300px;flex-direction:column;gap:6px}
.preview-root .pv-route-list > div{display:grid;grid-template-columns:1fr 3fr 2fr;gap:7px;padding:8px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:7px;font-family:var(--preview-mono);font-size:8px}
.preview-root .pv-route-list > div > b{color:var(--preview-success)}
.preview-root .pv-permission{display:grid;width:300px;grid-template-columns:1fr 1fr;gap:9px}
.preview-root .pv-permission > div{display:flex;flex-direction:column;gap:7px;padding:10px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:9px;font-size:9px}
.preview-root .pv-search-result{display:flex;width:300px;flex-direction:column;gap:5px;padding:12px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:9px}
.preview-root .pv-search-result > small{color:var(--preview-success)}
.preview-root .pv-search-result > strong{color:var(--preview-accent);font-size:16px}
.preview-root .pv-url-stack{display:flex;flex-direction:column;gap:6px;color:var(--preview-muted);font-family:var(--preview-mono);font-size:9px}
.preview-root .pv-big-number{color:var(--preview-accent);font-size:42px;line-height:1}
.preview-root .pv-env{display:grid;width:290px;grid-template-columns:1fr 1fr;gap:8px}
.preview-root .pv-env > div{display:flex;flex-direction:column;gap:6px;padding:11px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:9px;font-family:var(--preview-mono);font-size:9px}
.preview-root .pv-env > small{grid-column:1 / span 2;text-align:center}
.preview-root .pv-hosting{display:flex;flex-direction:column;gap:10px;align-items:center;padding:12px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:11px}
.preview-root .pv-pipeline{display:flex;gap:7px;align-items:center;padding:10px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px;font-size:9px}
.preview-root .pv-pipeline-done{padding:7px;color:var(--preview-success);background-color:var(--preview-surface);border:1px solid var(--preview-success);border-radius:7px}
.preview-root .pv-pipeline-active{padding:7px;color:var(--preview-accent);background-color:var(--preview-accent-soft);border:2px solid var(--preview-accent);border-radius:7px}
.preview-root .pv-environments{display:flex;gap:9px;align-items:center}
.preview-root .pv-environments > div{display:flex;min-width:125px;flex-direction:column;gap:6px;padding:11px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px}
.preview-root .pv-event-cloud{display:flex;gap:10px;align-items:center;padding:15px;background-color:var(--preview-surface);border:2px dashed var(--preview-accent);border-radius:999px}
.preview-root .pv-event-cloud > b{color:var(--preview-warning);font-size:20px}
.preview-root .pv-release-users{display:grid;width:290px;grid-template-columns:1fr 1fr;gap:9px}
.preview-root .pv-release-users > div{display:flex;flex-direction:column;gap:8px;padding:12px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px;text-align:center}
.preview-root .pv-env-blue{border:3px solid var(--preview-blue)}
.preview-root .pv-env-green{border:3px solid var(--preview-earth)}
.preview-root .pv-story{display:grid;width:290px;grid-template-columns:1fr 3fr;gap:6px;padding:12px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px}
.preview-root .pv-story > small{color:var(--preview-accent);font-weight:700}
.preview-root .pv-use-case{display:grid;width:280px;grid-template-columns:1fr 3fr;gap:8px;padding:12px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px}
.preview-root .pv-use-case > div{display:flex;grid-column:2;flex-direction:column;gap:5px;font-size:9px}
.preview-root .pv-use-case > small{grid-column:2;color:var(--preview-success)}
.preview-root .pv-journey{display:grid;width:320px;grid-template-columns:1fr 1fr 1fr 1fr;gap:5px}
.preview-root .pv-journey > div{display:flex;flex-direction:column;gap:4px;align-items:center;padding:8px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:8px;text-align:center;font-size:8px}
.preview-root .pv-document{display:flex;width:240px;flex-direction:column;gap:7px;padding:13px;background-color:var(--preview-paper);border-left:5px solid var(--preview-accent);box-shadow:0px 8px 20px 0px var(--preview-shadow)}
.preview-root .pv-scope{display:grid;width:290px;grid-template-columns:1fr 1fr;gap:7px;padding:12px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px}
.preview-root .pv-scope > strong{grid-column:1 / span 2}
.preview-root .pv-roadmap{display:grid;width:310px;grid-template-columns:1fr 1fr 1fr;gap:7px}
.preview-root .pv-roadmap > div{display:flex;flex-direction:column;gap:6px;padding:10px;background-color:var(--preview-surface);border-top:5px solid var(--preview-accent);border-radius:7px;font-size:9px}
.preview-root .pv-gantt{display:flex;width:300px;flex-direction:column;gap:6px}
.preview-root .pv-gantt > div{display:flex;gap:8px;align-items:center;font-size:9px}
.preview-root .pv-gantt > div > span{width:42px}
.preview-root .pv-gantt > div > b{display:block;height:14px;background-color:var(--preview-accent);border-radius:4px}
.preview-root .pv-gantt [data-name="one"]{width:35%;margin-left:0}
.preview-root .pv-gantt [data-name="two"]{width:42%;margin-left:15%}
.preview-root .pv-gantt [data-name="three"]{width:55%;margin-left:28%}
.preview-root .pv-gantt [data-name="four"]{width:28%;margin-left:60%}
.preview-root .pv-wireframe{display:flex;width:300px;flex-direction:column;background-color:var(--preview-surface);border:2px solid var(--preview-muted)}
.preview-root .pv-wire-nav{padding:8px;border-bottom:2px solid var(--preview-muted);font-size:8px}
.preview-root .pv-wire-body{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px}
.preview-root .pv-wire-copy{display:flex;flex-direction:column;gap:6px}
.preview-root .pv-wire-copy > b{display:block;width:90%;height:14px;background-color:var(--preview-border)}
.preview-root .pv-wire-copy > span{display:block;width:100%;height:7px;background-color:var(--preview-border)}
.preview-root .pv-wire-copy > small{align-self:flex-start;padding:5px;border:2px solid var(--preview-muted)}
.preview-root .pv-wire-media{display:flex;align-items:center;justify-content:center;border:2px dashed var(--preview-muted)}
.preview-root .pv-moodboard{display:grid;width:300px;height:120px;grid-template-columns:1fr 1fr 1fr;gap:6px}
.preview-root .pv-moodboard > div{display:flex;align-items:center;justify-content:center;padding:8px;border-radius:8px;font-size:9px}
.preview-root .pv-moodboard [data-name="photo"]{grid-row:1 / span 2;color:var(--preview-paper);background-color:var(--preview-earth)}
.preview-root .pv-moodboard [data-name="type"]{grid-column:2 / span 2;color:var(--preview-ink);background-color:var(--preview-paper);font-style:italic}
.preview-root .pv-moodboard [data-name="color"]{background-color:var(--preview-clay)}
.preview-root .pv-moodboard [data-name="material"]{background-color:var(--preview-sand)}
.preview-root .pv-ab{display:grid;width:290px;grid-template-columns:1fr 1fr;gap:8px}
.preview-root .pv-ab > div{display:flex;flex-direction:column;gap:7px;padding:12px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px;text-align:center}
.preview-root .pv-ab-winner{color:var(--preview-success);border:3px solid var(--preview-success)}
.preview-root .pv-funnel{display:flex;width:280px;flex-direction:column;gap:5px;align-items:center}
.preview-root .pv-funnel > span,.preview-root .pv-funnel > strong{padding:6px;color:var(--preview-surface);background-color:var(--preview-accent);text-align:center}
.preview-root .pv-funnel > :nth-child(1){width:100%}
.preview-root .pv-funnel > :nth-child(2){width:78%;background-color:var(--preview-purple)}
.preview-root .pv-funnel > :nth-child(3){width:58%;background-color:var(--preview-pink)}
.preview-root .pv-funnel > :nth-child(4){width:38%;background-color:var(--preview-success)}
.preview-root .pv-crud{display:grid;width:290px;grid-template-columns:1fr 1fr;gap:7px}
.preview-root .pv-crud > span{display:flex;gap:8px;align-items:center;padding:9px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:8px}
.preview-root .pv-crud > span > b{display:flex;width:24px;height:24px;align-items:center;justify-content:center;color:var(--preview-surface);background-color:var(--preview-accent);border-radius:6px}
.preview-root .pv-record,.preview-root .pv-type-table{display:flex;width:270px;flex-direction:column;gap:7px;padding:12px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px;font-family:var(--preview-mono);font-size:9px}
.preview-root .pv-record > span,.preview-root .pv-type-table > span{display:grid;grid-template-columns:1fr 2fr;gap:8px;padding-bottom:5px;border-bottom:1px solid var(--preview-border)}
.preview-root .pv-import{display:flex;gap:7px;align-items:center}
.preview-root .pv-table-small{display:flex;flex-direction:column;gap:5px;padding:10px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:8px}
.preview-root .pv-devtools{display:grid;width:310px;height:125px;grid-template-columns:1fr 1fr;overflow:hidden;border:1px solid var(--preview-border);border-radius:10px}
.preview-root .pv-browser-page{display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:center;background-color:var(--preview-surface)}
.preview-root .pv-inspector{display:flex;flex-direction:column;gap:6px;padding:9px;color:var(--preview-terminal);background-color:var(--preview-dark-bg);font-family:var(--preview-mono);font-size:8px}
.preview-root .pv-package{display:flex;min-width:160px;flex-direction:column;gap:5px;padding:10px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:9px;font-family:var(--preview-mono);font-size:8px}
.preview-root .pv-checklist{display:flex;width:255px;flex-direction:column;gap:7px;padding:12px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px}
.preview-root .pv-test-case{display:grid;width:280px;grid-template-columns:1fr 3fr;gap:7px;padding:12px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px;font-size:9px}
.preview-root .pv-test-case > span{grid-column:1 / span 2}
.preview-root .pv-test-scope{display:flex;gap:8px;align-items:center}
.preview-root .pv-smoke{display:grid;width:280px;grid-template-columns:1fr 1fr;gap:7px;padding:12px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px}
.preview-root .pv-smoke > strong,.preview-root .pv-smoke > small{grid-column:1 / span 2}
.preview-root .pv-test-double{display:flex;gap:8px;align-items:center}
.preview-root .pv-test-double > .pv-caption{max-width:72px}
.preview-root .pv-fixture{display:flex;width:250px;flex-direction:column;gap:7px;padding:12px;color:var(--preview-dark-text);background-color:var(--preview-dark-surface);border-radius:10px;font-family:var(--preview-mono);font-size:9px}
.preview-root .pv-flaky{display:flex;width:280px;flex-direction:column;gap:7px;align-items:center}
.preview-root .pv-stack{display:grid;width:290px;grid-template-columns:1fr 1fr;gap:8px}
.preview-root .pv-component-tree,.preview-root .pv-component-kit{display:flex;flex-direction:column;gap:7px;padding:12px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px;font-family:var(--preview-mono);font-size:9px}
.preview-root .pv-ai-app,.preview-root .pv-agent,.preview-root .pv-multimodal{display:flex;gap:7px;align-items:center;justify-content:center}
.preview-root .pv-answer-check{display:flex;gap:8px;align-items:center}
.preview-root .pv-answer-check > div{display:flex;max-width:145px;flex-direction:column;gap:7px;padding:10px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:9px;font-size:9px}
.preview-root .pv-vibe{display:flex;gap:10px;align-items:center}
.preview-root .pv-bubble{display:flex;max-width:150px;flex-direction:column;gap:6px;padding:11px;color:var(--preview-dark-text);background-color:var(--preview-accent);border-radius:14px 14px 4px 14px}
.preview-root .pv-context-pack{display:flex;width:220px;flex-direction:column;gap:6px;padding:11px;background-color:var(--preview-surface);border:2px solid var(--preview-accent);border-radius:10px;font-size:9px}
.preview-root .pv-tokenized{display:flex;gap:4px;align-items:center;padding:12px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:9px}
.preview-root .pv-tokenized > span,.preview-root .pv-tokenized > b{padding:7px;background-color:var(--preview-accent-soft);border-radius:5px}
.preview-root .pv-tokenized > b{color:var(--preview-purple);background-color:var(--preview-sand)}
.preview-root .pv-window-meter{display:flex;width:290px;flex-direction:column;gap:9px;padding:12px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px;font-size:9px}
.preview-root .pv-message-stack,.preview-root .pv-chat-history{display:flex;width:290px;flex-direction:column;gap:8px}
.preview-root .pv-message-stack > div,.preview-root .pv-chat-history > div{display:flex;flex-direction:column;gap:5px;padding:9px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:9px}
.preview-root .pv-system-message{color:var(--preview-purple);background-color:var(--preview-accent-soft);border:2px solid var(--preview-purple)}
.preview-root .pv-prompt-card{display:grid;width:280px;grid-template-columns:1fr 3fr;gap:7px;padding:12px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px}
.preview-root .pv-prompt-card > small{color:var(--preview-accent);font-weight:700}
.preview-root .pv-stateless{display:grid;width:290px;grid-template-columns:1fr 1fr;gap:8px}
.preview-root .pv-stateless > div{display:flex;flex-direction:column;gap:6px;padding:11px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:9px}
.preview-root .pv-stream{display:flex;width:270px;flex-direction:column;gap:7px;padding:12px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px}
.preview-root .pv-stream-packets{display:flex;gap:5px}
.preview-root .pv-stream-packets > b{display:flex;width:24px;height:20px;align-items:center;justify-content:center;color:var(--preview-surface);background-color:var(--preview-accent);border-radius:5px;font-size:8px}
.preview-root .pv-harness,.preview-root .pv-skill-card{display:flex;width:270px;flex-direction:column;gap:8px;align-items:center;padding:12px;background-color:var(--preview-surface);border:2px solid var(--preview-purple);border-radius:11px}
.preview-root .pv-mcp,.preview-root .pv-tool-call{display:flex;gap:8px;align-items:center}
.preview-root .pv-agent-tree{display:flex;width:245px;flex-direction:column;gap:7px;padding:12px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px;font-family:var(--preview-mono);font-size:9px}
.preview-root .pv-tool-call > div{display:flex;max-width:145px;flex-direction:column;gap:6px;padding:10px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:9px;font-family:var(--preview-mono);font-size:9px}
.preview-root .pv-reason-act{display:flex;gap:5px;align-items:center}
.preview-root .pv-reason-act > span{display:flex;width:90px;min-height:76px;flex-direction:column;gap:6px;justify-content:center;padding:8px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:9px;font-size:8px}
.preview-root .pv-loop{display:flex;gap:5px;align-items:center}
.preview-root .pv-loop > span{display:flex;width:58px;height:58px;align-items:center;justify-content:center;padding:6px;background-color:var(--preview-surface);border:1px solid var(--preview-accent);border-radius:999px;text-align:center;font-size:8px}
.preview-root .pv-loop > strong{color:var(--preview-success);font-size:9px}
.preview-root .pv-cost{display:grid;width:280px;grid-template-columns:1fr 1fr;gap:8px}
.preview-root .pv-cost > div{display:flex;flex-direction:column;gap:6px;padding:10px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:9px}
.preview-root .pv-cost > b{grid-column:1 / span 2;padding:7px;color:var(--preview-success);background-color:var(--preview-surface);text-align:center}
.preview-root .pv-rate{display:flex;width:280px;flex-direction:column;gap:9px;padding:12px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px}
.preview-root .pv-git-graph,.preview-root .pv-branch{display:flex;flex-direction:column;gap:4px;padding:12px;color:var(--preview-terminal);background-color:var(--preview-dark-bg);border-radius:10px;font-family:var(--preview-mono);font-size:10px;white-space:pre}
.preview-root .pv-commit{display:flex;width:280px;gap:10px;align-items:center;padding:12px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px}
.preview-root .pv-git-dot{display:flex;width:34px;height:34px;align-items:center;justify-content:center;color:var(--preview-surface);background-color:var(--preview-purple);border-radius:999px}
.preview-root .pv-pr,.preview-root .pv-worktrees,.preview-root .pv-stash{display:flex;width:285px;flex-direction:column;gap:8px;padding:12px;background-color:var(--preview-surface);border:1px solid var(--preview-border);border-radius:10px}
.preview-root .pv-worktrees > div,.preview-root .pv-stash > div{display:flex;gap:10px;justify-content:space-between;padding:8px;background-color:var(--preview-bg);border-radius:7px;font-size:9px}
.preview-root .pv-diff{display:flex;width:280px;flex-direction:column;gap:6px;padding:12px;color:var(--preview-dark-text);background-color:var(--preview-dark-bg);border-radius:10px;font-family:var(--preview-mono);font-size:9px}
.preview-root .pv-diff-remove{padding:5px;color:var(--preview-danger);background-color:var(--preview-dark-surface)}
.preview-root .pv-diff-add{padding:5px;color:var(--preview-terminal);background-color:var(--preview-dark-surface)}`
