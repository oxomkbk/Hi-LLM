import 'server-only'

import { Buffer } from 'node:buffer'
import { lookup } from 'node:dns/promises'
import { request } from 'node:https'

import { normalizePublicHttpsUrl } from '@/lib/security'

import { isPublicIpAddress } from './public-address'

import type { LookupAddress } from 'node:dns'

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const REQUEST_TIMEOUT_MS = 10_000

export interface PublicResource {
  body: Buffer
  contentType: string
  finalUrl: string
}

export class PublicResourceError extends Error {
  constructor(message: string, readonly code = 'RESOURCE_FETCH_FAILED') {
    super(message)
  }
}

export async function fetchPublicResource(inputUrl: string, options: {
  accept: string
  maxBytes: number
  maxRedirects?: number
  timeoutMs?: number
}) {
  let currentUrl = normalizePublicHttpsUrl(inputUrl)
  const maxRedirects = options.maxRedirects ?? 3

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const resource = await requestOnce(currentUrl, options)
    if (!resource.redirect)
      return { body: resource.body, contentType: resource.contentType, finalUrl: currentUrl }
    if (redirectCount === maxRedirects)
      throw new PublicResourceError('网站跳转次数过多', 'RESOURCE_TOO_MANY_REDIRECTS')
    currentUrl = normalizePublicHttpsUrl(new URL(resource.redirect, currentUrl).toString())
  }

  throw new PublicResourceError('网站读取失败')
}

async function requestOnce(url: string, options: { accept: string, maxBytes: number, timeoutMs?: number }) {
  const parsed = new URL(url)
  const addresses = await lookup(parsed.hostname, { all: true, verbatim: true }).catch(() => [])
  if (!addresses.length || addresses.some(item => !isPublicIpAddress(item.address)))
    throw new PublicResourceError('网站地址不可公开访问', 'RESOURCE_PRIVATE_ADDRESS')
  const pinned = addresses[0]!

  return new Promise<{
    body: Buffer
    contentType: string
    redirect: string | null
  }>((resolve, reject) => {
    const clientRequest = request(parsed, {
      headers: {
        'Accept': options.accept,
        'Accept-Encoding': 'identity',
        'User-Agent': 'HiLLM-NAV-MetadataBot/1.0',
      },
      lookup: (_hostname, lookupOptions, callback) => {
        if (typeof lookupOptions === 'object' && lookupOptions.all) {
          const allCallback = callback as unknown as (
            error: NodeJS.ErrnoException | null,
            addresses: LookupAddress[],
          ) => void
          allCallback(null, [pinned])
          return
        }
        const singleCallback = callback as unknown as (
          error: NodeJS.ErrnoException | null,
          address: string,
          family: number,
        ) => void
        singleCallback(null, pinned.address, pinned.family)
      },
      method: 'GET',
    }, (response) => {
      const status = response.statusCode ?? 0
      const location = response.headers.location
      if (REDIRECT_STATUSES.has(status) && location) {
        response.resume()
        resolve({ body: Buffer.alloc(0), contentType: '', redirect: location })
        return
      }
      if (status < 200 || status >= 300) {
        response.resume()
        reject(new PublicResourceError(`网站返回 HTTP ${status}`, 'RESOURCE_HTTP_ERROR'))
        return
      }

      const declaredLength = Number(response.headers['content-length'] || 0)
      if (declaredLength > options.maxBytes) {
        response.destroy()
        reject(new PublicResourceError('网站响应内容过大', 'RESOURCE_TOO_LARGE'))
        return
      }

      const chunks: Buffer[] = []
      let size = 0
      response.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > options.maxBytes) {
          response.destroy(new PublicResourceError('网站响应内容过大', 'RESOURCE_TOO_LARGE'))
          return
        }
        chunks.push(chunk)
      })
      response.on('end', () => resolve({
        body: Buffer.concat(chunks),
        contentType: String(response.headers['content-type'] || '').toLowerCase(),
        redirect: null,
      }))
      response.on('error', reject)
    })

    clientRequest.setTimeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS, () => {
      clientRequest.destroy(new PublicResourceError('网站响应超时', 'RESOURCE_TIMEOUT'))
    })
    clientRequest.on('error', reject)
    clientRequest.end()
  })
}
