#!/usr/bin/env bash
# Upload out/* to release data-latest, gently (GitHub limits fast uploads).
# Files already there with the same size are skipped; manifest.json goes LAST
# so the app never sees a manifest that points to files not uploaded yet.
set -u
TAG=data-latest
gh release view "$TAG" >/dev/null 2>&1 || gh release create "$TAG" --title "Judgment data" \
  --notes "Search data for the app (auto-built weekly)." --latest=false
declare -A have
while read -r name size; do have["$name"]=$size; done < <(gh release view "$TAG" --json assets --jq '.assets[]|"\(.name) \(.size)"')
upload() {
  local f=$1 n tries=0
  n=$(basename "$f")
  [ "${have[$n]:-}" = "$(stat -c %s "$f")" ] && return 0
  until gh release upload "$TAG" "$f" --clobber >/dev/null 2>err.txt; do
    tries=$((tries + 1))
    if [ $tries -ge 8 ]; then cat err.txt; return 1; fi
    echo "retry $n ($tries): $(head -c 120 err.txt)"; sleep $((30 * tries))
  done
  sleep 2
}
fail=0
for f in out/*; do [ "$(basename "$f")" = manifest.json ] || upload "$f" || fail=1; done
[ $fail -eq 0 ] || { echo "some uploads failed; manifest NOT updated"; exit 1; }
upload out/manifest.json || exit 1
# remove assets that are no longer produced
gh release view "$TAG" --json assets --jq '.assets[].name' | while read -r a; do
  [ -f "out/$a" ] || { gh release delete-asset "$TAG" "$a" -y; sleep 2; }
done
echo "published $(ls out | wc -l) files"
