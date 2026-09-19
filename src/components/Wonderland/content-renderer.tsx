import Image from 'next/image'

import { wonderlandLowlight } from '@/lib/wonderland/lowlight'

import type { WonderlandBlock, WonderlandDocument, WonderlandInline } from '@/lib/wonderland/content'

type HighlightNode = ReturnType<typeof wonderlandLowlight.highlight>['children'][number]

export default function WonderlandContentRenderer({ document }: { document: WonderlandDocument }) {
  return (
    <div className="wonderland-prose">
      {document.content.map((block, index) => <Block key={blockKey(block, index)} block={block} />)}
    </div>
  )
}

function Block({ block }: { block: WonderlandBlock }) {
  if (block.type === 'paragraph')
    return <p data-align={block.align}>{renderInline(block.content)}</p>
  if (block.type === 'heading') {
    const Heading = `h${block.level}` as 'h2' | 'h3' | 'h4'
    return <Heading data-align={block.align}>{renderInline(block.content)}</Heading>
  }
  if (block.type === 'blockquote')
    return <blockquote>{block.content.map((child, index) => <Block key={blockKey(child, index)} block={child} />)}</blockquote>
  if (block.type === 'codeBlock')
    return <HighlightedCode code={block.code} language={block.language} />
  if (block.type === 'horizontalRule')
    return <hr />
  if (block.type === 'image') {
    return (
      <figure>
        <Image
          alt={block.alt || block.caption || '用户上传的内容图片'}
          height={900}
          loading="lazy"
          sizes="(max-width: 768px) 100vw, 760px"
          src={`/api/files/${block.fileId}`}
          width={1400}
        />
        {block.caption ? <figcaption>{block.caption}</figcaption> : null}
      </figure>
    )
  }
  if (block.type === 'table') {
    return (
      <div className="wonderland-table-scroll">
        <table>
          <tbody>
            {withOccurrenceKeys(block.rows, 'row').map(({ item: row, key }) => (
              <tr key={key}>
                {withOccurrenceKeys(row.cells, 'cell').map(({ item: cell, key: cellKey }) => {
                  const Cell = cell.type === 'tableHeader' ? 'th' : 'td'
                  return (
                    <Cell key={cellKey} colSpan={cell.colspan} rowSpan={cell.rowspan}>
                      {cell.content.map((child, childIndex) => <Block key={blockKey(child, childIndex)} block={child} />)}
                    </Cell>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  if (block.type === 'taskList') {
    return (
      <ul data-type="taskList">
        {withOccurrenceKeys(block.content, 'task').map(({ item, key }) => (
          <li key={key} data-checked={item.checked}>
            <span aria-hidden="true" className="wonderland-task-checkbox">{item.checked ? '✓' : ''}</span>
            <div>{item.content.map((child, childIndex) => <Block key={blockKey(child, childIndex)} block={child} />)}</div>
          </li>
        ))}
      </ul>
    )
  }
  const List = block.type === 'orderedList' ? 'ol' : 'ul'
  const occurrences = new Map<string, number>()
  return (
    <List>
      {block.content.map((item) => {
        const signature = JSON.stringify(item)
        const occurrence = (occurrences.get(signature) ?? 0) + 1
        occurrences.set(signature, occurrence)
        return <li key={`${signature}-${occurrence}`}>{item.content.map((child, childIndex) => <Block key={blockKey(child, childIndex)} block={child} />)}</li>
      })}
    </List>
  )
}

function blockKey(block: WonderlandBlock, index: number) {
  if (block.type === 'image')
    return `image-${block.fileId}`
  if (block.type === 'codeBlock')
    return `code-${block.code.slice(0, 24)}-${index}`
  if (block.type === 'horizontalRule')
    return `rule-${index}`
  return `${block.type}-${JSON.stringify(block).slice(0, 48)}-${index}`
}

function HighlightedCode({ code, language = 'plaintext' }: { code: string, language?: string }) {
  const highlighted = wonderlandLowlight.registered(language)
    ? wonderlandLowlight.highlight(language, code).children
    : [{ type: 'text' as const, value: code }]
  return (
    <pre data-language={language}>
      <code className={`hljs language-${language}`}>{highlighted.map(renderHighlightNode)}</code>
    </pre>
  )
}

function renderHighlightNode(node: HighlightNode, index: number): React.ReactNode {
  if (node.type === 'text')
    return node.value
  if (node.type !== 'element')
    return null
  const className = Array.isArray(node.properties.className)
    ? node.properties.className.join(' ')
    : typeof node.properties.className === 'string' ? node.properties.className : undefined
  return (
    <span key={`${node.tagName}-${index}`} className={className}>
      {node.children.map(renderHighlightNode)}
    </span>
  )
}

function renderInline(content: WonderlandInline[]) {
  const occurrences = new Map<string, number>()
  return content.map((node) => {
    const signature = `${node.text}-${JSON.stringify(node.marks ?? [])}`
    const occurrence = (occurrences.get(signature) ?? 0) + 1
    occurrences.set(signature, occurrence)
    let value: React.ReactNode = node.text
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold')
        value = <strong>{value}</strong>
      if (mark.type === 'italic')
        value = <em>{value}</em>
      if (mark.type === 'code')
        value = <code>{value}</code>
      if (mark.type === 'underline')
        value = <u>{value}</u>
      if (mark.type === 'strike')
        value = <s>{value}</s>
      if (mark.type === 'highlight')
        value = <mark>{value}</mark>
      if (mark.type === 'backgroundColor')
        value = <mark className={`wonderland-background-color-${mark.color}`}>{value}</mark>
      if (mark.type === 'link')
        value = <a href={mark.href} rel="nofollow noopener noreferrer" target="_blank">{value}</a>
      if (mark.type === 'color')
        value = <span className={`wonderland-text-color-${mark.color}`}>{value}</span>
      if (mark.type === 'textSize')
        value = <span className={`wonderland-text-size-${mark.size}`}>{value}</span>
    }
    return <span key={`${signature}-${occurrence}`}>{value}</span>
  })
}

function withOccurrenceKeys<T>(items: T[], prefix: string) {
  const occurrences = new Map<string, number>()
  return items.map((item) => {
    const signature = JSON.stringify(item)
    const occurrence = (occurrences.get(signature) ?? 0) + 1
    occurrences.set(signature, occurrence)
    return { item, key: `${prefix}-${signature.slice(0, 64)}-${occurrence}` }
  })
}
