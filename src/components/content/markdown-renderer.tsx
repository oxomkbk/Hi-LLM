import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'

import type { Components } from 'react-markdown'

interface MarkdownRendererProps {
  className?: string
  content: string
  demoteHeadings?: boolean
}

const SAFE_IMAGE_PROTOCOL = /^https?:$/
const DEMOTED_HEADINGS: Components = {
  h1: props => <h2 {...props} />,
  h2: props => <h3 {...props} />,
  h3: props => <h4 {...props} />,
  h4: props => <h5 {...props} />,
  h5: props => <h6 {...props} />,
}

export default function MarkdownRenderer({ className = '', content, demoteHeadings = false }: MarkdownRendererProps) {
  return (
    <div className={`markdown-prose ${className}`}>
      <ReactMarkdown
        components={{
          ...(demoteHeadings ? DEMOTED_HEADINGS : {}),
          a: ({ children, ...props }) => <a {...props} rel="nofollow noopener noreferrer" target="_blank">{children}</a>,
          img: ({ alt, src, title }) => (
            // Markdown 允许用户引用未知远程尺寸的图片，无法安全使用 next/image 的静态尺寸约束。
            // eslint-disable-next-line next/no-img-element
            <img title={title} alt={alt ?? ''} loading="lazy" referrerPolicy="no-referrer" src={src} />
          ),
        }}
        rehypePlugins={[[rehypeHighlight, { detect: false, plainText: ['plaintext', 'text'] }]]}
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url, key, _node) => {
          if (key === 'src') {
            if (url.startsWith('/api/files/'))
              return url
            try {
              return SAFE_IMAGE_PROTOCOL.test(new URL(url).protocol) ? url : ''
            }
            catch {
              return ''
            }
          }
          return defaultUrlTransform(url)
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
