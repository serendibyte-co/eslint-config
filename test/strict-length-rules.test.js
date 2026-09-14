import { describe, expect, it } from 'bun:test'

import { strictLengthRules } from '../base.js'

describe('strictLengthRules', () => {
  it('defaults to warn, 300 lines per file, 50 per function', () => {
    expect(strictLengthRules()).toEqual({
      'max-lines': ['warn', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 50, skipBlankLines: true, skipComments: true }],
    })
  })

  it('relaxes the per-function ceiling to 150 for tsx', () => {
    expect(strictLengthRules({ tsx: true })['max-lines-per-function'][1].max).toBe(150)
  })

  it('threads severity through both rules', () => {
    const rules = strictLengthRules({ severity: 'error' })
    expect(rules['max-lines'][0]).toBe('error')
    expect(rules['max-lines-per-function'][0]).toBe('error')
  })
})
