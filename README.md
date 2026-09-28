# AirSwap Website

A static mirror of [www.airswap.xyz](https://www.airswap.xyz), prepared for hosting with GitHub Pages.

## Requirements

- Node.js 20 or newer
- Yarn
- GNU Wget (`brew install wget` on macOS)

## Commands

```bash
# Refresh the mirror from the live site
yarn mirror

# Verify that required files and local asset references are valid
yarn verify

# Preview the mirrored site at http://localhost:8080
yarn preview
```

The generated website is stored in `docs/`. The mirror script downloads every page listed in the current sitemap, along with its assets, then post-processes references that Wget cannot localize by itself.

## How mirroring works

The core Wget command is:

```bash
wget \
  --mirror --page-requisites --convert-links --adjust-extension \
  --no-host-directories --span-hosts \
  --domains=www.airswap.xyz,cdn.prod.website-files.com,d3e54v103j8qbb.cloudfront.net \
  --restrict-file-names=windows --execute robots=off --wait=0.2 \
  --directory-prefix=docs \
  https://www.airswap.xyz/ \
  https://www.airswap.xyz/nft-marketplace \
  https://www.airswap.xyz/otc \
  https://www.airswap.xyz/privacy-policy \
  https://www.airswap.xyz/404 \
  https://www.airswap.xyz/sitemap.xml \
  https://www.airswap.xyz/robots.txt
```

Use `yarn mirror` instead of running this command directly. The complete script downloads into a temporary directory, then:

- Downloads assets referenced through `data-src`, `data-video-urls`, metadata, and inline styles.
- Rewrites CDN references to local files.
- Normalizes filenames containing URL query parameters.
- Makes 404-page assets root-relative so nested missing URLs work.
- Generates `CNAME` and `.nojekyll`.
- Verifies the completed mirror before replacing `docs/`.

If downloading or verification fails, the existing `docs/` directory is left unchanged.

## Updating the site

After publishing changes, run:

```bash
yarn mirror
yarn preview
```

Review the refreshed site locally, then commit the updated `docs/` files. GitHub Pages will deploy them after they are pushed.

The cookie-consent and Cookie3 analytics scripts remain external dependencies. Other hosted site assets are copied into this repository.
