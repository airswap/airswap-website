import { readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const REQUIRED_FILES = ['index.html', '404.html', 'CNAME', '.nojekyll']
const REMOTE_HOST_PATTERN = /cdn\.prod\.website-files\.com\/|d3e54v103j8qbb\.cloudfront\.net\/js\//g
const EXTERNAL_REF_PATTERN = /^([a-z]+:|\/\/|#)/i
const REF_PATTERNS = [
  /\b(?:src|href|poster|data-src)="([^"]+)"/g,
  /url\((?:&quot;|["'])?([^)"'&]+)(?:&quot;|["'])?\)/g
]
const REF_LIST_PATTERN = /\b(?:srcset|data-video-urls)="([^"]+)"/g

const outDir = path.resolve(process.argv[2] ?? 'docs')

const errors = [
  ...REQUIRED_FILES
    .filter(file => !existsSync(path.join(outDir, file)))
    .map(file => `Missing required file: ${file}`),
  ...await findReferenceErrors()
]

if (errors.length > 0) {
  errors.forEach(error => console.error(error))
  process.exit(1)
}

console.info(`Verified mirror in ${outDir}`)

async function findReferenceErrors () {
  const entries = await readdir(outDir, { recursive: true, withFileTypes: true })
  const files = entries
    .filter(entry => entry.isFile() && ['.html', '.css'].includes(path.extname(entry.name)))
    .map(entry => path.join(entry.parentPath, entry.name))

  const results = await Promise.all(files.map(async file => {
    const content = await readFile(file, 'utf8')
    const label = path.relative(outDir, file)
    const remoteErrors = [...content.matchAll(REMOTE_HOST_PATTERN)]
      .map(([match]) => `${label}: still references remote asset host ${match}`)
    const missingErrors = extractRefs(content)
      .filter(ref => !EXTERNAL_REF_PATTERN.test(ref))
      .filter(ref => !existsSync(resolveRef(ref, file)))
      .map(ref => `${label}: broken local reference ${ref}`)
    return [...remoteErrors, ...missingErrors]
  }))

  return results.flat()
}

function extractRefs (content) {
  const refs = REF_PATTERNS.flatMap(pattern => [...content.matchAll(pattern)].map(([, ref]) => ref))
  const listRefs = [...content.matchAll(REF_LIST_PATTERN)]
    .flatMap(([, value]) => value.split(',').map(entry => entry.trim().split(/\s+/)[0]))
  return [...refs, ...listRefs].filter(Boolean)
}

function resolveRef (ref, fromFile) {
  const cleanRef = decodeURIComponent(ref.replace(/[?#].*$/, ''))
  if (cleanRef.startsWith('/')) return path.join(outDir, cleanRef)
  return path.join(path.dirname(fromFile), cleanRef)
}
