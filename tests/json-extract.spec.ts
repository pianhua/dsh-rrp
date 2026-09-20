import { describe, expect, it } from 'vitest'
import { extractFirstJsonObject } from '../src/json-extract.ts'

describe('extractFirstJsonObject', () => {
  it('parses a plain JSON object', () => {
    expect(extractFirstJsonObject('{"a":1,"b":[2,3]}')).toEqual({ a: 1, b: [2, 3] })
  })

  it('unwraps markdown code fences', () => {
    expect(extractFirstJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(extractFirstJsonObject('```\n{"a":1}\n```')).toEqual({ a: 1 })
  })

  it('tolerates surrounding prose', () => {
    expect(extractFirstJsonObject('好的，结果如下：\n{"a":1}\n以上。')).toEqual({ a: 1 })
    expect(extractFirstJsonObject('结果：{"a":1} 完毕')).toEqual({ a: 1 })
  })

  it('repairs a reply truncated mid-object (dangling tail dropped)', () => {
    const recovered = extractFirstJsonObject('{"characters": {}, "flags": {"a": 1, "b:')
    expect(recovered).toEqual({ characters: {}, flags: { a: 1 } })
  })

  it('repairs a reply truncated inside the final array', () => {
    const recovered = extractFirstJsonObject('{"goal":"逃离","turningPoints":["夜宿客栈","枯河')
    expect(recovered).toEqual({ goal: '逃离', turningPoints: ['夜宿客栈'] })
  })

  it('repairs a reply cut right after the last value', () => {
    expect(extractFirstJsonObject('{"a":1,"b":2')).toEqual({ a: 1, b: 2 })
  })

  it('returns undefined for garbage', () => {
    expect(extractFirstJsonObject('没有 JSON')).toBeUndefined()
    expect(extractFirstJsonObject('{ not json }')).toBeUndefined()
    expect(extractFirstJsonObject('')).toBeUndefined()
  })
})

describe('trailing-comma tolerance (testing-round hardening)', () => {
  it('drops stray commas before closers, nested included', () => {
    expect(extractFirstJsonObject('{"a":1,}')).toEqual({ a: 1 })
    expect(extractFirstJsonObject('{"a":[1,2,],}')).toEqual({ a: [1, 2] })
    expect(extractFirstJsonObject('```json\n{"a":{"b":2,},}\n```')).toEqual({ a: { b: 2 } })
  })

  it('leaves commas inside string literals alone', () => {
    expect(extractFirstJsonObject('{"a":"x,}y",}')).toEqual({ a: 'x,}y' })
  })
})
