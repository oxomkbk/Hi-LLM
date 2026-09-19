import postcss from 'postcss'
import selectorParser from 'postcss-selector-parser'

export function subsetTerminologyPreviewCss(css: string, previews: readonly { html: string }[]) {
  const classes = new Set<string>()
  const dataNames = new Set<string>()
  for (const preview of previews) {
    for (const match of preview.html.matchAll(/class="([a-z0-9 -]+)"/g)) {
      for (const className of match[1]!.split(' '))
        classes.add(className)
    }
    for (const match of preview.html.matchAll(/data-name="([a-z0-9-]+)"/g))
      dataNames.add(match[1]!)
  }

  const root = postcss.parse(css, { from: undefined })
  root.walkRules((rule) => {
    const selectors = rule.selectors.filter(selector => selectorMatchesPreview(selector, classes, dataNames))
    if (selectors.length)
      rule.selectors = selectors
    else
      rule.remove()
  })
  root.walkAtRules((atRule) => {
    if (!atRule.nodes?.length)
      atRule.remove()
  })
  return root.toString().trim()
}

function selectorMatchesPreview(
  selector: string,
  classes: ReadonlySet<string>,
  dataNames: ReadonlySet<string>,
) {
  let matches = true
  selectorParser((root) => {
    root.walkClasses((node) => {
      if (node.value !== 'preview-root' && !classes.has(node.value))
        matches = false
    })
    root.walkAttributes((node) => {
      if (node.attribute === 'data-name' && node.value && !dataNames.has(node.value))
        matches = false
    })
  }).processSync(selector)
  return matches
}
