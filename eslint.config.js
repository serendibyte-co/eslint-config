import { node } from './node.js'
import { react } from './react.js'

export default [
  ...node({ tsconfigRootDir: import.meta.dirname, files: ['test/node-sample.ts'] }),
  ...react({ tsconfigRootDir: import.meta.dirname, files: ['test/react-sample.tsx'] }),
]
