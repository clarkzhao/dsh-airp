import { resolve } from 'node:path'
import { loadPack, isError } from '../pack/pack.ts'

const target = process.argv[2]
if (!target) {
  console.error('usage: pack-validate <pack-dir>')
  process.exit(2)
}

const loaded = await loadPack(resolve(target))
const errors = loaded.diagnostics.filter(isError)
const warnings = loaded.diagnostics.filter((d) => !isError(d))
for (const d of loaded.diagnostics) {
  const level = (d.severity ?? 'error').toUpperCase()
  console.log(`${level} ${d.code}: ${d.message}`)
}
if (!loaded.ok || errors.length) {
  console.error(`FAIL ${target} (${errors.length} error, ${warnings.length} warning)`)
  process.exit(1)
}
console.log(`OK ${loaded.canon?.meta.id ?? target} (${warnings.length} warning)`)
