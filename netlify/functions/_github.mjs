/**
 * Shared GitHub helpers for the admin Functions.
 * --------------------------------------------------------------------
 * One commit, multiple files: this writes a new tree + commit + ref
 * update so that "add image + update stock.json" lands as a single
 * deploy on Netlify rather than two back-to-back rebuilds.
 *
 * Requires three env vars set on the Netlify site:
 *   GH_TOKEN   — Personal Access Token with `Contents: read/write` on the repo
 *   GH_OWNER   — GitHub username or org (e.g. "ohmsi")
 *   GH_REPO    — repo name (e.g. "retrotype-site")
 *   GH_BRANCH  — branch to commit to (defaults to "main")
 */
import { Octokit } from '@octokit/rest';

const {
  GH_TOKEN,
  GH_OWNER,
  GH_REPO,
  GH_BRANCH = 'main',
} = process.env;

export function octokit() {
  if (!GH_TOKEN || !GH_OWNER || !GH_REPO) {
    throw new Error('Missing GH_TOKEN, GH_OWNER or GH_REPO env vars on Netlify');
  }
  return new Octokit({ auth: GH_TOKEN });
}

export const repo = { owner: GH_OWNER, repo: GH_REPO, branch: GH_BRANCH };

/**
 * Read a file's JSON content from the repo at HEAD of the configured branch.
 * @param {string} path repo-relative path, e.g. "src/data/stock.json"
 * @returns {Promise<any>} parsed JSON
 */
export async function readJson(path) {
  const o = octokit();
  const res = await o.repos.getContent({
    owner: GH_OWNER,
    repo:  GH_REPO,
    path,
    ref:   GH_BRANCH,
  });
  // .content is base64-encoded
  const decoded = Buffer.from(res.data.content, 'base64').toString('utf8');
  return JSON.parse(decoded);
}

/**
 * Commit one or more files in a single commit on the configured branch.
 * @param {Array<{path: string, content: string|Buffer, encoding?: 'utf-8' | 'base64'}>} files
 * @param {string} message
 */
export async function commitFiles(files, message) {
  const o = octokit();
  const owner = GH_OWNER, repo = GH_REPO;

  // 1. What does the branch currently point at?
  const refRes = await o.git.getRef({ owner, repo, ref: `heads/${GH_BRANCH}` });
  const headSha = refRes.data.object.sha;

  // 2. Get the tree of that commit so we can build on it.
  const commitRes = await o.git.getCommit({ owner, repo, commit_sha: headSha });
  const baseTreeSha = commitRes.data.tree.sha;

  // 3. Create a blob per file.
  const blobs = await Promise.all(files.map(async (f) => {
    const isBinary = Buffer.isBuffer(f.content);
    const blob = await o.git.createBlob({
      owner, repo,
      content:  isBinary ? f.content.toString('base64') : String(f.content),
      encoding: isBinary ? 'base64' : 'utf-8',
    });
    return { path: f.path, mode: '100644', type: 'blob', sha: blob.data.sha };
  }));

  // 4. Compose a new tree based on the current one, with our blobs slotted in.
  const tree = await o.git.createTree({
    owner, repo,
    base_tree: baseTreeSha,
    tree:      blobs,
  });

  // 5. Make the commit.
  const newCommit = await o.git.createCommit({
    owner, repo,
    message,
    tree:    tree.data.sha,
    parents: [headSha],
  });

  // 6. Move the branch ref forward.
  await o.git.updateRef({
    owner, repo,
    ref: `heads/${GH_BRANCH}`,
    sha: newCommit.data.sha,
  });

  return newCommit.data.sha;
}

/**
 * Make a string safe to use as a filename.
 */
export function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
