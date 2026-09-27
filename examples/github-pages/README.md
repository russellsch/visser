# Publish an Explain export to GitHub Pages

This folder holds an example workflow, `publish.yml.example`. It is disabled by default. Explain never publishes anything by itself (§13.5).

## Procedure

1. Export the site with the public audience:

   ```sh
   explain export --collection docs/explanations/collection.json \
     --format site --audience public --out site
   ```

   The export stops with `E_PRIVATE_EXPORT` if a document has `visibility: private`, or if a source comes from a repository that is not in `publicRepositories` in your user config (`~/.explain/config.json`). Add `--allow-private-content` only after you review the listed material.

2. Read the export report. Open `site/index.html` and read each page.
3. Commit the `site/` folder.
4. Copy `publish.yml.example` to `.github/workflows/publish.yml` in your repository.
5. Verify each pinned action SHA against the release tag in the comment next to it. The SHAs in this example are not verified.
6. In the repository settings, set the GitHub Pages source to "GitHub Actions".
7. Start the workflow by hand from the Actions tab.

## Limits of a static host

- The pages use relative URLs, so they work under a project path such as `https://OWNER.github.io/REPO/`.
- A meta element cannot set `frame-ancestors`. GitHub Pages does not let you set response headers, so other sites can frame the pages.
- A host or proxy that changes JavaScript breaks Subresource Integrity. The reader script then does not run, and Mermaid pages show their failure notice. The text of each page stays readable.
- A public site cannot enforce the access controls of a private source repository. Excerpts in the export are public after you deploy them.

The workflow has `contents: read`, `pages: write`, and `id-token: write` permissions only. It does not install Explain, build documents, or read secrets.
