# Organization profile README — how to publish

GitHub renders the organization overview at <https://github.com/object-digital-passport> from a
**dedicated repository** named `.github`, out of the file `profile/README.md`. That repository
[already exists](https://github.com/object-digital-passport/.github) and is public.

The source of truth is the copy in **this** repository, `.github/profile/README.md`, so the text is
edited alongside the docs it links to and the links can be checked in CI. Publishing means copying
that one file across.

## Sync it

```bash
# from a checkout of this repository
gh repo clone object-digital-passport/.github /tmp/odp-dot-github
mkdir -p /tmp/odp-dot-github/profile
cp .github/profile/README.md /tmp/odp-dot-github/profile/README.md
git -C /tmp/odp-dot-github add profile/README.md
git -C /tmp/odp-dot-github commit -m "Update the organization profile"
git -C /tmp/odp-dot-github push
```

Or paste the file through the web UI: **`.github` repo → `profile/README.md` → edit → commit to
`main`**. The org page picks it up on the next page load.

## Two things the org page needs besides this file

- **Pinned repositories.** The overview lists whatever is pinned, in pin order. Pin
  `specifications` first, then `object-digital-passport.github.io`. Private repositories
  cannot be pinned on a public org page — they show to members only.
- **Organization display name, avatar, and URL** live in **Settings → Profile**, not in this file.
  The website field should point at <https://object-digital-passport.github.io/>.

## When you change it

The README links to the protocol releases, the deployed registry manifest, the reference site and
the public repositories. Check the links and component statuses when a release, deployment or
repository changes, then re-sync the profile. Repository-relative links are checked by the `profile-links` job in
[`ci.yml`](../workflows/ci.yml); external links and the org page itself are not.
