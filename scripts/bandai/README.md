# Pulling Bandai TCG+ store events (run on your Mac)

Lists which LA-area stores run Gundam, Dragon Ball Super Fusion World, One
Piece, Union Arena, Digimon and Naruto events, on which nights, plus their
special events (regionals, championships, prereleases). It writes a summary
to `data/candidates/bandai-tcgplus.json`, which you commit; I turn it into map
pins and calendar rows.

**The one-time setup is about 5 minutes. Use your SECOND account.** Bandai's
terms forbid automated access (§7). This pull is deliberately light: about 2.5
seconds between requests and at most 150 requests per run.

## 1. Copy one request from your browser

1. In Chrome, open <https://www.bandai-tcg-plus.com/> and **log in with the
   second account**.
2. Open DevTools: View → Developer → Developer Tools, then the **Network** tab.
3. Go to the event search on the site and search for anything, e.g. Gundam
   near Los Angeles.
4. In the Network list, type `event/list` in the filter box. Right-click the
   request → **Copy** → **Copy as cURL**.
5. Paste it into a new file, e.g. `~/bandai-request.txt`, and save.

That file contains your session token, so keep it out of the repo and delete
it when you're done. The token expires on its own, too.

## 2. Probe once

From the repo folder (`git pull` first):

```
node scripts/bandai/pull.mjs --curl ~/bandai-request.txt --probe --games gundam
```

This makes **one** request and prints the shape of what came back. If it says
`found 0 event objects`, send me the printed key list (not the token) and I'll
adjust the parser.

## 3. Pull

```
node scripts/bandai/pull.mjs --curl ~/bandai-request.txt
```

Defaults: the next 90 days, within 60 miles of central LA, all six games.
Options: `--days 120`, `--miles 40`, `--lat 33.75 --lng -117.87` (Orange
County), `--games gundam,dbs_fusion`.

If you get `HTTP 401/403`, the copied request has expired. Copy a fresh one
(step 1.3–1.5) and run again.

## 4. Send it back

```
git add data/candidates/bandai-tcgplus.json
git commit -m "Bandai TCG+ pull $(date +%F)"
git push
```

Commit only that file. The raw responses in `bandai-pull/` stay on your Mac
and are gitignored.

## Upkeep

After the first pull, run it every few weeks with a longer window to catch
new regionals, championships and prereleases: `--days 120`.
