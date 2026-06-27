# Deploying to GitHub Pages — checklist

Repository: <https://github.com/smigniot/TreeMakerWeb>
Expected site URL: **<https://smigniot.github.io/TreeMakerWeb/>**

Deployment is automated by `.github/workflows/deploy-pages.yml`: on every push to
`main` it builds the site and publishes it to GitHub Pages. The committed `dist/`
is for direct/manual hosting; CI rebuilds from source so Pages is always fresh.

## One-time setup (in the GitHub web UI)

- [ ] **Settings → Pages → Build and deployment → Source: “GitHub Actions”.**
      (Not “Deploy from a branch”.) This is required once; without it the deploy
      job fails with a Pages-not-enabled error.

## Each deploy

- [ ] Push to `main` (`git push origin main`).
      **No tag is required** — the workflow triggers on push to `main`.
      *(If a deploy doesn’t start: open the repo’s **Actions** tab and run
      “Deploy to GitHub Pages” via **Run workflow** (workflow_dispatch), or push
      another commit. To deploy from tags instead, change the `on:` trigger in
      the workflow.)*
- [ ] **Actions tab** → the “Deploy to GitHub Pages” run is green
      (both the `build` and `deploy` jobs succeed).
- [ ] The `deploy` job shows the published URL under its **github-pages**
      environment — it should be `https://smigniot.github.io/TreeMakerWeb/`.

## Verify the live site

- [ ] Open <https://smigniot.github.io/TreeMakerWeb/> — the toolbar and an empty
      paper appear.
- [ ] Click **Sample**, then **Scale Everything** → status shows “feasible”.
- [ ] Click **Build Crease Pattern** → mountain/valley creases render and the
      folded-form preview appears.
- [ ] Browser devtools **Console** has no errors (especially no failed
      `.wasm` / worker fetches → would indicate a path/MIME problem).
- [ ] (Optional) Hard-refresh once; GitHub’s CDN can serve a stale asset for a
      minute or two right after deploy.

## Notes / troubleshooting

- The build uses a **relative base** (`vite.config.ts` `base: './'`), so it works
  under the `/TreeMakerWeb/` sub-path with no extra config.
- It needs **no special headers** (single-threaded Wasm + a normal Web Worker —
  no cross-origin isolation), which GitHub Pages supports out of the box.
- First deploy can take a couple of minutes to go live after the run turns green.

## After you push (for Claude)

Once the site is live, you can authorize me to verify it from here — I’ll
`curl`/script against `https://smigniot.github.io/TreeMakerWeb/` (and its assets)
to confirm the HTML, JS, and `.wasm` are served correctly.
