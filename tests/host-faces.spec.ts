import { describe, expect, it } from 'vitest'
import {
  DEFAULT_JSON_BODY_LIMIT,
  readJsonBody,
  RequestBodyTooLargeError,
  readBody,
} from '../src/host-faces.ts'

type Chunk = string | Uint8Array

function request(chunks: Chunk[], headers?: Record<string, string>) {
  let reads = 0
  return {
    headers,
    get readCount() {
      return reads
    },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        reads += 1
        yield chunk
      }
    },
  }
}

describe('bounded JSON request bodies', () => {
  it('accepts a body exactly at the configured UTF-8 byte limit', async () => {
    const body = JSON.stringify({ value: 'é'.repeat(10) })
    const limit = Buffer.byteLength(body)
    const result = await readJsonBody(request([body]), { maxBytes: limit })

    expect(result).toEqual({ ok: true, body: { value: 'é'.repeat(10) } })
  })

  it('rejects a body one byte over the limit across chunks and stops consuming', async () => {
    const req = request(['{"value":"', '12345', 'still unread'])
    const result = await readJsonBody(req, { maxBytes: 14 })

    expect(result).toEqual({ ok: false, status: 413, error: 'request body too large' })
    expect(req.readCount).toBe(2)
  })

  it('uses the actual byte count regardless of missing or malformed Content-Length', async () => {
    const body = JSON.stringify({ value: 'x'.repeat(DEFAULT_JSON_BODY_LIMIT + 1) })
    for (const headers of [undefined, { 'content-length': 'broken' }]) {
      const result = await readJsonBody(request([body], headers))
      expect(result).toEqual({ ok: false, status: 413, error: 'request body too large' })
    }
  })

  it('reports malformed JSON separately from a size rejection', async () => {
    await expect(readJsonBody(request(['{invalid']))).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'invalid JSON body',
    })
  })

  it('reports stream failures as invalid request bodies', async () => {
    const req = {
      async *[Symbol.asyncIterator]() {
        yield '{'
        throw new Error('stream failed')
      },
    }

    await expect(readJsonBody(req)).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'invalid JSON body',
    })
  })

  it('readBody throws a typed error at the first chunk that crosses its limit', async () => {
    const req = request(['1234', '56', 'unread'])

    await expect(readBody(req, { maxBytes: 5 })).rejects.toBeInstanceOf(RequestBodyTooLargeError)
    expect(req.readCount).toBe(2)
  })
})
