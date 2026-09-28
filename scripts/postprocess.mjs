import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const SITE_ORIGIN = 'https://www.airswap.xyz'
const CUSTOM_DOMAIN = 'www.airswap.xyz'
const CDN_URL_PATTERN = /https:\/\/cdn\.prod\.website-files\.com\/[^\s"'()<>,&]+/g
const CDN_META_PATTERN = /(<meta\b[^>]*?\bcontent=")https:\/\/cdn\.prod\.website-files\.com(\/[^"]+)"/g
const CDN_PRECONNECT_PATTERN = /<link\b[^>]*href="https:\/\/cdn\.prod\.website-files\.com"[^>]*>/g
const MANGLED_STYLE_URL_PATTERN = /https:\/\/www\.airswap\.xyz\/&quot;(https?:\/\/[^&]+)&quot;/g
const NOT_FOUND_PAGE = '404.html'

const outDir = path.resolve(process.argv[2] ?? 'docs')

await stripQueryFromFileNames()
await localizeCdnAssets()
await makeCookieBannerDismissPersistent()
await makeNotFoundPageRootAbsolute()
await writeFile(path.join(outDir, 'CNAME'), `${CUSTOM_DOMAIN}\n`)
await writeFile(path.join(outDir, '.nojekyll'), '')

console.info(`Post-processed mirror in ${outDir}`)

// wget --restrict-file-names=windows saves "file.js?x=y" as "file.js@x=y"
async function stripQueryFromFileNames () {
  const files = await listFiles()
  const renames = files
    .filter(file => path.basename(file).includes('@'))
    .map(file => ({ from: file, to: file.slice(0, file.lastIndexOf('@')) }))

  for (const { from, to } of renames) {
    await rename(path.join(outDir, from), path.join(outDir, to))
  }

  await transformTextFiles(['.html'], content => renames.reduce(
    (result, { from, to }) => result.replaceAll(path.basename(from), path.basename(to)),
    content
  ))
}

async function localizeCdnAssets () {
  const urls = new Set()

  await transformTextFiles(['.html', '.css'], content => {
    const fixed = content.replace(MANGLED_STYLE_URL_PATTERN, '&quot;$1&quot;')
    for (const [url] of fixed.matchAll(CDN_URL_PATTERN)) urls.add(url)
    return fixed
  })

  for (const url of urls) await downloadAsset(url)

  await transformTextFiles(['.html', '.css'], (content, file) => {
    const fileDir = path.posix.dirname(`/${file.split(path.sep).join('/')}`)
    return content
      .replace(CDN_PRECONNECT_PATTERN, '')
      .replace(CDN_META_PATTERN, `$1${SITE_ORIGIN}$2"`)
      .replace(CDN_URL_PATTERN, url => path.posix.relative(fileDir, new URL(url).pathname))
  })
}

async function downloadAsset (url) {
  const target = path.join(outDir, decodeURIComponent(new URL(url).pathname))
  if (existsSync(target)) return

  const response = await fetch(url)
  if (!response.ok) {
    console.error(`Failed to download ${url}: ${response.status}`)
    return
  }

  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, Buffer.from(await response.arrayBuffer()))
  console.info(`Downloaded ${url}`)
}

// Finsweet's "close" action does not save a choice, so the banner returns on every visit.
// Treat only the banner's close button as a denial; preference-dialog close buttons remain unchanged.
async function makeCookieBannerDismissPersistent () {
  await transformTextFiles(['.html'], content => content.replace(
    /(<div fs-cc="banner"[\s\S]*?<a )fs-cc="close"/,
    '$1fs-cc="deny"'
  ))
}

// GitHub Pages serves 404.html at any missing path, so relative asset paths would break when nested.
async function makeNotFoundPageRootAbsolute () {
  const file = path.join(outDir, NOT_FOUND_PAGE)
  if (!existsSync(file)) return

  const content = await readFile(file, 'utf8')
  const updated = content
    .replace(/\b(src|href|poster|data-src)="([^"]+)"/g, (_, attr, value) => `${attr}="${toRootAbsolute(value)}"`)
    .replace(/\b(srcset|data-video-urls)="([^"]+)"/g, (_, attr, value) => {
      const entries = value.split(',').map(entry => entry.trim().replace(/^\S+/, toRootAbsolute))
      return `${attr}="${entries.join(', ')}"`
    })
    .replace(/url\((&quot;|["']?)([^)"'&]+)\1\)/g, (_, quote, value) => `url(${quote}${toRootAbsolute(value)}${quote})`)

  if (updated !== content) await writeFile(file, updated)
}

function toRootAbsolute (value) {
  if (/^([a-z]+:|\/|#)/i.test(value)) return value
  return `/${value}`
}

async function transformTextFiles (extensions, transform) {
  const files = (await listFiles()).filter(file => extensions.includes(path.extname(file)))

  for (const file of files) {
    const fullPath = path.join(outDir, file)
    const content = await readFile(fullPath, 'utf8')
    const updated = transform(content, file)
    if (updated !== content) await writeFile(fullPath, updated)
  }
}

async function listFiles () {
  const entries = await readdir(outDir, { recursive: true, withFileTypes: true })
  return entries
    .filter(entry => entry.isFile())
    .map(entry => path.relative(outDir, path.join(entry.parentPath, entry.name)))
}
