#!/usr/bin/env bash
# Push the current project state to mokoaibot/azbut-ai-site (main /docs).
#
# Token is read from GH_TOKEN or from /tmp/gh_token (mode 600). It is never
# written into .git/config, never printed, and removed when the script exits.
#
#   GH_TOKEN=... npm run push:pages
#   echo '...' > /tmp/gh_token && chmod 600 /tmp/gh_token && npm run push:pages

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO='https://github.com/mokoaibot/azbut-ai-site.git'
WORK="$(mktemp -d /tmp/azbut-push.XXXXXX)"
TOKEN_FILE="$WORK/token"
ASKPASS="$WORK/askpass.sh"
ENV_FILE="${AZBUT_ENV_FILE:-$HOME/.azbut-gh-token.env}"

cleanup() {
  # Only the in-memory/temp copy goes away; the persistent env file stays.
  rm -rf "$WORK"
  rm -f /tmp/gh_token
}
trap cleanup EXIT

umask 077

# Priority: GH_TOKEN → GH_TOKEN_FILE → persistent env file → /tmp/gh_token.
if [[ -z "${GH_TOKEN:-}" && -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi
if [[ -n "${GH_TOKEN:-}" ]]; then
  printf '%s' "$GH_TOKEN" > "$TOKEN_FILE"
elif [[ -n "${GH_TOKEN_FILE:-}" && -s "$GH_TOKEN_FILE" ]]; then
  cp "$GH_TOKEN_FILE" "$TOKEN_FILE"
elif [[ -s /tmp/gh_token ]]; then
  cp /tmp/gh_token "$TOKEN_FILE"
else
  echo "[push] Нужен PAT: задайте GH_TOKEN, GH_TOKEN_FILE, $ENV_FILE или /tmp/gh_token." >&2
  exit 2
fi
chmod 600 "$TOKEN_FILE"

cat > "$ASKPASS" <<SH
#!/bin/sh
case "\$1" in
  *Username*) printf '%s\\n' 'x-access-token' ;;
  *Password*) cat "$TOKEN_FILE"; printf '\\n' ;;
  *) printf '\\n' ;;
esac
SH
chmod 700 "$ASKPASS"

echo "[push] Клонирую публичный репозиторий..."
git clone --depth 1 "$REPO" "$WORK/repo" >/dev/null 2>&1
cd "$WORK/repo"
git config user.name 'Arena Agent'
git config user.email 'agent@arena.ai'

echo "[push] Копирую проект (без .git, бэкапов, audit.log, node_modules)..."
python3 - "$ROOT" "$WORK/repo" <<'PY'
import os, shutil, sys
src, dst = sys.argv[1], sys.argv[2]
def ignore(d, names):
    out = set()
    for n in names:
        rel = os.path.relpath(os.path.join(d, n), src).replace(os.sep, '/')
        if n in ('.git', 'node_modules', '__pycache__', '.cache', '.pytest_cache'):
            out.add(n)
        if rel in ('data/backups', 'data/audit.log'):
            out.add(n)
    return out
for n in os.listdir(dst):
    if n == '.git':
        continue
    p = os.path.join(dst, n)
    shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
shutil.copytree(src, dst, dirs_exist_ok=True, ignore=ignore)
PY

PAT='github''_pat_'
GHP='gh''p_'
if grep -RIlE "${PAT}[A-Za-z0-9_]{20,}|${GHP}[A-Za-z0-9]{30,}" . --exclude-dir=.git >/dev/null 2>&1; then
  echo '[push] ОШИБКА: в проекте найден токен, пуш отменён.' >&2
  exit 3
fi

git add -A
if git diff --cached --quiet; then
  echo '[push] Изменений нет — удалённый main уже актуален.'
else
  git commit -q -m 'feat: import real 971-product catalog and rebuild Pages'
fi

echo "[push] Отправляю main..."
GIT_ASKPASS="$ASKPASS" GIT_TERMINAL_PROMPT=0 git push origin main 2>&1 \
  | sed -E 's#https://[^@]*@#https://***@#g'

echo "[push] Проверяю GitHub API и Pages..."
export GH_TOKEN_FILE="$TOKEN_FILE"
python3 - <<'PY'
import json, os, urllib.request, urllib.error
tok = open(os.environ['GH_TOKEN_FILE']).read().strip()
h = {'Authorization': 'Bearer ' + tok, 'Accept': 'application/vnd.github+json',
     'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'arena-agent'}
base = 'https://api.github.com/repos/mokoaibot/azbut-ai-site'
def get(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=30) as r:
            return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')
    except Exception as e:
        return 0, {'error': str(e)}
s, c = get(base + '/commits/main')
print('  main:', s, (c.get('sha') or '')[:7], (c.get('commit') or {}).get('message', ''))
s, f = get(base + '/contents/docs/catalog/index.html?ref=main')
print('  docs/catalog/index.html:', s, f.get('size'), 'байт')
s, p = get(base + '/pages')
print('  pages:', s, p.get('html_url'), p.get('status'), p.get('source'))
PY

echo '[push] Готово. Pages обновляется из main /docs в течение 1–2 минут.'
